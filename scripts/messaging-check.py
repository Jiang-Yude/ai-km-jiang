#!/usr/bin/env python3
"""對外講法漂移健檢：檢查網站的對外自我介紹有沒有跟真相脫節。

立因（2026-08-25）：官網 AI 導覽還在推「免費安裝 AI 辦公室」，但那東西 8/19 就改成
個人陪跑的交付內容了。同一份接待腳本被人工抄在多個檔案，改一份另外幾份不會跟著動，
漂移將近三個月沒人發現。

三個機械檢查：
  1. 禁用詞掃描      掃到已停用的講法就報 FAIL，附檔名與行號
  2. 版本標記齊全    下游副本要標「抄的是哪一版」，缺的、彼此不一致、或一個檔裡有
                     兩種標記，都算 FAIL
  3. 上游版本比對    跟上游 repo 最新 commit 比，上游動了就提醒有人來看

多站設計：站台清單在 scripts/messaging-sites/sites.conf，一行一站。
加一個客戶站只要加一行 + 一個設定資料夾，不用改這支程式。

用法：
  python3 scripts/messaging-check.py            # 跑清單裡所有站
  python3 scripts/messaging-check.py --site 代號 # 只跑一站
  python3 scripts/messaging-check.py --root 路徑 # 覆寫站台根目錄（配 --site，測試用）

exit code 三態（2026-08-26 依 Codex 跨家審意見改，原本只有 0/1 會「假全綠」）：
  0  全部檢查都跑完，而且通過
  1  發現漂移，或設定本身有錯
  2  有檢查沒跑完（GitHub API 連不上、必要站不在這台機器），沒發現漂移但不算綠

發現問題只回報，不自動修（照官網巡檢既有原則）。
"""
import argparse
import glob
import json
import os
import re
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(HERE)
SITES_DIR = os.path.join(HERE, "messaging-sites")
SITES_CONF = os.path.join(SITES_DIR, "sites.conf")

# 版本標記：抓 commit 後面的 7～40 碼十六進位，容忍中間夾 <code> 標籤、全形空白、冒號
COMMIT_RE = re.compile(r"commit[\s:：]*(?:<code>)?\s*([0-9a-f]{7,40})", re.I)
SHA_FULL_RE = re.compile(r"^[0-9a-f]{40}$")
SITE_CODE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
GLOB_CHARS = ("*", "?", "[")
# 設定檔裡不准出現的寫死家目錄開頭（換機器必失效）
HARDCODED_HOME_RE = re.compile(r"^/(Users|home)/[^/]+/")


def expand(path):
    """展開 $HOME 與 ~。不准寫死家目錄實體路徑，換機器會失效。"""
    return os.path.expanduser(os.path.expandvars(path))


def read_conf_lines(path):
    """讀設定檔，去掉 # 註解與空行。

    回傳 (內容清單, 錯誤字串)。檔案不存在回 (None, None)；讀得到但讀不動
    （權限、編碼壞掉）回 (None, 原因) —— 這種要當設定錯誤報，不能讓它整支 traceback。
    """
    if not os.path.exists(path):
        return None, None
    try:
        with open(path, encoding="utf-8") as f:
            raw_lines = f.read().splitlines()
    except (OSError, UnicodeDecodeError) as e:
        return None, "讀不到設定檔 %s：%s" % (path, e)
    out = [l.strip() for l in raw_lines if l.strip() and not l.strip().startswith("#")]
    return out, None


def load_sites():
    """讀站台清單。回傳 (站台清單, 錯誤清單)。"""
    lines, err = read_conf_lines(SITES_CONF)
    if err:
        return None, [err]
    if lines is None:
        return None, ["找不到站台清單：%s" % SITES_CONF]

    sites, errors, seen_codes = [], [], set()
    for line in lines:
        parts = [p.strip() for p in line.split("|")]
        if len(parts) != 5:
            errors.append("sites.conf 格式錯誤（要五欄：代號|根目錄|上游|必要性|說明）：%s" % line[:70])
            continue
        code, root_raw, upstream, presence, desc = parts

        if not SITE_CODE_RE.match(code) or ".." in code:
            errors.append("站台代號不合法（只能用英數與 . _ -，不能有 ..）：%s" % code[:40])
            continue
        if code in seen_codes:
            errors.append("站台代號重複：%s" % code)
            continue
        seen_codes.add(code)

        if presence not in ("required", "optional"):
            errors.append("站台 %s 的必要性欄要填 required 或 optional，現在是：%s" % (code, presence[:20]))
            continue

        if root_raw == ".":
            root = REPO_ROOT
        else:
            if HARDCODED_HOME_RE.match(root_raw):
                errors.append("站台 %s 的根目錄寫死了家目錄（換機器會失效），改用 $HOME/…：%s" % (code, root_raw))
                continue
            root = expand(root_raw)
            if "$" in root:
                errors.append("站台 %s 的根目錄有展不開的變數：%s" % (code, root_raw))
                continue

        sites.append({
            "code": code,
            "root": root,
            "upstream": None if upstream == "-" else upstream,
            "required": presence == "required",
            "desc": desc,
            "conf": os.path.join(SITES_DIR, code),
        })
    return sites, errors


