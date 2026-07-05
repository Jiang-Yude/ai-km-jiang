#!/usr/bin/env python3
"""站內內部連結掃描：檢查相對連結目標檔案存在。有斷鏈 exit 1。"""
import re, os, sys, glob

os.chdir(os.path.join(os.path.dirname(__file__), '..'))
bad = []
pages = [f for f in glob.glob('*.html') + glob.glob('articles/*/index.html')
         + glob.glob('ai-trends/*/index.html') + glob.glob('ai-office/*.html')
         + glob.glob('courses/**/*.html', recursive=True)
         if not f.startswith(('_trash', 'en/'))]
for p in pages:
    base = os.path.dirname(p)
    s = open(p, encoding='utf-8').read()
    # 去掉 script 區塊，避免 JS 模板字串誤報
    s = re.sub(r'<script[\s\S]*?</script>', '', s)
    for h in re.findall(r'href="([^"#]+?)(?:[#?][^"]*)?"', s):
        if h.startswith(('http', 'mailto:', 'tel:', 'javascript:', '//', '/')):
            continue
        t = os.path.normpath(os.path.join(base, h))
        if t.endswith('/') or os.path.isdir(t):
            t = os.path.join(t.rstrip('/'), 'index.html')
        if not os.path.exists(t):
            bad.append((p, h))
if bad:
    seen = set()
    for p, h in bad:
        if h not in seen:
            seen.add(h)
            print(f"  斷鏈: {p} → {h}")
    sys.exit(1)
sys.exit(0)
