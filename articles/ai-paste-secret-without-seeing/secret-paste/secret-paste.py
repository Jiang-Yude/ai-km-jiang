#!/usr/bin/env python3
"""secret-paste：讓 AI 替你把密鑰放進 CLI，AI 全程看不到值。

流程：剪貼簿（或 macOS 隱藏輸入框）→ 只驗格式 → 從 stdin 交給目標指令
→ 清空剪貼簿 → 只印一行結果（目標指令的輸出若含值會先遮掉）。

值只存在本程式記憶體：不放進 argv、不寫檔、不經 shell、不印出。
用法與雷點見同資料夾 README.md。

需求：macOS（用到 pbcopy、pbpaste、osascript）、Python 3.8 以上。
威脅模型：防 AI 不小心看到值，不防存心偷看的程式，詳見 README「誠實邊界」。
授權：MIT，可自由使用、修改、分享，不提供任何擔保。
"""
from __future__ import annotations

import argparse
import os
import re
import shutil
import signal
import subprocess
import sys
from typing import NoReturn

PRESETS = {
    "google-oauth": ["GOCSPX-"],
    "openai": ["sk-"],
    "anthropic": ["sk-ant-"],
    "github": ["ghp_", "github_pat_"],
}
MASK = "[已遮蔽]"
DIALOG_TIMEOUT = 180  # 秒


def fail(msg: str, code: int = 1) -> NoReturn:
    print(f"失敗：{msg}")
    raise SystemExit(code)


def clear_clipboard() -> bool:
    if sys.platform != "darwin":  # 非 macOS 已在開頭拒跑，沒有剪貼簿可清
        return True
    try:
        subprocess.run(["pbcopy"], input=b"", check=True, timeout=10)
        out = subprocess.run(["pbpaste"], capture_output=True, timeout=10).stdout
        return out == b""
    except Exception:
        return False


def read_clipboard() -> str:
    try:
        out = subprocess.run(["pbpaste"], capture_output=True, timeout=10).stdout
    except Exception:
        return ""
    return out.decode("utf-8", errors="replace")


def read_dialog(key: str, prefixes: list[str]) -> str:
    hint = f"（預期開頭：{' 或 '.join(prefixes)}）" if prefixes else ""
    prompt = f"請貼上 {key}{hint}\n內容不會顯示，也不會交給 AI。"
    # 提示字串走 argv 傳給 AppleScript，不拼進腳本本體，避免引號注入。
    script = [
        "on run argv",
        "activate",
        "set r to display dialog (item 1 of argv) default answer \"\" with hidden answer "
        "with title \"secret-paste\" buttons {\"取消\", \"寫入\"} default button \"寫入\" "
        f"cancel button \"取消\" giving up after {DIALOG_TIMEOUT}",
        "if gave up of r then error number -128",
        "return text returned of r",
        "end run",
    ]
    cmd = ["osascript"]
    for line in script:
        cmd += ["-e", line]
    cmd.append(prompt)
    try:
        code, out, _err = run_proc(cmd, None, timeout=DIALOG_TIMEOUT + 30)
    except subprocess.TimeoutExpired:
        return ""
    if code != 0:
        return ""
    return out.decode("utf-8", errors="replace").rstrip("\n")


def run_proc(cmd, stdin_bytes, timeout, env=None, cwd=None):
    """跑子行程；本程式被中斷或逾時時一定先殺掉子行程，避免留下孤兒輸入框。"""
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, env=env, cwd=cwd)
    try:
        out, err = proc.communicate(input=stdin_bytes, timeout=timeout)
        return proc.returncode, out, err
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait()


def check_format(value: str, prefixes: list[str], min_len: int) -> str | None:
    """回傳錯誤原因（不含值的任何部分），格式正確回傳 None。"""
    if not value:
        return "沒有取得值"
    if any(c.isspace() for c in value):
        return "值中間含空白或換行，不像單一密鑰"
    if len(value) < min_len:
        return f"長度不足（至少 {min_len} 字元）"
    if prefixes and not any(value.startswith(p) for p in prefixes):
        return f"開頭不符（預期 {' 或 '.join(prefixes)}）"
    return None