def safe_join(site_root, entry):
    """把設定檔裡的一筆路徑接到站台根目錄底下，並確認沒有逃出去。

    回傳 (完整路徑, 錯誤字串)。擋絕對路徑與 ../ ——「限縮掃描範圍」是這套設計的
    核心保證，逃得出去就等於沒限縮。
    """
    if os.path.isabs(entry):
        return None, "設定裡不准用絕對路徑（範圍必須在站台根目錄內）：%s" % entry
    full = os.path.normpath(os.path.join(site_root, entry))
    root_real = os.path.realpath(site_root)
    full_real = os.path.realpath(full)
    if full_real != root_real and not full_real.startswith(root_real + os.sep):
        return None, "設定裡的路徑跑到站台根目錄外面了：%s" % entry
    return full, None


def resolve_scope(site, entries):
    """把 scope.txt 每一行展開成實際檔案清單。

    回傳 (檔案清單, 錯誤清單, 提醒清單)。
    明寫的路徑不存在＝設定漂移，算錯；glob 沒中＝只提醒。
    """
    files, errors, warns = [], [], []
    for entry in entries:
        full, err = safe_join(site["root"], entry)
        if err:
            errors.append(err)
            continue
        if any(c in entry for c in GLOB_CHARS):
            hits = sorted(h for h in glob.glob(full, recursive=True) if os.path.isfile(h))
            inside = []
            for h in hits:
                _, e = safe_join(site["root"], os.path.relpath(h, site["root"]))
                if e:
                    errors.append(e)
                else:
                    inside.append(h)
            if not inside:
                warns.append("scope 這一行沒對到任何檔案：%s" % entry)
            files.extend(inside)
        elif os.path.isfile(full):
            files.append(full)
        else:
            errors.append("scope 列了但檔案不存在（設定漂移）：%s" % entry)
    seen, uniq = set(), []
    for f in files:
        if f not in seen:
            seen.add(f)
            uniq.append(f)
    return uniq, errors, warns


def load_blocklist(site):
    lines, err = read_conf_lines(os.path.join(site["conf"], "blocklist.txt"))
    if err:
        return [], [err]
    if lines is None:
        return [], ["找不到 blocklist.txt：%s" % os.path.join(site["conf"], "blocklist.txt")]
    rules, errors = [], []
    for line in lines:
        parts = line.split(":::")
        if len(parts) != 3:
            errors.append("blocklist 格式錯誤（要三欄，用 ::: 分隔）：%s" % line[:60])
            continue
        pattern, why, instead = (p.strip() for p in parts)
        try:
            rules.append({"re": re.compile(pattern), "why": why, "instead": instead})
        except re.error as e:
            errors.append("blocklist 正規表達式編不過（%s）：%s" % (e, pattern[:60]))
    return rules, errors


def check_blocklist(site, files, rules):
    hits = []
    for path in files:
        try:
            with open(path, encoding="utf-8") as f:
                lines = f.read().splitlines()
        except (OSError, UnicodeDecodeError) as e:
            hits.append({"file": os.path.relpath(path, site["root"]), "line": 0,
                         "text": "讀不到這個檔：%s" % e,
                         "why": "掃不到就等於沒掃", "instead": "確認檔案編碼與權限"})
            continue
        rel = os.path.relpath(path, site["root"])
        for n, text in enumerate(lines, 1):
            for rule in rules:
                m = rule["re"].search(text)
                if m:
                    hits.append({"file": rel, "line": n, "text": m.group(0),
                                 "why": rule["why"], "instead": rule["instead"]})
    return hits


