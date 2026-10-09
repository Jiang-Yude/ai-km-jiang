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
MANUAL = ('‼️ 自動退回沒完成，手動退回：Cloudflare 後台 → jiangyude.com → DNS → 記錄：刪掉 jiangyude.com 的 CNAME（指 pages.dev），'
          '新增 A 64.29.17.1 與 A 216.198.79.1（名稱 @，Proxy 關、僅 DNS）；或跑 bash scripts/cloudflare/rollback.sh --execute --approval 退回')


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


def mark_change(method):
    # The first non-GET call is the first possible mutation; only after it may a failure trigger auto rollback.
    global CHANGED
    if method != 'GET':
        CHANGED = True


def api(tok, method, path, body=None):
    mark_change(method)
    last = None
    for attempt in range(4):
        req = urllib.request.Request('https://api.cloudflare.com/client/v4' + path, method=method,
                                     data=json.dumps(body).encode() if body is not None else None,
                                     headers={'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json'})
        try:
            d = json.load(urllib.request.urlopen(req, timeout=30))
        except urllib.error.HTTPError as e:
            try:
                d = json.loads(e.read() or b'{}')
            except ValueError:
                d = {'errors': [f'HTTP {e.code}']}
            if e.code < 500 and e.code != 429:
                break
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as e:
            d = {'errors': [type(e).__name__]}
        if d.get('success'):
            return d['result']
        last = d.get('errors')
        time.sleep(3 * (attempt + 1))
    else:
        d = {'errors': last}
    if d.get('success'):
        return d['result']
    sys.exit(f'STOP: Cloudflare API {method} {path} 失敗：{d.get("errors")}')


def all_records(tok, zone):
    return api(tok, 'GET', f'/zones/{zone}/dns_records?name={HOST}&per_page=100')


def apex_records(tok, zone):
    return [r for r in api(tok, 'GET', f'/zones/{zone}/dns_records?name={HOST}&per_page=100') if r['type'] in ('A', 'AAAA', 'CNAME')]


def status_code(line):
    parts = line.split()
    return int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0


def check():
    ns = {l.split(':', 1)[1].strip().lower() for l in sh('whois', DOMAIN).splitlines() if 'name server:' in l.lower()}
    print('NS（註冊局）:', ', '.join(sorted(ns)) or '?', '✅' if ns == CF_NS else '❌ 不是 Cloudflare')
    print('DS（DNSSEC）:', sh('dig', '+short', 'DS', DOMAIN) or '無')
    print(f'{HOST} 解析:', sh('dig', '+short', HOST, '@howard.ns.cloudflare.com').replace('\n', ' '))
    for h in dict.fromkeys((HOST, DOMAIN, 'www.' + DOMAIN, 'lightstory.' + DOMAIN)):
        s, srv = http_probe('https://' + h + '/')
        print(f'https://{h}/ → {s}  server={srv}')


def verify(expect):
    """expect='cloudflare' after cutover, 'vercel' after rollback. Returns True only if HOST serves as expected."""
    ok = True
    for path in ('/', '/api/stats'):
        good = False
        for _ in range(8):
            s, srv = http_probe(f'https://{HOST}{path}')
            code, srv_l = status_code(s), srv.lower()
            if expect == 'cloudflare':
                good = code == 200 and srv_l == 'cloudflare'
            else:  # Vercel answers the apex with 200; a spare drill host falls to the wildcard (Vercel, any status)
                good = srv_l == 'vercel' and (code == 200 or HOST != DOMAIN)
            if good:
                break
            time.sleep(15)
        print(f'  驗證 https://{HOST}{path} → {s} server={srv}', '✅' if good else '❌')
        ok &= good
        if HOST != DOMAIN and expect == 'vercel':
            break
    if HOST == DOMAIN:
        for _ in range(8):
            r = subprocess.run(['curl', '-s', '-o', '/dev/null', '-w', '%{http_code} %{redirect_url}', '-m', '20', f'https://www.{DOMAIN}/'], capture_output=True, text=True).stdout.split()
            code, loc = (int(r[0]) if r and r[0].isdigit() else 0), (r[1] if len(r) > 1 else '')
            good = code in (301, 308) and loc.rstrip('/') == f'https://{DOMAIN}'
            if good:
                break
            time.sleep(15)
        print(f'  驗證 https://www.{DOMAIN}/ → {code} {loc}', '✅' if good else '❌')
        ok &= good
    return ok


def production_ready(tok):
    head = sh('git', '-C', str(Path(__file__).resolve().parents[2]), 'rev-parse', 'HEAD')
    receipt = SNAP_DIR / 'production-receipt.json'
    if not receipt.exists():
        sys.exit('STOP: 沒有 production-receipt.json，先跑 deploy-production.sh。')
    rec = json.loads(receipt.read_text())
    deps = api(tok, 'GET', f'/accounts/{ACCOUNT}/pages/projects/{PROJECT}/deployments?env=production&per_page=1')
    if not deps:
        sys.exit('STOP: Pages 沒有 production 部署。')
    d = deps[0]
    commit = (d.get('deployment_trigger') or {}).get('metadata', {}).get('commit_hash', '')
    stage = (d.get('latest_stage') or {}).get('status')
    print(f'最新 production：{d["id"]} commit={commit[:7]} stage={stage}；receipt commit={rec.get("commit","")[:7]}；HEAD={head[:7]}')
    if stage != 'success' or not commit or not (commit == rec.get('commit') == head):
        sys.exit('STOP: 最新 production 部署不是本次已驗收的版本（commit／狀態不符），不切。')
    for path in ('/', '/api/stats'):
        s, srv = http_probe(d['url'] + path)
        print(f'  production 網址 {d["url"]}{path} → {s}')
        if status_code(s) != 200:
            sys.exit('STOP: production 部署網址驗收失敗，不切。')