NAME_RULES = {
    "key": (r"[A-Za-z_][A-Za-z0-9_]*", "英數與底線，不能數字開頭"),
    "project": (r"[a-z0-9][a-z0-9-]*", "小寫英數與連字號"),
    "name": (r"[A-Za-z0-9][A-Za-z0-9_-]*", "英數、底線、連字號"),
    "env": (r"[A-Za-z0-9][A-Za-z0-9_-]*", "英數、底線、連字號"),
    "account": (r"[A-Za-z0-9]+", "英數"),
}


def validate_names(a: argparse.Namespace) -> None:
    """名稱類參數不得以 - 開頭或含怪字元，免得被 wrangler 當成旗標而寫錯地方。"""
    for field, (pattern, desc) in NAME_RULES.items():
        v = getattr(a, field, None)
        if v is not None and not re.fullmatch(pattern, v):
            fail(f"--{field} 格式不對（只能{desc}）", 2)


def build_command(a: argparse.Namespace) -> tuple[list[str], dict[str, str], str]:
    env = dict(os.environ)
    validate_names(a)
    if a.target in ("pages", "worker"):
        account = a.account or os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
        if not account:
            fail("wrangler 目標必須帶 --account（同一個登入可能管好幾個 Cloudflare 帳戶，非互動模式不帶會失敗或寫錯帳戶）", 2)
        env["CLOUDFLARE_ACCOUNT_ID"] = account
        wrangler = a.wrangler or shutil.which("wrangler") or ""
        if not wrangler:
            fail("找不到 wrangler，請用 --wrangler 指定路徑", 2)
        if a.target == "pages":
            if not a.project:
                fail("pages 目標必須帶 --project", 2)
            cmd = [wrangler, "pages", "secret", "put", a.key, "--project-name", a.project]
            if a.env:
                cmd += ["--env", a.env]
            where = f"wrangler pages｜專案 {a.project}｜環境 {a.env or '預設(production)'}"
        else:
            if not a.name:
                fail("worker 目標必須帶 --name（不靠目前資料夾的 wrangler.toml 猜，免得寫錯 Worker）", 2)
            cmd = [wrangler, "secret", "put", a.key, "--name", a.name]
            if a.env:
                cmd += ["--env", a.env]
            where = f"wrangler worker｜{a.name}｜環境 {a.env or '預設'}"
        return cmd, env, where
    # cmd：自訂指令，值從 stdin 給
    if not a.cmd:
        fail("--target cmd 要在 -- 之後接目標指令，例如：-- gh secret set KEY", 2)
    return list(a.cmd), env, f"自訂指令 {os.path.basename(a.cmd[0])}"


REDACT_WINDOW = 6


def redact(text: str, value: str) -> str:
    """遮掉值本身，以及值裡任何連續 6 字元以上的片段（防 CLI 只印前幾碼或後幾碼）。"""
    if not value:
        return text
    text = text.replace(value, MASK)
    if len(value) < REDACT_WINDOW:
        return text
    hit = [False] * len(text)
    windows = {value[i:i + REDACT_WINDOW] for i in range(len(value) - REDACT_WINDOW + 1)}
    for i in range(len(text) - REDACT_WINDOW + 1):
        if text[i:i + REDACT_WINDOW] in windows:
            for j in range(i, i + REDACT_WINDOW):
                hit[j] = True
    out, prev = [], False
    for ch, h in zip(text, hit):
        if h:
            if not prev:
                out.append(MASK)
        else:
            out.append(ch)
        prev = h
    return "".join(out)


def last_lines(text: str, n: int) -> str:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    return "｜".join(lines[-n:])[:300]