def check_version_markers(site):
    """版本標記齊全 + 各檔一致 + 同一個檔裡不准有兩種標記。

    回傳 (每檔的 commit, 缺標記的檔, 錯誤清單)。
    同檔多標記要擋，是因為 COMMIT_RE 只是抓文字，文件範例或歷史紀錄也可能長得像
    版本標記；只取第一個會抓錯人（Codex 跨家審 2026-08-26 指出）。
    """
    entries, err = read_conf_lines(os.path.join(site["conf"], "versioned.txt"))
    if err:
        return {}, [], [err]
    if entries is None:
        return {}, [], ["找不到 versioned.txt：%s" % os.path.join(site["conf"], "versioned.txt")]
    marks, missing, errors = {}, [], []
    for entry in entries:
        full, e = safe_join(site["root"], entry)
        if e:
            errors.append(e)
            continue
        if not os.path.isfile(full):
            errors.append("versioned 列了但檔案不存在（設定漂移）：%s" % entry)
            continue
        try:
            text = open(full, encoding="utf-8").read()
        except (OSError, UnicodeDecodeError) as ex:
            errors.append("讀不到 %s：%s" % (entry, ex))
            continue
        found = {m.lower() for m in COMMIT_RE.findall(text)}
        if not found:
            missing.append(entry)
        elif len(found) > 1:
            errors.append("%s 裡有 %d 種 commit 標記（%s），分不出哪個才是版本標記"
                          % (entry, len(found), "、".join(sorted(found))))
        else:
            marks[entry] = next(iter(found))
    return marks, missing, errors


def fetch_upstream_head(repo):
    """抓上游 repo 最新 commit sha（40 碼）。公開 repo 不用 token。

    抓不到（沒網路、rate limit、repo 改私有）回 (None, 原因)：這種算「沒跑完」，
    不算通過也不算漂移，由呼叫端算進 incomplete。
    """
    url = "https://api.github.com/repos/%s/commits?per_page=1" % repo
    req = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github+json",
        "User-Agent": "messaging-drift-check",
    })
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 403:
            return None, "GitHub API 額度用完（rate limit），等一小時再跑"
        if e.code == 404:
            return None, "GitHub API 找不到 %s（打錯，或 repo 已改私有需要 token）" % repo
        return None, "GitHub API 回 HTTP %s" % e.code
    except Exception as e:  # 網路不通、DNS、逾時、JSON 壞掉都歸這裡
        return None, "連不上 GitHub API：%s" % e
    if not isinstance(data, list) or not data or not isinstance(data[0], dict):
        return None, "GitHub API 回的內容看不懂"
    sha = str(data[0].get("sha", "")).lower()
    if not SHA_FULL_RE.match(sha):
        return None, "GitHub API 回的 sha 不是 40 碼十六進位"
    return sha, None


