#!/usr/bin/env python3
"""jiangyude.com apex cutover / rollback between Vercel and Cloudflare Pages.

DNS authority is already Cloudflare (registrar Vercel, NS howard/zariyah.ns.cloudflare.com, set 2026-10-09).
Only the apex record moves. www keeps pointing to Vercel, which serves the www -> apex 301 as before.
* and lightstory are untouched.

  check                        read-only status (no token needed)
  cutover  --execute --approval 切     apex -> Pages (user-run; needs Keychain token)
  rollback --execute --approval 退回   apex -> Vercel A records from snapshot (user-run)
Without --execute, cutover/rollback print the exact changes and stop (dry run).
Token: Keychain service ai-km-jiang-cf-dns-token (store with cf-token.py).
Permissions: Zone DNS Edit + Zone Read on jiangyude.com, Account Cloudflare Pages Edit.
"""
from pathlib import Path
import argparse, json, subprocess, sys, time, urllib.request, urllib.error
from datetime import datetime, timezone

ACCOUNT = '83b6a5f53818ce6c45a780af6fb7a601'
PROJECT = 'ai-km-jiang-cf-20261004'
DOMAIN = 'jiangyude.com'
PAGES_TARGET = f'{PROJECT}.pages.dev'
CF_NS = {'howard.ns.cloudflare.com', 'zariyah.ns.cloudflare.com'}
# Vercel apex records as imported by Cloudflare quick-scan on 2026-10-09 (DNS only).
VERCEL_APEX = [{'type': 'A', 'content': '64.29.17.1'}, {'type': 'A', 'content': '216.198.79.1'}]
SNAP_DIR = Path(__file__).resolve().parent / 'cutover-snapshots'
KEYCHAIN = 'ai-km-jiang-cf-dns-token'


def sh(*cmd):
    return subprocess.run(cmd, capture_output=True, text=True).stdout.strip()


def http_probe(url):
    r = subprocess.run(['curl', '-s', '-o', '/dev/null', '-D', '-', '-m', '20', url], capture_output=True, text=True).stdout
    status = r.split('\n', 1)[0].strip()
    server = next((l.split(':', 1)[1].strip() for l in r.splitlines() if l.lower().startswith('server:')), '?')
    return status, server


def token():
    t = sh('security', 'find-generic-password', '-s', KEYCHAIN, '-w')
    if not t:
        sys.exit('STOP: 鑰匙圈沒有 ' + KEYCHAIN + '，先跑 cf-token.py。')
    return t


def api(tok, method, path, body=None):
    req = urllib.request.Request('https://api.cloudflare.com/client/v4' + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json'})
    try:
        d = json.load(urllib.request.urlopen(req, timeout=30))
    except urllib.error.HTTPError as e:
        d = json.loads(e.read() or b'{}')
    if not d.get('success'):
        sys.exit(f'STOP: Cloudflare API {method} {path} 失敗：{d.get("errors")}')
    return d['result']


def apex_records(tok, zone):
    return [r for r in api(tok, 'GET', f'/zones/{zone}/dns_records?name={HOST}&per_page=100') if r['type'] in ('A', 'AAAA', 'CNAME')]


def check():
    ns = {l.split(':', 1)[1].strip().lower() for l in sh('whois', DOMAIN).splitlines() if 'name server:' in l.lower()}
    print('NS（註冊局）:', ', '.join(sorted(ns)) or '?', '✅' if ns == CF_NS else '❌ 不是 Cloudflare')
    print('DS（DNSSEC）:', sh('dig', '+short', 'DS', DOMAIN) or '無')
    print('apex 解析:', sh('dig', '+short', DOMAIN, '@howard.ns.cloudflare.com').replace('\n', ' '))
    for h in (DOMAIN, 'www.' + DOMAIN, 'lightstory.' + DOMAIN):
        s, srv = http_probe('https://' + h + '/')
        print(f'https://{h}/ → {s}  server={srv}')
    s, srv = http_probe(f'https://{DOMAIN}/api/stats')
    print(f'/api/stats → {s}  server={srv}（cloudflare＝已切 C 網；Vercel＝舊站）')


def plan(op, tok=None):
    if op == 'cutover':
        print('切換內容：')
        print(f'  1. Pages 專案 {PROJECT} 新增自訂網域 {HOST}')
        print(f'  2. 刪除 apex 的 Vercel A 紀錄（先存快照到 cutover-snapshots/）')
        print(f'  3. 新增 apex CNAME → {PAGES_TARGET}（Proxied）')
        print('  4. 等 Pages 網域 active，驗首頁、/api/stats、歷史總數')
        print('  不動：www（照舊 Vercel 轉址到 apex）、*、lightstory、CAA')
        print('  前提：Pages production 已用 deploy-production.sh 部署（CF_SITE_MODE=production、CF_PROD_KEYS=original）')
    else:
        print('退回內容：')
        print(f'  1. 刪除 apex CNAME → {PAGES_TARGET}')
        print('  2. 依最新快照（沒有就用內建值 64.29.17.1、216.198.79.1）重建 apex A 紀錄，僅 DNS')
        print(f'  3. Pages 專案移除自訂網域 {HOST}')
        print('  4. 驗首頁 server 回 Vercel、/api/stats 正常')
        print('  NS 留在 Cloudflare；要完全退出 Cloudflare 才在 Vercel 把 NS 改回 ns1/ns2.vercel-dns.com（無 DS，不需先處理 DNSSEC）')


def wait_active(tok, minutes=15):
    for _ in range(minutes * 4):
        doms = api(tok, 'GET', f'/accounts/{ACCOUNT}/pages/projects/{PROJECT}/domains')
        d = next((x for x in doms if x['name'] == HOST), None)
        st = d and d.get('status')
        print('  Pages 網域狀態：', st)
        if st == 'active':
            return True
        time.sleep(15)
    return False


def cutover(tok):
    zone = api(tok, 'GET', f'/zones?name={DOMAIN}')[0]
    if zone['status'] != 'active':
        sys.exit(f'STOP: zone 狀態 {zone["status"]}，還沒 active。')
    deps = api(tok, 'GET', f'/accounts/{ACCOUNT}/pages/projects/{PROJECT}/deployments?env=production&per_page=1')
    if not deps:
        sys.exit('STOP: Pages 沒有 production 部署，先跑 deploy-production.sh。')
    recs = apex_records(tok, zone['id'])
    SNAP_DIR.mkdir(exist_ok=True)
    snap = SNAP_DIR / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + f'-{HOST}.json')
    snap.write_text(json.dumps(recs, indent=2, ensure_ascii=False))
    print('已存快照：', snap)
    if not any(x['name'] == HOST for x in api(tok, 'GET', f'/accounts/{ACCOUNT}/pages/projects/{PROJECT}/domains')):
        api(tok, 'POST', f'/accounts/{ACCOUNT}/pages/projects/{PROJECT}/domains', {'name': HOST})
        print('Pages 自訂網域已新增')
    recs = apex_records(tok, zone['id'])  # Pages may have created its own apex record
    for r in recs:
        if r['type'] in ('A', 'AAAA') or (r['type'] == 'CNAME' and r['content'] != PAGES_TARGET):
            api(tok, 'DELETE', f'/zones/{zone["id"]}/dns_records/{r["id"]}')
            print('刪除', r['type'], r['content'])
    if not any(r['type'] == 'CNAME' and r['content'] == PAGES_TARGET for r in recs):
        api(tok, 'POST', f'/zones/{zone["id"]}/dns_records', {'type': 'CNAME', 'name': HOST, 'content': PAGES_TARGET, 'proxied': True, 'ttl': 1, 'comment': 'cutover ' + snap.name})
        print('新增 CNAME', HOST, '→', PAGES_TARGET)
    print('CUTOVER_UTC', datetime.now(timezone.utc).isoformat())
    if not wait_active(tok):
        print('⚠️ 15 分鐘內 Pages 網域未 active。網站可能暫時錯誤；若要退回：rollback.sh --execute --approval 退回')
    check()


