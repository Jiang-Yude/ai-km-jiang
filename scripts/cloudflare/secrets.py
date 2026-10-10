#!/usr/bin/env python3
"""User-run hidden macOS input. Values stay in memory and go directly to Wrangler stdin."""
import argparse
import base64
import shutil
import subprocess

p = argparse.ArgumentParser()
p.add_argument('--environment', choices=['preview', 'production'], required=True)
p.add_argument('--project', default='ai-km-jiang-cf-20261004')
a = p.parse_args()
if a.project != 'ai-km-jiang-cf-20261004':
    p.error('Project identity mismatch')
if not shutil.which('wrangler') or not shutil.which('osascript'):
    p.error('wrangler and macOS osascript are required')
keys = ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'MIKA_LLM_API_KEY', 'MIKA_CHAT_READ_TOKEN', 'STATS_PASSWORD_B64']
print('同一正式 Upstash 才能接續 V 網歷史。Preview 自動用隔離鍵。取消即停止，值不存檔、不入 Keychain。')
for key in keys:
    label = '站長原本密碼（程式會轉 base64）' if key == 'STATS_PASSWORD_B64' else key
    prompt = f'設定 {a.environment} 的 {label}，請在此輸入，勿貼進對話或筆記'
    script = 'on run argv\nset resultDialog to display dialog (item 1 of argv) default answer "" with hidden answer buttons {"取消", "送入 Cloudflare"} default button 2 cancel button 1\nreturn text returned of resultDialog\nend run'
    result = subprocess.run(['osascript', '-e', script, prompt], capture_output=True, text=True)
    if result.returncode:
        raise SystemExit('已取消，停止輸入；先前已成功設定的變數保留。')
    input_value = result.stdout.rstrip('\r\n')
    if not input_value:
        raise SystemExit('空值，停止。')
    if key == 'STATS_PASSWORD_B64':
        # V 網的環境變數存的是已編碼值；若貼進來的已是 base64，再編一次會讓後台登入失敗。
        try:
            raw = base64.b64decode(input_value, validate=True)
            raw.decode('utf-8')  # 兩支 API 都把它解成 UTF-8 文字；解不出來就只能當原密碼。
            looks_encoded = base64.b64encode(raw).decode() == input_value and len(input_value) % 4 == 0
        except Exception:
            looks_encoded = False
        if looks_encoded:
            confirm = 'on run argv\nset r to display dialog (item 1 of argv) buttons {"取消", "這是原密碼，請編碼", "已是 base64，直接用"} default button 1 cancel button 1\nreturn button returned of r\nend run'
            choice = subprocess.run(['osascript', '-e', confirm, '輸入的值看起來已經是 base64。V 網後台存的是編碼後的值，請確認你貼的是哪一種。'], capture_output=True, text=True)
            if choice.returncode:
                raise SystemExit('已取消，停止輸入；先前已成功設定的變數保留。')
            if choice.stdout.strip() != '已是 base64，直接用':
                input_value = base64.b64encode(input_value.encode()).decode()
        else:
            input_value = base64.b64encode(input_value.encode()).decode()
    uploaded = subprocess.run(['wrangler', 'pages', 'secret', 'put', key, '--project-name', a.project, '--env', a.environment], input=input_value+'\n', capture_output=True, text=True)
    input_value = None
    if uploaded.returncode:
        raise SystemExit(f'{key} 設定失敗。為避免輸出敏感內容，未印出 CLI 原始回應。')
    print(f'{a.environment}: {key} 已設定')
print('設定後重新部署候選，逐一驗收功能及歷史連續性；本程式未部署、未切換。')