def check_site(site):
    """跑一站。回傳 'pass' / 'fail' / 'skip' / 'incomplete'。"""
    print("")
    print("  ── 站台：%s（%s）" % (site["code"], site["desc"]))

    if not os.path.isdir(site["root"]):
        if site["required"]:
            print("     ❌ FAIL：這站標 required 但根目錄不在這台機器 → %s" % site["root"])
            return "fail"
        print("     ⏭️  SKIP：站台根目錄不在這台機器（標 optional）→ %s" % site["root"])
        return "skip"
    if not os.path.isdir(site["conf"]):
        print("     ❌ FAIL：找不到設定資料夾 → %s" % site["conf"])
        return "fail"

    failed = False
    incomplete = False

    scope_entries, err = read_conf_lines(os.path.join(site["conf"], "scope.txt"))
    if err:
        print("     ❌ %s" % err)
        return "fail"
    if scope_entries is None:
        print("     ❌ FAIL：找不到 scope.txt → %s" % os.path.join(site["conf"], "scope.txt"))
        return "fail"
    files, scope_errors, scope_warns = resolve_scope(site, scope_entries)
    for w in scope_warns:
        print("     ⚠️  %s" % w)
    for e in scope_errors:
        print("     ❌ %s" % e)
        failed = True

    # ① 禁用詞掃描
    rules, rule_errors = load_blocklist(site)
    for e in rule_errors:
        print("     ❌ %s" % e)
        failed = True
    if not rules and not rule_errors:
        print("     ❌ blocklist.txt 一條規則都沒有，掃了等於沒掃")
        failed = True
    if rules:
        hits = check_blocklist(site, files, rules)
        if hits:
            print("     ❌ 禁用詞：%d 處（掃了 %d 個檔）" % (len(hits), len(files)))
            for h in hits:
                print("        %s:%s 命中「%s」" % (h["file"], h["line"], h["text"]))
                print("           為什麼禁：%s" % h["why"])
                print("           改用：%s" % h["instead"])
            failed = True
        else:
            print("     ✅ 禁用詞：乾淨（掃了 %d 個檔、%d 條規則）" % (len(files), len(rules)))

    # ② 版本標記齊全 + 各檔一致
    marks, missing, ver_errors = check_version_markers(site)
    for e in ver_errors:
        print("     ❌ 版本標記：%s" % e)
        failed = True
    if missing:
        print("     ❌ 版本標記：%d 個檔找不到 commit 標記" % len(missing))
        for m in missing:
            print("        %s（下游副本沒說自己抄的是哪一版，之後無從判斷有沒有漂移）" % m)
        failed = True

    consistent_sha = None
    if marks:
        groups = {}
        for path, sha in marks.items():
            groups.setdefault(sha, []).append(path)
        if len(groups) > 1:
            print("     ❌ 版本標記：各檔標的 commit 不一致（同一份腳本被抄成好幾版）")
            for sha, paths in sorted(groups.items()):
                print("        %s ← %s" % (sha, "、".join(paths)))
            failed = True
        else:
            consistent_sha = next(iter(groups))
            print("     ✅ 版本標記：%d 個檔都標 commit %s" % (len(marks), consistent_sha))

    # ③ 上游版本比對
    if not site["upstream"]:
        if not marks and not missing and not ver_errors:
            print("     ⏭️  版本標記：versioned.txt 沒列檔案（這站沒有下游副本要對版），跳過")
        print("     ⏭️  上游比對：這站沒設上游 repo，跳過")
    elif not marks and not missing and not ver_errors:
        # 有宣告上游卻沒列任何要對版的檔＝設定不完整，檢查 2、3 會整個被繞過
        print("     ❌ 設定不完整：sites.conf 宣告了上游 %s，但 versioned.txt 一個檔都沒列，"
              "版本標記與上游比對會整個跳過（假全綠）" % site["upstream"])
        failed = True
    elif missing or ver_errors or consistent_sha is None:
        print("     ⏭️  上游比對：本地標記不齊或不一致，先修上面那項再比")
    else:
        head, reason = fetch_upstream_head(site["upstream"])
        if head is None:
            print("     ⚠️  上游比對：這次沒跑完（%s）" % reason)
            incomplete = True
        elif head.startswith(consistent_sha):
            print("     ✅ 上游比對：與 %s 最新 commit %s 一致" % (site["upstream"], head[:7]))
        else:
            print("     ❌ 上游比對：上游 %s 已經走到 %s，官網還標 %s"
                  % (site["upstream"], head[:7], consistent_sha))
            print("        上游改過而下游沒同步＝漂移的起點。請人去看那幾個 commit 改了什麼，")
            print("        決定要跟著改文案，還是只把版本標記往前推。不要自動改。")
            failed = True

    if failed:
        return "fail"
    return "incomplete" if incomplete else "pass"


def main():
    ap = argparse.ArgumentParser(description="對外講法漂移健檢（多站）")
    ap.add_argument("--site", help="只跑這個站台代號")
    ap.add_argument("--root", help="覆寫站台根目錄（配 --site 用，測試用）")
    args = ap.parse_args()

    sites, conf_errors = load_sites()
    for e in conf_errors:
        print("  ❌ %s" % e)
    if sites is None:
        return 1
    if args.site:
        sites = [s for s in sites if s["code"] == args.site]
        if not sites:
            print("  ❌ 站台清單裡沒有代號 %s" % args.site)
            return 1
        if args.root:
            sites[0]["root"] = expand(args.root)
    elif args.root:
        print("  ❌ --root 要配 --site 一起用")
        return 1

    results = [(s["code"], check_site(s)) for s in sites]
    bad = [c for c, r in results if r == "fail"]
    skipped = [c for c, r in results if r == "skip"]
    partial = [c for c, r in results if r == "incomplete"]

    print("")
    line = "  小計：%d 站通過" % sum(1 for _, r in results if r == "pass")
    if partial:
        line += "、%d 站沒跑完（%s）" % (len(partial), "、".join(partial))
    if skipped:
        line += "、%d 站跳過（%s）" % (len(skipped), "、".join(skipped))
    if bad:
        line += "、%d 站有紅項（%s）" % (len(bad), "、".join(bad))
    print(line)

    if bad or conf_errors:
        return 1
    if partial:
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
