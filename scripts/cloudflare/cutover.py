#!/usr/bin/env python3
"""Fail-closed cutover guide. Registrar delegation is an explicit manual gate."""
from pathlib import Path
import argparse
import json
import tempfile

ROOT = Path(__file__).resolve().parents[2]
PROJECT = 'ai-km-jiang-cf-20261004'
DOMAIN = 'jiangyude.com'
OLD_NS = ['ns1.vercel-dns.com', 'ns2.vercel-dns.com']

parser = argparse.ArgumentParser()
parser.add_argument('operation', choices=['cutover', 'rollback'])
parser.add_argument('--dry-run', action='store_true')
parser.add_argument('--execute', action='store_true')
parser.add_argument('--approval', default='')
parser.add_argument('--readiness', type=Path)
parser.add_argument('--self-test-local', '--drill-local', dest='self_test_local', action='store_true')
a = parser.parse_args()
if a.execute and a.dry_run:
    parser.error('choose dry-run or execute')

if a.self_test_local:
    if a.execute:
        parser.error('a local self-test cannot execute cloud changes')
    # JSON selector self-test only; it does not exercise a live deployment or DNS rollback.
    with tempfile.TemporaryDirectory(prefix='site-cutover-drill-') as directory:
        selector = Path(directory) / 'provider.json'
        selector.write_text(json.dumps({'provider': 'vercel', 'redis_keys': 'original'}))
        selector.write_text(json.dumps({'provider': 'cloudflare', 'redis_keys': 'original'}))
        assert json.loads(selector.read_text())['provider'] == 'cloudflare'
        selector.write_text(json.dumps({'provider': 'vercel', 'redis_keys': 'original'}))
        assert json.loads(selector.read_text()) == {'provider': 'vercel', 'redis_keys': 'original'}
    print('LOCAL_SELFTEST_ONLY: 暫存 JSON 選擇器 C/V 讀寫通過；正式 DNS、部署及資料回退尚未演練，不可當 drill 登記。')
    raise SystemExit(0)

print(f'{a.operation.upper()} plan for {DOMAIN}; project {PROJECT}')
print('來源：Name.com 註冊商；現行 NS=' + ', '.join(OLD_NS))
if a.operation == 'cutover':
    steps = [
        '取得 Vercel 完整 DNS zone 匯出，核對 MX、TXT、子網域、CAA、DNSSEC；保存 Name.com 原 NS 與 DS 狀態。',
        'Cloudflare 建立 zone 並匯入所有原紀錄，先維持網站紀錄指向 Vercel；校對差異與 DNSSEC 處理次序。',
        '使用者設定正式 secrets，確認相同 Upstash endpoint 及原鍵。先唯讀對帳歷史 aggregate/月份與紀錄數，不把候選假資料合併。',
        '在任何流量切換前建置正式 SEO 產物，以 publish/safe-deploy 正式授權流程部署到 Pages production；pages.dev 仍強制隔離鍵。驗靜態、runtime、CPU與IP，再另作 Upstash 唯讀對帳。',
        '當輪授權後才在 Name.com 手動改 NS。先正確移除或更新原 DS 並確認傳播，避免錯誤 DS 造成解析中断。等待 zone Active，原紀錄仍承接 V 網流量。',
        '當輪授權後新增 Pages 正式自訂網域與 apex/WWW 指向，等 TLS ready。登記正式切換 UTC 時間與原 Vercel 紀錄回退入口。',
        '切換後驗六支真實功能、全站、SEO及原鍵歷史連續性；保留 V 網30天，同日合計無法精確按平台切開。未通過先按原紀錄回退，不等待觀察期。',
    ]
else:
    steps = [
        '確認保存的 Vercel project/production alias、原 DNS 紀錄及 registrar 登入可用；回退不依賴 C 網新功能通過。',
        '同一 Cloudflare zone 服務回退：恢复保存的 Vercel apex/WWW 紀錄與代理模式，驗 Vercel TLS及網站。',
        '若退出 Cloudflare：先在 Name.com 正確移除或更新目前 Cloudflare DS 並等待傳播，再恢復原 Vercel NS。切 NS 不是即時退回。',
        'NS恢復後才按原 DNSSEC 狀態處理原 DS，確認 resolver 無 SERVFAIL、網站 TLS與原 Vercel 入口可用。',
        '驗首頁、文章、搜尋、聊天室、後台及歷史總數。共享 Upstash 原鍵不需搬回資料；寫入仍沿用原保存期限。',
        '候選測試鍵不合併；新部署網址及已發生LLM費用不能撤銷。',
    ]
for i, step in enumerate(steps, 1):
    print(f'{i}. {step}')

required = (['cross_family_pass', 'manifest_http_pass', 'six_preview_functions_pass', 'history_preflight_pass', 'production_seo_pass', 'live_cpu_verified', 'live_ip_verified', 'full_dns_backup_verified', 'dnssec_plan_verified', 'production_secrets_verified', 'registrar_manual_steps_ready'] if a.operation == 'cutover' else ['old_vercel_identity_verified', 'original_dns_records_available', 'rollback_dnssec_plan_verified', 'registrar_access_verified'])
if a.execute:
    want = '切' if a.operation == 'cutover' else '退回'
    if a.approval != want:
        raise SystemExit(f'未提供當輪授權文字 {want}，停止。')
    if not a.readiness:
        raise SystemExit('缺 readiness 驗收文件，停止。')
    ready = json.loads(a.readiness.read_text())
    missing = [key for key in required if ready.get(key) is not True]
    if ready.get('domain') != DOMAIN or ready.get('project') != PROJECT:
        missing.append('identity')
    if missing:
        raise SystemExit('STOP: 尚未驗收：' + ', '.join(missing))
    # No registrar credentials have been authorised. Do not pretend DNS can be automated.
    raise SystemExit('MANUAL_GATE: Name.com nameserver 操作與完整 DNS/TLS 狀態需當輪完成；本腳本不自動改 DNS、不部署。本版只提供安全準備與檢查，未實作一鍵正式切換；不得宣稱正式回退演練通過。')
print('DRY_RUN: 未部署、未修改 DNS/secret/Vercel。上述必要項尚未被宣稱通過。')
