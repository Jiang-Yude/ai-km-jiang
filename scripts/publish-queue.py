#!/usr/bin/env python3
"""官網待部署佇列（2026-10-09 立）：跨代理、跨機器都能跑的一支 CLI。

為什麼：待部署文章一直靠主知識庫「🌐 官網看板」的「🚀待部署」卡人工排隊，1900 多行的看板裡
要人翻；多篇同時排隊時 sitemap 互撞、只能一篇上完再處理下一篇。這支把「等待上線的分支」
變成一份機器可讀的佇列，依序呼叫 merge-publish.sh 上線，狀態回寫看板一個固定區塊。
Claude Code 那邊另有一個 Mod 面板（只讀本佇列顯示，不執行部署）；Codex、筆電、人工都直接用本 CLI。

佇列檔放主知識庫（iCloud 同步，桌機筆電都看得到）：
  $HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/江昱德 主知識庫/_agent/tools/site-publish-queue/queue.json
  可用環境變數 SITE_PUBLISH_QUEUE_FILE 覆蓋（例：測試）。

用法：
  publish-queue.py add --branch article/<slug> --message "深度文章上線：…" [--slug <slug>] [--note "…"]
  publish-queue.py list                       人看的表
  publish-queue.py status --json              機器讀（Mod、看板同步）
  publish-queue.py hold <id> / release <id>   暫停／恢復排隊
  publish-queue.py remove <id> [--reason …]   從佇列拿掉（不刪分支）
  publish-queue.py deploy-next [--dry-run] --authorized-by "…"   便宜模型用這個：一個指令跑到上線並驗收，最後一行「下一步：…」照念
  publish-queue.py run [<id>|--next|--all] --authorized-by "江江 2026-10-09 23:10 原話" [--dry-run] [--desk <main工作區>] [--here]
                                              依序呼叫 merge-publish.sh；這一步就是正式上線，只在江江說「部署」後跑，授權原話寫進紀錄
  publish-queue.py set-primary <host>         指定主要部署機（兩台同時 run 有短暫互蓋窗口，預設只讓一台跑；別台加 --here）
  publish-queue.py board-sync                 把佇列狀態寫進官網看板「🚀 待部署」的自動區塊（marker 包住，重跑整段替換）
  publish-queue.py prune [--days 7]           清掉 done 超過 N 天的紀錄

run 的前置檢查（任一不過就不呼叫 merge-publish）：分支要在 origin 上（別台機器才拿得到）、主工作區要在 main
且乾淨、沒有別的 git 程序在動（index.lock）。merge-publish 自己會排發布鎖，這裡不另外搶鎖。
誠實邊界：佇列檔在 iCloud。同一台機器的寫入用 flock 互斥、每程序自己的暫存檔；跨機器 iCloud 不傳 flock，
靠 run 領取時「狀態條件寫入」重驗、主要部署機預設只一台、merge-publish 的發布鎖與 publish.sh「永遠部署 origin/main 最新」收斂。
兩台在同一分鐘各自 run 仍有短暫互蓋窗口（publish.sh 註解有寫），所以才設主要部署機。
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import socket
import subprocess
import sys
import fcntl
from contextlib import contextmanager
from pathlib import Path

HOME = Path.home()
KB = HOME / "Library/Mobile Documents/iCloud~md~obsidian/Documents/江昱德 主知識庫"
QUEUE_FILE = Path(os.environ.get("SITE_PUBLISH_QUEUE_FILE") or (KB / "_agent/tools/site-publish-queue/queue.json"))
BOARD_FILE = Path(os.environ.get("SITE_PUBLISH_BOARD_FILE") or (KB / "00 工作台/🌐 官網看板.md"))
REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DESK = Path(os.environ.get("SITE_PUBLISH_DESK") or (HOME / "Documents/repo-workspace/ai-km-jiang"))
LOG_DIR = Path(os.environ.get("SITE_PUBLISH_LOG_DIR") or (HOME / ".cache/ai-km-jiang/queue-logs"))
MARK_START = "<!-- publish-queue:start（自動生成，勿手改；來源＝_agent/tools/site-publish-queue/queue.json，指令 scripts/publish-queue.py） -->"
MARK_END = "<!-- publish-queue:end -->"
TZ = dt.timezone(dt.timedelta(hours=8))
STATUSES = ("queued", "held", "deploying", "done", "failed")
# 結束碼（給便宜模型照念，不用推理）：0 上線且驗收通過；2 用法／環境錯；10 被閘門擋下（修好重跑）；
# 20 需要人或強模型判斷（內容衝突、手寫生成檔、分支分歧；本工具絕不自動合併）；30 已 push 但部署或驗收未完成。
EXIT_OK, EXIT_USAGE, EXIT_BLOCKED, EXIT_JUDGMENT, EXIT_PUSHED_UNVERIFIED = 0, 2, 10, 20, 30


NOTIFY_CTX: dict = {}   # run／deploy 真的要上線時才填（dry-run 不通知）


def notify_failure(code: int, next_step: str) -> None:
    """部署失敗通知（2026-10-21 立，事故驅動：10:04 到 12:24 部署一直失敗，沒有任何警報，是江江自己發現卡住）。
    ①追加一行到 failures.jsonl（之後的排程或 agent 可讀來補推手機）②跳 macOS 本機通知（同朵拉海巡台 notify.sh 做法）。
    手機推播不在腳本裡做：非互動 claude -p 的 PushNotification 要 Remote Control 開著才送得到（2026-10-20 實測），
    所以由執行部署的 agent 看到非 0 結束碼時自己推播（規則見 knowledge-site-manager 06）。
    SITE_PUBLISH_NOTIFY=0 全關；=log 只寫 failures.jsonl、不跳通知（測試用）。"""
    mode = os.environ.get("SITE_PUBLISH_NOTIFY", "1")
    if not NOTIFY_CTX or mode == "0":
        return
    rec = {"at": now(), "exit": code, "host": socket.gethostname().split(".")[0], "next": next_step, **NOTIFY_CTX}
    channel = "none"
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        if mode == "log":
            raise RuntimeError("log-only")
        title = f"官網部署失敗（結束碼 {code}）"
        body = next_step[:150].replace("\\", "").replace('"', "'")
        r = subprocess.run(["osascript", "-e", f'display notification "{body}" with title "{title}"'],
                           capture_output=True, timeout=10)
        channel = "local" if r.returncode == 0 else "none"
    except Exception:
        pass
    rec["notify"] = channel
    try:
        with (LOG_DIR / "failures.jsonl").open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
    except OSError:
        pass
    print(f"🔔 部署失敗已通知：本機通知 {'已跳出' if channel == 'local' else '沒跳出'}；紀錄 {LOG_DIR / 'failures.jsonl'}。手機推播要由執行部署的 agent 自己送。")


def finish(code: int, next_step: str) -> None:
    """最後一行固定「下一步：…」白話句，然後以約定結束碼離開。非 0 且是真的上線時先通知。"""
    if code != EXIT_OK:
        notify_failure(code, next_step)
    print(f"下一步：{next_step}")
    sys.exit(code)


def now() -> str:
    return dt.datetime.now(TZ).strftime("%Y-%m-%d %H:%M")


def load() -> dict:
    if not QUEUE_FILE.exists():
        return {"version": 1, "items": []}
    try:
        data = json.loads(QUEUE_FILE.read_text("utf-8"))
    except json.JSONDecodeError as e:
        sys.exit(f"⛔ 佇列檔不是合法 JSON：{QUEUE_FILE}（{e}）。不自動覆寫，先人工修。")
    data.setdefault("items", [])
    return data


@contextmanager
def locked():
    """同一台機器上的寫入互斥（Codex R1 第 5 條）。跨機器 iCloud 不會傳 flock，那層靠 run 前重讀與領取重驗。"""
    QUEUE_FILE.parent.mkdir(parents=True, exist_ok=True)
    lock_path = QUEUE_FILE.with_suffix(".lock")
    with open(lock_path, "w") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fh, fcntl.LOCK_UN)


def save(data: dict) -> None:
    QUEUE_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = QUEUE_FILE.with_name(f".{QUEUE_FILE.name}.{os.getpid()}.tmp")   # 每個程序自己的暫存檔，不互撞
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", "utf-8")
    os.replace(tmp, QUEUE_FILE)


def new_id(items: list[dict]) -> str:
    stamp = dt.datetime.now(TZ).strftime("%Y%m%d-%H%M")
    base, n = stamp, 1
    taken = {i["id"] for i in items}
    while f"{base}-{n:02d}" in taken:
        n += 1
    return f"{base}-{n:02d}"


def find(data: dict, ident: str) -> dict:
    for it in data["items"]:
        if it["id"] == ident or it.get("slug") == ident or it["branch"] == ident:
            return it
    sys.exit(f"⛔ 佇列裡沒有：{ident}（用 list 看 id／slug／branch）")


def git(desk: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(desk), *args], text=True, capture_output=True, check=check)


def branch_on_origin(desk: Path, branch: str) -> str | None:
    r = git(desk, "ls-remote", "--heads", "origin", branch, check=False)
    if r.returncode != 0:
        return None
    return r.stdout.split()[0] if r.stdout.strip() else ""


# ───────────────────────── 子指令 ─────────────────────────
def cmd_add(a) -> None:
    with locked():
        data = load()
        if not re.match(r"^[A-Za-z0-9._/-]+$", a.branch):
            sys.exit("⛔ 分支名只收英數、點、底線、斜線、連字號")
        for it in data["items"]:
            if it["branch"] == a.branch and it["status"] in ("queued", "held", "deploying"):
                sys.exit(f"⛔ 這個分支已在佇列（{it['id']}，狀態 {it['status']}）")
        slug = a.slug or a.branch.split("/")[-1]
        item = {
            "id": new_id(data["items"]),
            "branch": a.branch,
            "slug": slug,
            "message": a.message,
            "note": a.note or "",
            "status": "queued",
            "added_at": now(),
            "added_by": socket.gethostname().split(".")[0],
            "history": [],
        }
        data["items"].append(item)
        save(data)
    print(f"✅ 已加入佇列 {item['id']}：{a.branch}")
    print(f"   佇列檔：{QUEUE_FILE}")
    print("   提醒：分支要 push 到 origin，別台機器才部署得到（run 會檢查）。")


def cmd_list(a) -> None:
    data = load()
    items = data["items"]
    if not items:
        print("（佇列是空的）")
        return
    order = {s: i for i, s in enumerate(("deploying", "queued", "held", "failed", "done"))}
    for it in sorted(items, key=lambda i: (order.get(i["status"], 9), i["id"])):
        mark = {"queued": "⏳", "held": "⏸", "deploying": "🚧", "done": "✅", "failed": "❌"}.get(it["status"], "?")
        line = f"{mark} {it['id']}  {it['status']:<9} {it['branch']}  ｜ {it['message']}"
        if it.get("note"):
            line += f"  ｜ {it['note']}"
        if it.get("last_result"):
            line += f"  ｜ {it['last_result']}"
        print(line)
    pend = [i for i in items if i["status"] in ("queued", "held")]
    print(f"\n等待中 {len(pend)} 筆（queued {sum(i['status']=='queued' for i in pend)}、held {sum(i['status']=='held' for i in pend)}）；佇列檔 {QUEUE_FILE}")


def status_payload() -> dict:
    data = load()
    items = data["items"]
    counts = {s: sum(i["status"] == s for i in items) for s in STATUSES}
    return {"queue_file": str(QUEUE_FILE), "generated_at": now(), "counts": counts, "items": items}


def cmd_status(a) -> None:
    p = status_payload()
    if a.json:
        print(json.dumps(p, ensure_ascii=False))
    else:
        print(" ".join(f"{k}={v}" for k, v in p["counts"].items()))


def _set_status(ident: str, status: str, note: str | None = None, result: str | None = None, expect: tuple | None = None) -> dict:
    with locked():
        data = load()
        it = find(data, ident)
        if expect is not None and it["status"] not in expect:
            sys.exit(f"⛔ {it['id']} 狀態已被別處改成 {it['status']}（預期 {'/'.join(expect)}），不領取，重新 list 再決定")
        it["history"].append({"at": now(), "from": it["status"], "to": status, "by": socket.gethostname().split(".")[0]})
        it["status"] = status
        if note is not None:
            it["note"] = note
        if result is not None:
            it["last_result"] = result
        save(data)
    return it


def cmd_hold(a) -> None:
    it = _set_status(a.id, "held", note=a.reason)
    print(f"⏸ {it['id']} 已暫停排隊")


def cmd_release(a) -> None:
    it = _set_status(a.id, "queued")
    print(f"⏳ {it['id']} 已恢復排隊")


def cmd_remove(a) -> None:
    with locked():
        data = load()
        it = find(data, a.id)
        if it["status"] == "deploying":
            sys.exit("⛔ 這筆正在部署中，不能移除；等它結束。")
        data["items"] = [i for i in data["items"] if i["id"] != it["id"]]
        save(data)
    print(f"🗑 {it['id']} 已從佇列移除（分支 {it['branch']} 未動）{'：' + a.reason if a.reason else ''}")


def cmd_prune(a) -> None:
    with locked():
        data = load()
        cutoff = dt.datetime.now(TZ) - dt.timedelta(days=a.days)
        keep, gone = [], []
        for it in data["items"]:
            done_at = next((h["at"] for h in reversed(it.get("history", [])) if h["to"] == "done"), None)
            if it["status"] == "done" and done_at and dt.datetime.strptime(done_at, "%Y-%m-%d %H:%M").replace(tzinfo=TZ) < cutoff:
                gone.append(it)
            else:
                keep.append(it)
        data["items"] = keep
        save(data)
    print(f"🧹 清掉 {len(gone)} 筆 done 超過 {a.days} 天的紀錄")


def cmd_set_primary(a) -> None:
    with locked():
        data = load()
        data["primary_host"] = a.host.strip() or None
        save(data)
    print(f"主要部署機＝{a.host.strip() or '（未設，任一台都可 run）'}；這台是 {socket.gethostname().split('.')[0]}")


def resolve_ref(desk: Path, branch: str, local: str, origin_sha: str):
    """與 merge-publish.sh 同一套三態判準（Codex R2 第 3 條）：回 (ref, 說明) 或以 20／10 結束。"""
    if local and origin_sha:
        if local == origin_sha:
            return branch, ""
        anc = lambda a, b: git(desk, "merge-base", "--is-ancestor", a, b, check=False).returncode == 0
        if anc(branch, f"origin/{branch}"):
            return f"origin/{branch}", f"本地 {branch} 落後 origin，會用 origin 版"
        if anc(f"origin/{branch}", branch):
            return branch, f"本地 {branch} 比 origin 新（還沒 push），會用本地版；別台拿不到"
        finish(EXIT_JUDGMENT, f"本地 {branch} 與 origin/{branch} 分歧（各自有對方沒有的 commit）。到施工桌 git pull origin {branch} 合併後 push。請換 Sonnet 或 Opus 接手。")
    if local:
        return branch, f"{branch} 只在本機、沒 push 到 origin；別台拿不到"
    return f"origin/{branch}", f"本地沒有 {branch}，會用 origin 版"


def preflight_desk(desk: Path) -> None:
    if not (desk / ".git").exists():
        finish(EXIT_USAGE, f"主工作區不是 git repo：{desk}。用 --desk 指定 main 所在的工作區，或先 clone 官網 repo。")
    br = git(desk, "symbolic-ref", "--quiet", "--short", "HEAD", check=False).stdout.strip()
    if br != "main":
        finish(EXIT_BLOCKED, f"主工作區 {desk} 不在 main（在 {br or 'detached'}）。請換 Sonnet 或 Opus 接手切回 main，或用 --desk 指到 main 桌子。")
    if (Path(git(desk, "rev-parse", "--git-dir").stdout.strip()) / "index.lock").exists():
        finish(EXIT_BLOCKED, "主工作區有 index.lock，別的 git 程序正在動它。等一分鐘再跑同一個指令。")
    # 2026-10-21：與已追蹤檔內容相同的未追蹤複製檔（macOS「檔名 2.webp」）只警告不擋，判斷共用 scripts/git-dirty.py。
    # 主工作區是舊版、還沒有 git-dirty.py 時退回原本的 git status 判斷。
    checker = desk / "scripts/git-dirty.py"
    if checker.exists():
        r = subprocess.run([sys.executable, str(checker)], cwd=str(desk), text=True, capture_output=True)
        if r.stderr.strip():
            print(r.stderr.strip())
        dirty = r.stdout if r.returncode != 0 else ""
    else:
        dirty = git(desk, "-c", "core.quotePath=false", "status", "--porcelain").stdout
    if dirty.strip():
        print("⛔ 主工作區不乾淨（可能是別人的在途工作，不碰）：\n" + dirty)
        finish(EXIT_BLOCKED, "主工作區有別人未提交的變更，不能上線。請換 Sonnet 或 Opus 接手，確認是誰的工作再決定。")


def resolve_desk(a, data: dict) -> Path:
    """部署現場（2026-10-21 立）：優先序 --desk ＞ 環境變數 SITE_PUBLISH_DESK ＞ 佇列設定 desk_path ＞ 主 clone。
    desk_path 存「相對家目錄」的路徑（兩台機器帳號名不同），用 set-desk 切換；切回主 clone 就 set-desk ""。
    這就是「專用發布桌」的單一開關，退回不必改程式（AGENTS 機制切換要留得回去）。"""
    if a.desk:
        return Path(a.desk).expanduser()
    if os.environ.get("SITE_PUBLISH_DESK"):
        return Path(os.environ["SITE_PUBLISH_DESK"]).expanduser()
    rel = (data.get("desk_path") or "").strip()
    return HOME / rel if rel else DEFAULT_DESK


def cmd_set_desk(a) -> None:
    rel = a.path.strip()
    if rel.startswith("/"):
        sys.exit("⛔ desk_path 要寫相對家目錄的路徑（例 Developer/ai-km-jiang-publish-desk），不寫含帳號名的絕對路徑")
    with locked():
        data = load()
        data["desk_path"] = rel or None
        save(data)
    target = HOME / rel if rel else DEFAULT_DESK
    print(f"部署現場＝{target}{'（主 clone）' if not rel else ''}；這台{'有' if (target / '.git').exists() else '還沒有'}這個 repo")


def changed_files(desk: Path, ref: str) -> set[str]:
    """這一筆相對 origin/main 改到哪些檔（判斷後面的項目跟它有沒有交集用）。算不出來回 None＝判斷不出來。"""
    base = git(desk, "merge-base", "origin/main", ref, check=False).stdout.strip()
    if not base:
        return None
    r = git(desk, "-c", "core.quotePath=false", "diff", "--name-only", base, ref, check=False)
    return set(l for l in r.stdout.splitlines() if l.strip()) if r.returncode == 0 else None


def main_health(desk: Path, log: Path) -> bool:
    """某筆在 push 前被擋之後，檢查「main 自己」能不能過 preflight 與建置預演（2026-10-21 立）。
    過＝問題在那一筆，隔離它、其餘照跑；不過＝main 本身或環境壞了，整條佇列停（v3 企劃第 2 件）。"""
    with log.open("a", encoding="utf-8") as fh:
        fh.write(f"\n===== {now()} main 健康檢查 =====\n")
        fh.flush()
        # 先對齊遠端最新 main 再檢查（阿港審 2026-10-21）：清理會把本機退回 squash 前，那可能比遠端舊，
        # 拿舊的好版本檢查會誤判「main 健康」，漏掉別人剛推上去的壞 commit。
        git(desk, "fetch", "--quiet", "origin", check=False)
        if git(desk, "merge", "--ff-only", "--quiet", "origin/main", check=False).returncode != 0:
            fh.write("本機 main 無法快轉到 origin/main，當作不健康\n")
            return False
        for cmd in (["bash", "scripts/preflight.sh"], ["bash", "scripts/cloudflare/rehearse-build.sh", "main 健康檢查"]):
            if not (desk / cmd[1]).exists():
                continue
            if subprocess.run(cmd, cwd=str(desk), stdout=fh, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL).returncode != 0:
                return False
    return True


WORKLOG_BOARD = Path(os.environ.get("SITE_PUBLISH_WORKLOG_BOARD") or (KB / "00 工作台/📓 工作日誌看板.md"))
WORKLOG_MARK = "部署台自動紀錄"
WEEKDAY = "一二三四五六日"


def worklog_line(it: dict, outcome: str, detail: str) -> None:
    """上線或失敗後，在 📓 工作日誌看板當天欄位自動寫一行（2026-10-21 江江選 A：自動一行就算數）。
    Stop hook check-worklog.py 看到當天有本標記的行，就不再要求部署類任務另寫工作日記。
    SITE_PUBLISH_WORKLOG_BOARD=0 關閉（測試用）。寫不進去只印警告，不影響部署結果。"""
    if os.environ.get("SITE_PUBLISH_WORKLOG_BOARD") == "0":
        return
    try:
        if not WORKLOG_BOARD.exists():
            print(f"⚠️  找不到工作日誌看板 {WORKLOG_BOARD}，略過自動紀錄")
            return
        t = dt.datetime.now(TZ)
        header = f"## {t:%m-%d} {WEEKDAY[t.weekday()]}"
        line = (f"- [ ] {t:%H:%M} ｜ 官網部署：{it['slug']} {outcome}｜{it['message']} #工作日記\n"
                f"    {detail}（{WORKLOG_MARK} {t:%Y-%m-%d %H:%M}，佇列 {it['id']}，授權：{it.get('authorized_by', '')}）\n")
        text = WORKLOG_BOARD.read_text("utf-8")
        if header + "\n" in text:
            pos = text.index(header + "\n") + len(header) + 1
            new = text[:pos] + "\n" + line + text[pos:].lstrip("\n") if text[pos:pos + 1] == "\n" else text[:pos] + line + text[pos:]
        else:
            m = re.search(r"^## ", text, flags=re.M)
            pos = m.start() if m else len(text)
            new = text[:pos] + header + "\n\n" + line + "\n" + text[pos:]
        tmp = WORKLOG_BOARD.with_name(f".{WORKLOG_BOARD.name}.{os.getpid()}.tmp")
        tmp.write_text(new, "utf-8")
        os.replace(tmp, WORKLOG_BOARD)
    except OSError as e:
        print(f"⚠️  工作日誌看板自動紀錄沒寫進去：{e}")


def cmd_run(a) -> None:
    data = load()
    desk = resolve_desk(a, data)
    # 授權不是 CLI 能代替的（Codex R1 第 1 條）：run 是正式上線，要帶江江當輪的授權原話，寫進紀錄；沒帶就不跑。
    a.authorized_by = (a.authorized_by or os.environ.get("SITE_PUBLISH_AUTHORIZED_BY") or "")
    if not a.dry_run and not a.authorized_by.strip():
        finish(EXIT_USAGE, "run／deploy-next 要帶 --authorized-by \"江江 YYYY-MM-DD HH:MM 原話\"（或環境變數 SITE_PUBLISH_AUTHORIZED_BY）。只想看會跑什麼：加 --dry-run。")
    # 主要部署機（Codex R1 第 4 條）：兩台同時 run 仍有「舊部署最後完成」的窄窗，預設只讓一台跑；別台要明說 --here。
    primary = data.get("primary_host")
    me = socket.gethostname().split(".")[0]
    if not primary and not a.dry_run:
        finish(EXIT_USAGE, f"佇列還沒指定主要部署機。先在要負責部署的那台跑一次：python3 scripts/publish-queue.py set-primary {me}")
    if primary and primary != me and not a.here and not a.dry_run:
        finish(EXIT_BLOCKED, f"佇列設定主要部署機＝{primary}，這台是 {me}。到 {primary} 跑，或確定只有這台在部署時加 --here。")
    if a.id:
        targets = [find(data, a.id)]
    else:
        # 2026-10-21：deploy-next／run --all 一次處理「授權當下」佇列裡的全部 queued（固定清單，之後新加的不算在這次授權裡）
        targets = [i for i in data["items"] if i["status"] == "queued"]
        if not a.all and not getattr(a, "batch", False):
            targets = targets[:1]
    if not targets:
        finish(EXIT_OK, "佇列沒有等待部署的項目，不用做事。")
    if not a.dry_run:
        NOTIFY_CTX.update({"items": [f"{t['id']} {t['branch']}" for t in targets], "authorized_by": a.authorized_by.strip()})
    for it in targets:
        if it["status"] not in ("queued", "failed"):
            finish(EXIT_BLOCKED, f"{it['id']} 狀態是 {it['status']}，不能部署；只跑 queued（或指定 id 重試 failed）。")
    preflight_desk(desk)
    git(desk, "fetch", "--quiet", "origin", check=False)
    script = desk / "scripts/merge-publish.sh"
    if not script.exists():
        finish(EXIT_USAGE, f"找不到 {script}，這台的官網 repo 不完整。")
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    print(f"▶ 部署現場：{desk}；本次授權涵蓋 {len(targets)} 筆：{'、'.join(t['slug'] for t in targets)}")
    done, returned, paused = [], [], []
    blocked_files: list[tuple[str, set | None]] = []   # 退回那幾筆改到的檔
    for it in targets:
        sha = branch_on_origin(desk, it["branch"])
        if sha is None:
            finish(EXIT_BLOCKED, "問不到 origin（網路或 GitHub 認證問題）。確認網路後重跑同一個指令。")
        local = git(desk, "rev-parse", "--verify", "--quiet", f"refs/heads/{it['branch']}", check=False).stdout.strip()
        if not sha and not local:
            msg = f"分支 {it['branch']} 不在 origin 也不在本機。到施工的那台或 worktree 跑 git push -u origin {it['branch']} 再重跑。"
            print(f"❌ {it['id']} {it['branch']}：origin 與本機都沒有這個分支。")
            if not a.dry_run:
                _set_status(it["id"], "failed", result="分支不在 origin 也不在本機；到施工的 clone git push -u origin 再 run")
                cmd_board_sync(argparse.Namespace(quiet=True))
            returned.append((it, EXIT_BLOCKED, msg))
            blocked_files.append((it["slug"], set()))   # 沒有分支就沒有檔案，不連坐別人
            continue
        ref, note = resolve_ref(desk, it["branch"], local, sha)
        if note:
            print(f"⚠️  {it['id']} {note}")
        mine = changed_files(desk, ref)
        clash = [s for s, fs in blocked_files if fs is None or mine is None or (fs & mine)]
        if clash and not a.dry_run:
            why = f"跟退回的 {'、'.join(clash)} 改到同一批檔（或判斷不出來），先暫停，等前面修好再 release"
            print(f"⏸ {it['id']} {it['slug']}：{why}")
            _set_status(it["id"], "held", note=why)
            cmd_board_sync(argparse.Namespace(quiet=True))
            paused.append(it)
            blocked_files.append((it["slug"], mine))   # 暫停的也算：A 撞 B、B 撞 C 時 C 一起停（阿港審 2026-10-21）
            continue
        print(f"▶ {'[dry-run] ' if a.dry_run else ''}{it['id']} {it['branch']}（merge 用 {ref}）")
        if a.dry_run:
            # dry-run 只讀：分叉點、分支有沒有手寫生成檔，與 merge-publish 同判準；不寫佇列狀態
            fp = git(desk, "merge-base", "HEAD", ref, check=False).stdout.strip()
            if not fp:
                finish(EXIT_JUDGMENT, f"算不出 main 與 {ref} 的分叉點（分支可能已上線過一次）。請換 Sonnet 或 Opus 接手判斷。")
            chk = subprocess.run(["node", str(desk / "scripts/check-branch-generated.mjs"), fp, ref], cwd=str(desk), text=True, capture_output=True)
            if chk.returncode != 0:
                print(chk.stderr.strip())
                finish(EXIT_JUDGMENT, f"分支 {it['branch']} 直接手寫了生成檔，要先在分支跑 --adopt。請換 Sonnet 或 Opus 接手。")
            if chk.stdout.strip():
                print(f"   （分支夾帶生成檔 {chk.stdout.strip().replace(chr(10), '、')}，上線時會還原重建，不算錯）")
            continue
        it["authorized_by"] = a.authorized_by.strip()
        kind, code, step = _run_one(a, it, desk, me, script)
        if kind == "ok":
            done.append(it)
            continue
        if kind == "item":
            returned.append((it, code, step))
            blocked_files.append((it["slug"], mine))
            continue
        # common／pushed：整條停下，剩下的照舊 queued
        rest = [t["slug"] for t in targets if t is not it and t not in done and t not in paused and all(t is not r[0] for r in returned)]
        tail = f"；未跑的 {'、'.join(rest)} 留在佇列" if rest else ""
        finish(code, step + tail)
    if a.dry_run:
        finish(EXIT_OK, f"dry-run 通過，{len(targets)} 筆前置檢查都過，沒有真的上線。真的要上：江江說「部署」後，同一個指令去掉 --dry-run 並加 --authorized-by。")
    summary = f"上線 {len(done)} 筆" + (f"（{'、'.join(t['slug'] for t in done)}）" if done else "")
    if returned or paused:
        worst = max([c for _, c, _ in returned] or [EXIT_BLOCKED])
        parts = [summary]
        if returned:
            parts.append(f"退回 {len(returned)} 筆：" + "；".join(f"{t['slug']}（{s}）" for t, _, s in returned))
        if paused:
            parts.append(f"暫停 {len(paused)} 筆（跟退回的改到同檔）：{'、'.join(t['slug'] for t in paused)}")
        finish(worst, "。".join(parts))
    finish(EXIT_OK, f"{summary}，正式站驗收通過（網址 200）。看板自動區塊與工作日誌看板已更新。")


def _cause(seg: list[str]) -> str:
    """從本輪 log 挑最具體的失敗原因：先找第一個 ❌ 檢查項，再找 Error:，最後才用 ⛔ 收尾句。"""
    for pat in ("CONFLICT (", "  ❌ ", "Error:", "⛔"):
        for l in seg:
            if pat in l and "preflight 未過" not in l and "publish.sh 在 push 前停下" not in l and "失敗退出" not in l:
                return l.strip()
    return next((l for l in reversed(seg) if l.strip()), "").strip()


def _run_one(a, it, desk, me, script):
    """跑一筆，回 (kind, 結束碼, 下一步句)。kind：ok／item（該筆自己的問題，隔離它）／common（main 或環境壞了，整條停）／pushed（已 push 未完成且重試失敗）。"""
    cmd = ["bash", str(script), it["branch"], it["message"]]
    log = LOG_DIR / f"{it['id']}.log"
    # 領取時重驗（Codex R1 第 5 條）：剛才 load 的狀態可能已被別台改掉，領取用狀態條件寫入
    _set_status(it["id"], "deploying", result=f"開始 {now()}｜授權：{a.authorized_by.strip()}｜機器 {me}", expect=("queued", "failed"))
    cmd_board_sync(argparse.Namespace(quiet=True))
    marker = f"===== {now()} run {it['id']} {it['branch']} ====="
    with log.open("a", encoding="utf-8") as fh:
        fh.write(f"\n{marker}\n")
        fh.flush()
        rc = subprocess.run(cmd, cwd=str(desk), stdout=fh, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL).returncode
    # 只看本輪那一段（Codex R2 第 1 條：舊 log 不能污染判斷），push 成功的證據＝publish.sh 印的 PUBLISH_PUSHED 收據
    try:
        seg = log.read_text("utf-8", errors="replace").split(marker)[-1].splitlines()
    except OSError:
        seg = []
    tail = next((l for l in reversed(seg) if l.startswith(("🟢", "⛔", "❌"))), seg[-1] if seg else "")
    pushed = next((l for l in seg if l.startswith("PUBLISH_PUSHED ")), "")
    cause = _cause(seg)
    if rc == 0:
        head = git(desk, "rev-parse", "--short", "HEAD", check=False).stdout.strip()
        _set_status(it["id"], "done", result=f"{now()} 上線 main {head}｜{tail[:120]}")
        print(f"✅ {it['id']} 上線完成（main {head}）")
        worklog_line(it, f"上線 main {head}", "部署台跑完、正式站驗收 200")
        cmd_board_sync(argparse.Namespace(quiet=True))
        return ("ok", EXIT_OK, "")
    if pushed:
        # 已 push：改動已在 main，不能當沒上線跳過。自動只重部署一次（publish.sh --redeploy）。
        sha7 = pushed.split()[1][:7]
        print(f"↻ {it['id']} 已 push（{sha7}）但部署或驗收沒完成，自動重新部署一次…")
        with log.open("a", encoding="utf-8") as fh:
            fh.write(f"\n===== {now()} redeploy {it['id']} =====\n")
            fh.flush()
            rc2 = subprocess.run(["bash", "scripts/publish.sh", "--redeploy"], cwd=str(desk), stdout=fh, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL).returncode
        if rc2 == 0:
            head = git(desk, "rev-parse", "--short", "HEAD", check=False).stdout.strip()
            _set_status(it["id"], "done", result=f"{now()} 上線 main {head}（第一次部署失敗，自動重部署成功）")
            print(f"✅ {it['id']} 重新部署後上線完成（main {head}）")
            worklog_line(it, f"上線 main {head}", "第一次部署失敗、自動重新部署後驗收 200")
            cmd_board_sync(argparse.Namespace(quiet=True))
            return ("ok", EXIT_OK, "")
        stage = "已 push、部署或驗收未完成，自動重部署也失敗；佇列已停"
        _set_status(it["id"], "failed", result=f"{now()} exit {rc}｜{stage}｜{cause[:160]}")
        worklog_line(it, "已 push 但沒部署成功", f"{stage}｜{cause[:80]}")
        cmd_board_sync(argparse.Namespace(quiet=True))
        step = (f"需要人處理：{it['slug']} 已推上 main（{sha7}），但部署或驗收失敗、自動重試一次也失敗（{cause[:60]}）。"
                f"遠端 main 已含這筆，正式站還是上一版。目前沒有人接手：請換 Sonnet 或 Opus 看 {log}，修好後在發布桌跑 bash scripts/publish.sh --redeploy。")
        return ("pushed", EXIT_PUSHED_UNVERIFIED, step)
    # push 前被擋：先看 main 自己健不健康，分辨「該筆的問題」還是「main／環境壞了」
    healthy = main_health(desk, log)
    if healthy:
        code = EXIT_JUDGMENT if rc == 20 else EXIT_BLOCKED
        stage = "需要判斷的衝突，遠端 main 未變、本機已還原" if rc == 20 else "push 前被閘門擋下，遠端 main 未變、本機已還原"
        _set_status(it["id"], "failed", result=f"{now()} exit {rc}｜{stage}｜{cause[:160]}")
        worklog_line(it, "退回", f"{stage}｜{cause[:80]}")
        print(f"❌ {it['id']} 退回：{cause}\n   {stage}；main 本身健康，其餘照常\n   完整 log：{log}")
        cmd_board_sync(argparse.Namespace(quiet=True))
        return ("item", code, f"{it['slug']} 退回：{cause[:70]}。等施工這個分支的 AI 修（目前沒有人接手），修好後 release 再部署")
    stage = "main 本身或部署環境過不了檢查，佇列已停"
    _set_status(it["id"], "queued", result=f"{now()} 沒跑成：{stage}｜{cause[:160]}")
    worklog_line(it, "沒跑成（main 或環境壞了）", f"{stage}｜{cause[:80]}")
    cmd_board_sync(argparse.Namespace(quiet=True))
    return ("common", EXIT_BLOCKED,
            f"需要人處理：main 本身或部署環境過不了檢查（{cause[:60]}），不是 {it['slug']} 的問題，整條佇列已停。這次沒有推任何東西上 main、正式站沒動。"
            f"目前沒有人接手：請換 Sonnet 或 Opus 看 {log} 的「main 健康檢查」段。")


def render_board_block() -> str:
    p = status_payload()
    items = p["items"]
    lines = [MARK_START, f"- 佇列同步時間 {p['generated_at']}｜等待 {p['counts']['queued']}、暫停 {p['counts']['held']}、部署中 {p['counts']['deploying']}、失敗 {p['counts']['failed']}｜加入：`python3 scripts/publish-queue.py add --branch article/<slug> --message \"…\"`；上線（江江說部署後）：`python3 scripts/publish-queue.py deploy-next --authorized-by \"江江 時間 原話\"`（結束碼 0 才算上線）"]
    order = {s: i for i, s in enumerate(("deploying", "queued", "held", "failed", "done"))}
    shown = [i for i in items if i["status"] != "done"] + [i for i in items if i["status"] == "done"][-5:]
    for it in sorted(shown, key=lambda i: (order.get(i["status"], 9), i["id"])):
        mark = {"queued": "⏳", "held": "⏸", "deploying": "🚧", "done": "✅", "failed": "❌"}.get(it["status"], "?")
        box = "[x]" if it["status"] == "done" else "[ ]"
        extra = f"｜{it['note']}" if it.get("note") else ""
        res = f"｜{it['last_result']}" if it.get("last_result") else ""
        lines.append(f"- {box} {mark} `{it['id']}` **{it['slug']}**｜`{it['branch']}`｜{it['message']}{extra}{res}（{it['added_at']} 由 {it['added_by']} 加入）")
    if len(lines) == 2:
        lines.append("- （佇列目前是空的）")
    lines.append(MARK_END)
    return "\n".join(lines)


def cmd_board_sync(a) -> None:
    if not BOARD_FILE.exists():
        print(f"⚠️  找不到官網看板：{BOARD_FILE}，略過看板同步", file=sys.stderr)
        return
    text = BOARD_FILE.read_text("utf-8")
    block = render_board_block()
    if MARK_START in text and MARK_END in text:
        s = text.index(MARK_START)
        e = text.index(MARK_END) + len(MARK_END)
        new = text[:s] + block + text[e:]
    else:
        m = re.search(r"^## 🚀 待部署\s*$", text, flags=re.M)
        if not m:
            print("⚠️  看板沒有「## 🚀 待部署」標題，略過看板同步", file=sys.stderr)
            return
        insert_at = m.end()
        new = text[:insert_at] + "\n\n" + block + "\n" + text[insert_at:]
    if new != text:
        tmp = BOARD_FILE.with_suffix(".md.tmp")
        tmp.write_text(new, "utf-8")
        os.replace(tmp, BOARD_FILE)
        if not getattr(a, "quiet", False):
            print(f"✅ 看板自動區塊已更新：{BOARD_FILE}")
    elif not getattr(a, "quiet", False):
        print("看板自動區塊已是最新")


def main() -> None:
    ap = argparse.ArgumentParser(description="官網待部署佇列")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("add"); s.add_argument("--branch", required=True); s.add_argument("--message", required=True); s.add_argument("--slug"); s.add_argument("--note"); s.set_defaults(f=cmd_add)
    s = sub.add_parser("list"); s.set_defaults(f=cmd_list)
    s = sub.add_parser("status"); s.add_argument("--json", action="store_true"); s.set_defaults(f=cmd_status)
    s = sub.add_parser("hold"); s.add_argument("id"); s.add_argument("--reason"); s.set_defaults(f=cmd_hold)
    s = sub.add_parser("release"); s.add_argument("id"); s.set_defaults(f=cmd_release)
    s = sub.add_parser("remove"); s.add_argument("id"); s.add_argument("--reason"); s.set_defaults(f=cmd_remove)
    s = sub.add_parser("run"); s.add_argument("id", nargs="?"); s.add_argument("--next", action="store_true"); s.add_argument("--all", action="store_true"); s.add_argument("--dry-run", action="store_true"); s.add_argument("--desk"); s.add_argument("--authorized-by", help="江江當輪授權原話與時間，寫進紀錄；沒帶不跑"); s.add_argument("--here", action="store_true", help="佇列設了主要部署機時，仍在這台跑"); s.set_defaults(f=cmd_run)
    for name, hint in (("deploy-next", "部署佇列裡下一筆（＝run --next，一個指令跑到上線並驗收）"), ("deploy", "部署指定 id（＝run <id>）")):
        s = sub.add_parser(name, help=hint)
        if name == "deploy":
            s.add_argument("id")
        s.add_argument("--dry-run", action="store_true"); s.add_argument("--desk"); s.add_argument("--authorized-by"); s.add_argument("--here", action="store_true")
        s.set_defaults(f=cmd_run, next=name == "deploy-next", all=False, batch=name == "deploy-next", **({"id": None} if name == "deploy-next" else {}))
    s = sub.add_parser("board-sync"); s.set_defaults(f=cmd_board_sync, quiet=False)
    s = sub.add_parser("set-desk", help="部署現場（相對家目錄；空字串＝主 clone）"); s.add_argument("path"); s.set_defaults(f=cmd_set_desk)
    s = sub.add_parser("set-primary"); s.add_argument("host", help="主要部署機的 hostname -s（空字串＝取消）"); s.set_defaults(f=cmd_set_primary)
    s = sub.add_parser("prune"); s.add_argument("--days", type=int, default=7); s.set_defaults(f=cmd_prune)
    a = ap.parse_args()
    a.f(a)


if __name__ == "__main__":
    main()