def plan(op, tok=None):
    if op == 'cutover':
        print('切換內容：')
        print(f'  1. Pages 專案 {PROJECT} 新增自訂網域 {HOST}')
        print(f'  2. 刪除 apex 的 Vercel A 紀錄（先存快照到 cutover-snapshots/）')
        print(f'  3. 新增 apex CNAME → {PAGES_TARGET}（Proxied）')
        print('  4. 等 Pages 網域 active，驗首頁與 /api/stats 由 cloudflare 回 200、www 仍 301；失敗自動退回')
        print('  不動：www（照舊 Vercel 轉址到 apex）、*、lightstory、CAA')
        print('  前提：Pages production 已用 deploy-production.sh 部署（CF_SITE_MODE=production、CF_PROD_KEYS=original）')
    else:
        print('退回內容：')
        print(f'  1. 刪除 apex CNAME → {PAGES_TARGET}')
        print('  2. 依最新快照完整還原原本的紀錄（apex 沒快照時用內建 Vercel A 64.29.17.1、216.198.79.1，僅 DNS）')
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
    if HOST == DOMAIN:
        production_ready(tok)
    if any(r['type'] == 'CNAME' and r['content'] == PAGES_TARGET for r in apex_records(tok, zone['id'])):
        sys.exit(f'STOP: {HOST} 已經指向 Pages（已切過），不重複切換。')
    recs = apex_records(tok, zone['id'])
    if HOST != DOMAIN and all_records(tok, zone['id']):
        sys.exit(f'STOP: 演練用的 {HOST} 已經有 DNS 紀錄，只能用全新的備用子網域。')
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
    if not (wait_active(tok) and verify('cloudflare')):
        print('❌ 切換後驗證失敗，自動退回 Vercel。')
        rollback(tok)
        sys.exit('CUTOVER_FAILED_ROLLED_BACK')
    print('✅ CUTOVER_VERIFIED')


def rollback(tok):
    global ROLLING
    ROLLING = True
    zone = api(tok, 'GET', f'/zones?name={DOMAIN}')[0]
    snaps = sorted(SNAP_DIR.glob(f'*-{HOST}.json')) if SNAP_DIR.exists() else []
    want = [{'type': r['type'], 'content': r['content'], 'proxied': r.get('proxied', False), 'ttl': r.get('ttl', 1)}
            for r in json.loads(snaps[-1].read_text()) if not (r['type'] == 'CNAME' and r['content'] == PAGES_TARGET)] if snaps else []
    if not want and HOST == DOMAIN:
        want = [{**w, 'proxied': False, 'ttl': 1} for w in VERCEL_APEX]
    print('還原依據：', snaps[-1].name if snaps else '內建值', want)
    for r in apex_records(tok, zone['id']):
        if r['type'] == 'CNAME' and r['content'] == PAGES_TARGET:
            api(tok, 'DELETE', f'/zones/{zone["id"]}/dns_records/{r["id"]}')
            print('刪除 CNAME →', PAGES_TARGET)
    have = {(r['type'], r['content']): r for r in apex_records(tok, zone['id'])}
    for w in want:
        cur = have.get((w['type'], w['content']))
        if cur and (cur.get('proxied') != w['proxied'] or cur.get('ttl') != w['ttl']):
            api(tok, 'PATCH', f'/zones/{zone["id"]}/dns_records/{cur["id"]}', {'proxied': w['proxied'], 'ttl': w['ttl']})
            print('修正', w['type'], w['content'], 'proxied=' + str(w['proxied']), 'ttl=' + str(w['ttl']))
        elif not cur:
            api(tok, 'POST', f'/zones/{zone["id"]}/dns_records', {**w, 'name': HOST, 'comment': 'rollback to Vercel'})
            print('還原', w['type'], w['content'], 'proxied=' + str(w['proxied']))
    if any(x['name'] == HOST for x in api(tok, 'GET', f'/accounts/{ACCOUNT}/pages/projects/{PROJECT}/domains')):
        api(tok, 'DELETE', f'/accounts/{ACCOUNT}/pages/projects/{PROJECT}/domains/{HOST}')
        print('Pages 自訂網域已移除')
    print('ROLLBACK_UTC', datetime.now(timezone.utc).isoformat())
    if not verify('vercel'):
        sys.exit('ROLLBACK_VERIFY_FAILED：DNS 已還原但驗證未過，可能是快取，幾分鐘後跑 check 再看。')
    print('✅ ROLLBACK_VERIFIED')


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
ROLLING = False
CHANGED = False
t = token()


def safe_rollback():
    for i in range(3):
        try:
            rollback(t)
            return True
        except (SystemExit, Exception) as e2:
            print(f'退回第 {i+1} 次失敗：{type(e2).__name__}: {e2}')
            time.sleep(10)
    print(MANUAL)
    return False


try:
    cutover(t) if a.operation == 'cutover' else rollback(t)
except (SystemExit, Exception) as e:
    msg = str(e)
    if msg.startswith(('✅', 'CUTOVER_FAILED_ROLLED_BACK')) or (isinstance(e, SystemExit) and e.code in (0, None)):
        raise
    if a.operation == 'cutover' and CHANGED and not ROLLING:
        print(f'⚠️ 切換中途失敗（{type(e).__name__}: {msg}），自動退回。')
        safe_rollback()
    elif a.operation == 'cutover' and ROLLING:
        print(f'⚠️ 自動退回時出錯（{type(e).__name__}: {msg}），重試退回。')
        safe_rollback()
    elif a.operation == 'rollback':
        print(MANUAL)
    raise SystemExit(msg or type(e).__name__)