def rollback(tok):
    zone = api(tok, 'GET', f'/zones?name={DOMAIN}')[0]
    snaps = sorted(SNAP_DIR.glob(f'*-{HOST}.json')) if SNAP_DIR.exists() else []
    want = [{'type': r['type'], 'content': r['content']} for r in json.loads(snaps[-1].read_text()) if r['type'] in ('A', 'AAAA')] if snaps else []
    want = want or (VERCEL_APEX if HOST == DOMAIN else [])
    print('還原依據：', snaps[-1].name if snaps else '內建值', want)
    for r in apex_records(tok, zone['id']):
        if r['type'] == 'CNAME' and r['content'] == PAGES_TARGET:
            api(tok, 'DELETE', f'/zones/{zone["id"]}/dns_records/{r["id"]}')
            print('刪除 CNAME →', PAGES_TARGET)
    have = {(r['type'], r['content']) for r in apex_records(tok, zone['id'])}
    for w in want:
        if (w['type'], w['content']) not in have:
            api(tok, 'POST', f'/zones/{zone["id"]}/dns_records', {**w, 'name': HOST, 'proxied': False, 'ttl': 1, 'comment': 'rollback to Vercel'})
            print('新增', w['type'], w['content'], '僅 DNS')
    if any(x['name'] == HOST for x in api(tok, 'GET', f'/accounts/{ACCOUNT}/pages/projects/{PROJECT}/domains')):
        api(tok, 'DELETE', f'/accounts/{ACCOUNT}/pages/projects/{PROJECT}/domains/{HOST}')
        print('Pages 自訂網域已移除')
    print('ROLLBACK_UTC', datetime.now(timezone.utc).isoformat())
    time.sleep(20)
    check()


p = argparse.ArgumentParser()
p.add_argument('operation', choices=['check', 'cutover', 'rollback'])
p.add_argument('--execute', action='store_true')
p.add_argument('--approval', default='')
p.add_argument('--host', default=DOMAIN, help='drill on a spare host, e.g. drill.jiangyude.com')
a = p.parse_args()
if not (a.host == DOMAIN or a.host.endswith('.' + DOMAIN)) or a.host in ('www.' + DOMAIN, 'lightstory.' + DOMAIN):
    sys.exit('STOP: host 只能是 jiangyude.com 或備用子網域')
HOST = a.host
if a.operation == 'check':
    check(); sys.exit(0)
plan(a.operation)
if not a.execute:
    print('DRY_RUN：沒有改任何東西。'); sys.exit(0)
want = '切' if a.operation == 'cutover' else '退回'
if a.approval != want:
    sys.exit(f'STOP: 要帶 --approval {want}')
t = token()
try:
    cutover(t) if a.operation == 'cutover' else rollback(t)
except SystemExit as e:
    if a.operation == 'cutover' and str(e).startswith('STOP: Cloudflare API'):
        print('⚠️ 切換中途失敗，狀態可能只做一半。立刻退回：bash scripts/cloudflare/rollback.sh --execute --approval 退回')
    raise
