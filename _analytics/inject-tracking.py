#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ai-km-jiang 流量追蹤注入器（單一來源機制）

靜態站沒有共用 head 模板，所以用這支腳本把追蹤碼一次注入所有 .html 的 <head>。
中文頁、英文頁（en/）、所有深度文章（articles/、ai-trends/）一起處理，
避免 SOP 提到的「雙語站漏掉英文頁那一側」問題。

用法：
  1. 只裝 Vercel Analytics（GA4 還沒建）：直接跑 `python3 _analytics/inject-tracking.py`
  2. 連 GA4 一起裝：先在下面填 GA4_ID = "G-XXXXXXX"，再跑同一指令。

特性：
  - 幂等：已注入的檔不會重複注入（用註解標記偵測）。
  - 注入點：每個 .html 的 </head> 之前。
  - Vercel Analytics 與 GA4 都用絕對路徑 / 絕對網址，中文頁與 en/ 子頁都通用，不需改相對路徑。

注入後記得：
  - Vercel 後台 → 專案 → Analytics 分頁 → Enable（免費 Hobby）。
  - 重新部署一次（vercel --prod），舊部署沒有 analytics 路由會 404。
  - GA4 約 24-48 小時後才顯示資料。
詳見同資料夾「怎麼追蹤.md」。
"""
import os, glob, sys

# ===== 設定 =====
GA4_ID = ""   # 例如 "G-XXXXXXX"；留空＝這次只裝 Vercel Analytics，不裝 GA4
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MARK_VA = "<!-- tracking:vercel-analytics -->"
MARK_GA = "<!-- tracking:ga4 -->"

VA_SNIPPET = f"""{MARK_VA}
<script defer src="/_vercel/insights/script.js"></script>
<script defer src="/_vercel/speed-insights/script.js"></script>
"""

def ga_snippet(gid):
    return f"""{MARK_GA}
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id={gid}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){{dataLayer.push(arguments);}}
  gtag('js', new Date());
  gtag('config', '{gid}');
</script>
"""

def blocked_dirs():
    """讀 .vercelignore 取出被擋著不上線的文章目錄（排隊中的草稿，注入沒意義）。"""
    p = os.path.join(ROOT, ".vercelignore")
    if not os.path.exists(p):
        return set()
    out = set()
    for line in open(p, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and line.endswith("/"):
            out.add(os.path.join(ROOT, line.rstrip("/")))
    return out

def html_files():
    """
    2026-07-29 修：原本寫死四個 glob（*.html / en/*.html / articles/*/index.html /
    ai-trends/*/index.html），漏掉 en/articles/（60 篇英文文章全部沒被注入）、
    en/ai-trends/、courses/、cases/、offers/、ai-office/。
    諷刺的是本檔開頭的說明正是在警告「雙語站漏掉英文頁那一側」。
    改成走訪全站，用排除清單而不是白名單，新增目錄不會再被漏掉。
    """
    skip_dirs = {".git", "node_modules", "_trash", "_自動備份", "_templates", "_analytics", ".vercel"}
    blocked = blocked_dirs()
    out = []
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if d not in skip_dirs]
        if any(dp == b or dp.startswith(b + os.sep) for b in blocked):
            continue
        for f in fn:
            if not f.endswith(".html"):
                continue
            if f.startswith("google") or f.startswith("index-parallel"):
                continue  # Google 驗證檔與平行版草稿不注入
            out.append(os.path.join(dp, f))
    return sorted(out)

def inject(path):
    s = open(path, encoding="utf-8").read()
    if "</head>" not in s:
        return "no-head"
    add = ""
    if MARK_VA not in s:
        add += VA_SNIPPET
    if GA4_ID and MARK_GA not in s:
        add += ga_snippet(GA4_ID)
    if not add:
        return "skip"
    s = s.replace("</head>", add + "</head>", 1)
    open(path, "w", encoding="utf-8").write(s)
    return "done"

def main():
    files = html_files()
    stats = {"done": 0, "skip": 0, "no-head": 0}
    for f in files:
        r = inject(f)
        stats[r] = stats.get(r, 0) + 1
        if r == "done":
            print("注入", os.path.relpath(f, ROOT))
    print(f"\n總計 {len(files)} 檔：注入 {stats['done']}、已存在跳過 {stats['skip']}、無 head {stats['no-head']}")
    print(f"GA4：{'已注入 '+GA4_ID if GA4_ID else '未設定（只裝了 Vercel Analytics）'}")

if __name__ == "__main__":
    main()
