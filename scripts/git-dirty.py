#!/usr/bin/env python3
"""工作區乾淨檢查共用判斷（2026-10-21 立，事故驅動）。

為什麼：主 clone 出現兩個 macOS 複製出的「檔名 2.webp」，內容與已追蹤檔一模一樣，
部署台「主工作區要乾淨」把它當成別人的在途工作，整條部署被擋。這種複製檔不是工作，只是殘渣。

規則：未追蹤檔（不含 .gitignore 擋掉的）若非空、且內容（git blob hash）與某個已追蹤檔相同，
只印警告不算髒；其餘未追蹤檔、已追蹤檔的任何改動照舊算髒。本工具不刪也不搬任何檔案。

用法（在 repo 內）：
  git-dirty.py              印「真正的髒檔」（git status --porcelain 格式，一行一筆），警告走 stderr；
                            有髒檔 exit 1，沒有 exit 0
  git-dirty.py --list-dups  只印被容忍的複製檔路徑（一行一個，給 merge-publish unstage 用），exit 0
  git-dirty.py --untracked  只印「不算複製檔」的未追蹤檔路徑（給 publish.sh 用），exit 0
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def git(*args: str) -> bytes:
    return subprocess.run(["git", "-c", "core.quotePath=false", *args], check=True, capture_output=True).stdout


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode not in ("", "--list-dups", "--untracked"):
        print(__doc__, file=sys.stderr)
        return 2
    top = Path(git("rev-parse", "--show-toplevel").decode().strip())
    # 已追蹤檔的 blob hash（index 版）。用 git 自己的 hash 比，不另算 sha256，與 git 判定一致。
    tracked: dict[str, str] = {}
    for rec in git("ls-files", "-s", "-z").split(b"\0"):
        if not rec:
            continue
        meta, path = rec.split(b"\t", 1)
        tracked.setdefault(meta.split()[1].decode(), path.decode())
    untracked = [p.decode() for p in git("ls-files", "--others", "--exclude-standard", "-z").split(b"\0") if p]
    dups: dict[str, str] = {}
    if untracked:
        cand = [p for p in untracked if (top / p).is_file() and not (top / p).is_symlink() and (top / p).stat().st_size > 0]
        if cand:
            out = subprocess.run(["git", "hash-object", "--stdin-paths"], input="\n".join(cand) + "\n",
                                 text=True, capture_output=True, check=True, cwd=top).stdout.split()
            for p, h in zip(cand, out):
                if h in tracked:
                    dups[p] = tracked[h]
    if mode == "--list-dups":
        for p in dups:
            print(p)
        return 0
    if mode == "--untracked":
        for p in untracked:
            if p not in dups:
                print(p)
        return 0
    for p, same in dups.items():
        print(f"⚠️  未追蹤檔 {p} 與已追蹤的 {same} 內容相同（多半是 macOS 複製出的「 2」檔），只警告不擋；確認沒用後搬到 _trash。", file=sys.stderr)
    dirty = []
    recs = git("status", "--porcelain", "-z", "--untracked-files=all").split(b"\0")
    i = 0
    while i < len(recs):
        line = recs[i].decode()
        i += 1
        if not line:
            continue
        # 改名／複製紀錄（XY 含 R 或 C）在 -z 下後面多一段原檔名，跳過那段
        if "R" in line[:2] or "C" in line[:2]:
            i += 1
        if line.startswith("?? ") and line[3:] in dups:
            continue
        dirty.append(line)
    for d in dirty:
        print(d)
    return 1 if dirty else 0


if __name__ == "__main__":
    sys.exit(main())
