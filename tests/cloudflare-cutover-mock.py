# Offline mock of cutover.py paths. Run: python3 tests/cloudflare-cutover-mock.py scripts/cloudflare/cutover.py
import sys, types, json, tempfile, pathlib, runpy
src = pathlib.Path(sys.argv[1]).read_text()
def run(op, host, fail_verify=False, api_fail_on=None, pre=None):
    zone = {'id': 'z', 'status': 'active'}
    recs = pre if pre is not None else [{'id': '1', 'type': 'A', 'content': '64.29.17.1', 'proxied': False, 'ttl': 1, 'name': host},
                                        {'id': '2', 'type': 'A', 'content': '216.198.79.1', 'proxied': False, 'ttl': 1, 'name': host}]
    domains = []; n = [10]; calls = []
    def api(tok, m, path, body=None):
        calls.append((m, path.split('?')[0][-40:])); g['mark_change'](m)
        if api_fail_on and api_fail_on(m, path, calls): raise SystemExit('STOP: Cloudflare API mock fail')
        if path.startswith('/zones?'): return [zone]
        if '/dns_records' in path:
            if m == 'GET': return [dict(r) for r in recs]
            if m == 'DELETE': rid = path.rsplit('/', 1)[1]; recs[:] = [r for r in recs if r['id'] != rid]; return {}
            if m == 'POST': n[0] += 1; recs.append({**body, 'id': str(n[0])}); return {}
            if m == 'PATCH': rid = path.rsplit('/', 1)[1]; [r.update(body) for r in recs if r['id'] == rid]; return {}
        if path.endswith('/domains') and m == 'GET': return [{'name': d, 'status': 'active'} for d in domains]
        if path.endswith('/domains') and m == 'POST': domains.append(body['name']); return {}
        if '/domains/' in path and m == 'DELETE': domains.clear(); return {}
        if '/deployments' in path: return [{'id': 'd', 'url': 'https://x', 'latest_stage': {'status': 'success'}, 'deployment_trigger': {'metadata': {'commit_hash': 'H'}}}]
        raise AssertionError(path)
    g = {'__name__': 'mock', '__file__': sys.argv[1]}
    code = src.split("\np = argparse.ArgumentParser()")[0]
    exec(code, g)
    g['api'] = api; g['HOST'] = host; g['ROLLING'] = False; g['CHANGED'] = False
    g['SNAP_DIR'] = pathlib.Path(tempfile.mkdtemp())
    g['verify'] = lambda expect: not (fail_verify and expect == 'cloudflare')
    g['production_ready'] = lambda tok: None
    g['wait_active'] = lambda tok, minutes=15: True
    g['time'].sleep = lambda s: None
    try:
        g[op]('t')
        if op == 'cutover' and not fail_verify: g['rollback']('t')
    except SystemExit as e:
        print('  exit:', e)
    return sorted((r['type'], r['content'], r['proxied']) for r in recs), domains, 'CHANGED=' + str(g['CHANGED'])
print('A 正常切＋退回 →', run('cutover', 'jiangyude.com'))
print('B 切後驗證失敗自動退回 →', run('cutover', 'jiangyude.com', fail_verify=True))
print('C 演練主機非空（TXT）→', run('cutover', 'drill.jiangyude.com', pre=[{'id': '9', 'type': 'TXT', 'content': 'x', 'proxied': False, 'ttl': 1}]))
print('D 演練空白主機切＋退回 →', run('cutover', 'drill.jiangyude.com', pre=[]))
print('E 已切過再切 →', run('cutover', 'jiangyude.com', pre=[{'id': '5', 'type': 'CNAME', 'content': 'ai-km-jiang-cf-20261004.pages.dev', 'proxied': True, 'ttl': 1}]))
print('F 退回時 proxied 錯誤被修正 →', run('rollback', 'jiangyude.com', pre=[{'id': '1', 'type': 'A', 'content': '64.29.17.1', 'proxied': True, 'ttl': 1}]))

# G: main-level handler — cutover raises KeyError mid-way; rollback fails once with OSError then succeeds.
src_main = src.split("\np = argparse.ArgumentParser()")[1]
main_code = src.split("\np = argparse.ArgumentParser()")[0] + "\np = argparse.ArgumentParser()" + src_main.split("ROLLING = False\nCHANGED = False\nt = token()")[0]
tail = "ROLLING = False\nCHANGED = False\nt = token()" + src_main.split("ROLLING = False\nCHANGED = False\nt = token()")[1]
g = {'__name__': 'mock', '__file__': sys.argv[1]}
sys.argv = [sys.argv[1], 'cutover', '--execute', '--approval', '切']
exec(main_code, g)
state = {'rb': 0}
def bad_cutover(t):
    g['CHANGED'] = True
    raise KeyError('id')
def flaky_rollback(t):
    state['rb'] += 1
    if state['rb'] == 1: raise OSError('net down')
g.update(token=lambda: 't', cutover=bad_cutover, rollback=flaky_rollback, plan=lambda op: None)
g['time'].sleep = lambda s: None
try:
    exec(tail, g)
except SystemExit as e:
    print('G KeyError 中途失敗 → rollback 呼叫次數', state['rb'], '（期望 2）exit:', e)

# H: real cutover(); a GET after the snapshot fails before any mutation -> CHANGED stays False (main will not roll back).
print('H 快照後、首次異動前 GET 失敗 →', run('cutover', 'jiangyude.com', api_fail_on=lambda m, p, c: m == 'GET' and p.endswith('/domains')), '（期望 CHANGED=False）')
print('I 首次異動 POST 失敗 →', run('cutover', 'jiangyude.com', api_fail_on=lambda m, p, c: m == 'POST'), '（期望 CHANGED=True）')