def main() -> int:
    p = argparse.ArgumentParser(
        prog="secret-paste.py",
        description="讓 AI 替你把密鑰放進 CLI，AI 看不到值。值從剪貼簿或隱藏輸入框來，經 stdin 交給目標。",
    )
    p.add_argument("--key", required=True, help="密鑰名稱，例如 GOOGLE_CLIENT_SECRET")
    p.add_argument("--target", choices=["pages", "worker", "cmd"], required=True,
                   help="pages＝wrangler pages secret put；worker＝wrangler secret put；cmd＝-- 後接自訂指令")
    p.add_argument("--prefix", action="append", default=[], help="預期開頭，可重複（符合任一即可）")
    p.add_argument("--preset", choices=sorted(PRESETS), help="常用前綴組合")
    p.add_argument("--any-format", action="store_true", help="不檢查開頭（要明確寫出來才放行）")
    p.add_argument("--min-length", type=int, default=8)
    p.add_argument("--project", help="pages 專案名（--project-name）")
    p.add_argument("--name", help="worker 名稱（--name，worker 目標必填）")
    p.add_argument("--env", help="--env，例如 preview")
    p.add_argument("--account", help="Cloudflare 帳戶 ID（也可用環境變數 CLOUDFLARE_ACCOUNT_ID）")
    p.add_argument("--wrangler", help="wrangler 執行檔路徑（預設找 PATH）")
    p.add_argument("--cwd", help="目標指令的工作目錄（需要 wrangler.toml 時用）")
    p.add_argument("--source", choices=["auto", "clipboard", "dialog"], default="auto",
                   help="auto＝剪貼簿沒有合格值才跳隱藏輸入框（預設）")
    p.add_argument("--dry-run", action="store_true", help="只驗格式與列出指令，不執行")
    p.add_argument("cmd", nargs=argparse.REMAINDER, help="--target cmd 時，-- 後的目標指令")
    a = p.parse_args()
    if sys.platform != "darwin":
        fail("這支工具只支援 macOS（需要 pbcopy、pbpaste、osascript）", 2)
    if a.cmd and a.cmd[0] == "--":
        a.cmd = a.cmd[1:]
    if a.target != "cmd" and a.cmd:
        fail("只有 --target cmd 能在 -- 後接指令", 2)

    prefixes = list(a.prefix) + (PRESETS[a.preset] if a.preset else [])
    if not prefixes and not a.any_format:
        fail("請給 --prefix 或 --preset；真的不檢查開頭要明寫 --any-format", 2)

    if a.cwd and not os.path.isdir(a.cwd):
        fail("--cwd 資料夾不存在", 2)

    cmd, env, where = build_command(a)

    # 收到中斷也要走 finally 清剪貼簿
    def _term(_sig, _frm):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, _term)
    signal.signal(signal.SIGHUP, _term)

    value = ""
    source = ""
    try:
        if a.source in ("auto", "clipboard"):
            value = read_clipboard().strip()
            source = "剪貼簿"
            reason = check_format(value, prefixes, a.min_length)
            if reason and a.source == "clipboard":
                fail(f"剪貼簿{reason}，未寫入")
            if reason:
                value = ""
        if not value:
            value = read_dialog(a.key, prefixes).strip()
            source = "隱藏輸入框"
            if not value:
                fail("剪貼簿沒有合格的值，隱藏輸入框也取消或逾時，未寫入")
            reason = check_format(value, prefixes, a.min_length)
            if reason:
                fail(f"輸入框的值{reason}，未寫入")

        if a.dry_run:
            print(f"完成（dry-run，未執行）：{a.key} 格式通過（來源：{source}）→ 會寫到 {where}")
            return 0

        try:
            code, so, se = run_proc(cmd, value.encode("utf-8"), timeout=180, env=env, cwd=a.cwd)
        except subprocess.TimeoutExpired:
            fail("目標指令逾時（180 秒），已終止，未確認是否寫入")
        except OSError as e:
            fail(f"無法執行目標指令（{e.strerror or type(e).__name__}）")
        if a.target == "cmd":
            # 自訂指令可能把值變形後印出（base64、截斷），遮不乾淨，所以一律不轉述輸出
            detail = "自訂指令輸出不轉述"
        else:
            out = redact(so.decode("utf-8", "replace") + "\n" + se.decode("utf-8", "replace"), value)
            detail = last_lines(out, 3 if code else 1) or "無輸出"
        if code != 0:
            fail(f"目標指令 exit {code}｜{where}｜{detail}")
        print(f"完成：{a.key} 已寫入 {where}（來源：{source}）｜{detail}")
        return 0
    except KeyboardInterrupt:
        print("失敗：被中斷，未確認是否寫入")
        return 130
    finally:
        value = ""


if __name__ == "__main__":
    # 不論成功、格式不符、參數錯、被中斷，最後一律清空剪貼簿
    try:
        sys.exit(main())
    finally:
        for _s in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):  # 清空過程不准被打斷
            signal.signal(_s, signal.SIG_IGN)
        if not clear_clipboard():
            print("⚠️ 剪貼簿清空失敗，請手動複製任意文字覆蓋")
