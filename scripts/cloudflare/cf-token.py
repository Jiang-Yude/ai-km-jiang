#!/usr/bin/env python3
"""User-run: store the Cloudflare DNS API token in macOS Keychain via a hidden dialog. The value never prints."""
import json, subprocess, urllib.request

SERVICE = 'ai-km-jiang-cf-dns-token'
DLG = 'display dialog "貼上 Cloudflare API Token（隱藏輸入，勿貼進對話）" default answer "" with hidden answer buttons {"取消", "存進鑰匙圈"} default button 2 cancel button 1\nreturn text returned of result'
r = subprocess.run(['osascript', '-e', DLG], capture_output=True, text=True)
token = r.stdout.strip()
if r.returncode or not token:
    raise SystemExit('已取消，沒有儲存。')
req = urllib.request.Request('https://api.cloudflare.com/client/v4/user/tokens/verify', headers={'Authorization': 'Bearer ' + token})
try:
    ok = json.load(urllib.request.urlopen(req, timeout=20)).get('success')
except Exception as e:
    raise SystemExit('Token 驗證失敗，沒有儲存：' + type(e).__name__)
if not ok:
    raise SystemExit('Token 無效，沒有儲存。')
subprocess.run(['security', 'add-generic-password', '-U', '-a', 'cloudflare', '-s', SERVICE, '-w', token], check=True)
token = None
print('✅ Token 有效，已存進鑰匙圈：' + SERVICE)
