#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ai-km-jiang 流量追蹤注入器（單一來源機制）

靜態站沒有共用 head 模板，所以用這支腳本把追蹤碼一次注入所有 .html。
中文頁、英文頁（en/）、所有深度文章（articles/、ai-trends/）一起處理，
避免 SOP 提到的「雙語站漏掉英文頁那一側」問題。

用法：
  python3 _analytics/inject-tracking.py            # 依下面設定注入
  python3 _analytics/inject-tracking.py --dry-run  # 只列出會改哪些檔，不寫入
  python3 _analytics/inject-tracking.py --limit 2  # 只改前 2 檔（放大前的試跑）

管四件事（各自獨立冪等，用註解標記偵測，重跑不會重複注入）：
  1. Vercel Analytics（head）   ── 2026-06-25 起
  2. GA4 gtag（head）          ── 填 GA4_ID 才會注入
  3. Cloudflare Web Analytics（body 尾）── 2026-08-22 新增
  4. views.js 自建計數器（body 尾）    ── 2026-08-22 新增，補齊當時 91 個沒計數的頁

注入點：head 類在 </head> 之前；body 類在**最後一個** </body> 之前。
用最後一個而不是第一個，是因為 articles/personal-studio-vs-solo-company/index.html
的檔頭註解裡就有一個 </body> 字樣，用第一個會把追蹤碼注入到註解中間。

注入後記得：
  - Vercel：後台 Analytics 要 Enable（2026-08-22 已用 API `POST /web/insights/toggle` 開啟），
    且**要重新部署一次**才會有 /_vercel/insights/script.js 路由，舊部署會 404。
  - Cloudflare：後台 Web Analytics 已建站台 jiangyude.com。beacon token 是公開的
    （會出現在網站原始碼裡，任何訪客都看得到），不是密碼，跟 MIKA_CHAT_READ_TOKEN 性質不同。
  - GA4 約 24-48 小時後才顯示資料。
詳見同資料夾「怎麼追蹤.md」。
"""
import os, sys

# ===== 設定 =====
GA4_ID = ""   # 例如 "G-XXXXXXX"；留空＝不裝 GA4
CF_TOKEN = "c3e3c857121d416ab405270557d017d3"  # Cloudflare Web Analytics beacon（公開值，非密碼）；留空＝不裝
INJECT_VIEWS = True   # 是否補齊自建計數器 views.js

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MARK_VA = "<!-- tracking:vercel-analytics -->"
MARK_GA = "<!-- tracking:ga4 -->"
MARK_CF = "<!-- tracking:cloudflare -->"
MARK_VIEWS = "<!-- tracking:views-counter -->"

# 2026-08-22：別的工作階段未提交的檔案，依官網看板防打架鐵律 1 不動。
# 對方收工 commit 之後把這行清掉再跑一次即可（腳本冪等，其他檔不會被重複注入）。
SKIP_FILES = {
    "articles/eight-ai-system-concepts-2026/index.html",
}

VA_SNIPPET = f"""{MARK_VA}
<script defer src="/_vercel/insights/script.js"></script>
<script defer src="/_vercel/speed-insights/script.js"></script>
"""

CF_SNIPPET = f"""{MARK_CF}
<script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{{"token": "{CF_TOKEN}"}}'></script>
"""

VIEWS_SNIPPET = f"""{MARK_VIEWS}
<script src="/views.js"></script>
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
            if f.startswith("_tuner-hero"):
                continue  # 首頁人像調校用的一次性測試檔，不列入統計也不注入
            rel = os.path.relpath(os.path.join(dp, f), ROOT)
            if rel in SKIP_FILES:
                continue
            out.append(os.path.join(dp, f))
    return sorted(out)

def inject(path, dry=False):
    s = open(path, encoding="utf-8").read()
    orig = s
    added = []

    # --- head 類 ---
    head_add = ""
    if MARK_VA not in s:
        head_add += VA_SNIPPET
        added.append("VA")
    if GA4_ID and MARK_GA not in s:
        head_add += ga_snippet(GA4_ID)
        added.append("GA4")
    if head_add:
        if "</head>" not in s:
            return "no-head", []
        s = s.replace("</head>", head_add + "</head>", 1)

    # --- body 尾類（用最後一個 </body>，理由見檔頭）---
    body_add = ""
    if CF_TOKEN and MARK_CF not in s:
        body_add += CF_SNIPPET
        added.append("CF")
    if INJECT_VIEWS and MARK_VIEWS not in s and "views.js" not in s:
        body_add += VIEWS_SNIPPET
        added.append("views")
    if body_add:
        i = s.rfind("</body>")
        if i == -1:
            return "no-body", []
        s = s[:i] + body_add + s[i:]

    if s == orig:
        return "skip", []
    if not dry:
        open(path, "w", encoding="utf-8").write(s)
    return "done", added

def main():
    dry = "--dry-run" in sys.argv
    limit = None
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])

    files = html_files()
    if limit:
        files = [f for f in files if inject(f, dry=True)[0] == "done"][:limit]

    stats = {"done": 0, "skip": 0, "no-head": 0, "no-body": 0}
    kinds = {}
    for f in files:
        r, added = inject(f, dry=dry)
        stats[r] = stats.get(r, 0) + 1
        for a in added:
            kinds[a] = kinds.get(a, 0) + 1
        if r == "done":
            print(("[乾跑] " if dry else "注入 ") + os.path.relpath(f, ROOT) + "  <- " + "+".join(added))

    print(f"\n{'乾跑（未寫入）' if dry else '實際寫入'}：掃 {len(files)} 檔，"
          f"處理 {stats['done']}、已存在跳過 {stats['skip']}、無 head {stats['no-head']}、無 body {stats['no-body']}")
    print("各類注入數：" + (", ".join(f"{k} {v}" for k, v in sorted(kinds.items())) or "無"))
    print(f"GA4：{'已注入 ' + GA4_ID if GA4_ID else '未設定'}｜"
          f"Cloudflare：{'已設 token' if CF_TOKEN else '未設定'}｜"
          f"views.js：{'補齊' if INJECT_VIEWS else '不動'}")
    if SKIP_FILES:
        print("刻意跳過（別人未提交的工作）：" + "、".join(sorted(SKIP_FILES)))

if __name__ == "__main__":
    main()
