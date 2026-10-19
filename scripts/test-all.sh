#!/bin/bash
# ─── tests/ 總入口（2026-10-19 立）───
# 立因：tests/ 五支測試從沒接進 preflight，也沒有 test runner，盤查實跑時 redis 測試因缺本機 REDIS_SERVER 失敗、
# cloudflare 兩支要先 build 才能跑，沒人知道哪些能在本機跑。這支把「能離線跑的照跑、需要外部工具的跳過並印原因」寫死。
# 用法：bash scripts/test-all.sh      全部通過或跳過 exit 0；任一支實跑失敗 exit 1
# 被誰呼叫：preflight.sh 第 11 關。
#
# 每支的需求：
#   2026-09-13-0822-quota.test.cjs   純離線（node:test，假金鑰、假 fetch）→ 一律跑
#   cloudflare-cutover-mock.py       純離線（mock Cloudflare API）→ 一律跑；它只印結果不 assert，本支比對「（期望 X）」行
#   2026-09-13-0914-redis.test.mjs   要本機 redis-server／redis-cli → 設 REDIS_SERVER、REDIS_CLI 才跑，否則跳過
#   cloudflare-key-parity.mjs        要 .cloudflare-generated/（scripts/cloudflare/build.mjs 產生，build 需要 wrangler）
#   cloudflare-migration.mjs         要 wrangler（本機起 workerd）→ 兩支都要 PATH 上有 wrangler 才跑，否則跳過
#   想強制跳過 cloudflare 兩支（例：wrangler 有裝但沒登入）：SKIP_CLOUDFLARE_TESTS=1
set -uo pipefail
cd "$(dirname "$0")/.."
FAIL=0; RAN=0; SKIPPED=0
LOGDIR="$(mktemp -d "${TMPDIR:-/tmp}/ai-km-tests.XXXXXX")"
pass(){ echo "  ✅ $1"; RAN=$((RAN+1)); }
fail(){ echo "  ❌ $1（完整輸出：$2）"; FAIL=1; RAN=$((RAN+1)); }
skip(){ echo "  ⏭️  略過 $1：$2"; SKIPPED=$((SKIPPED+1)); }

# 1. quota（離線）
if node --test tests/2026-09-13-0822-quota.test.cjs > "$LOGDIR/quota.log" 2>&1; then pass "quota 單元測試"; else fail "quota 單元測試" "$LOGDIR/quota.log"; fi

# 2. cutover mock（離線，比對期望值）
if python3 tests/cloudflare-cutover-mock.py scripts/cloudflare/cutover.py > "$LOGDIR/cutover.log" 2>&1; then
  _bad=$(python3 - "$LOGDIR/cutover.log" <<'PY'
import re,sys
bad=[]
for l in open(sys.argv[1],encoding='utf-8'):
    m=re.search(r'（期望 ([^）]+)）',l)
    if not m: continue
    if m.group(1) not in l[:m.start()]: bad.append(l.strip())
print('\n'.join(bad))
PY
)
  if [[ -z "$_bad" ]] && grep -q '期望' "$LOGDIR/cutover.log"; then pass "cutover 離線模擬（期望值全符合）"
  else echo "$_bad" | sed 's/^/     /'; fail "cutover 離線模擬（期望值不符或沒有期望行）" "$LOGDIR/cutover.log"; fi
else
  fail "cutover 離線模擬（執行失敗）" "$LOGDIR/cutover.log"
fi

# 3. redis（要本機 redis）
if [[ -n "${REDIS_SERVER:-}" && -n "${REDIS_CLI:-}" ]]; then
  if node tests/2026-09-13-0914-redis.test.mjs > "$LOGDIR/redis.log" 2>&1; then pass "redis 腳本測試"; else fail "redis 腳本測試" "$LOGDIR/redis.log"; fi
else
  skip "redis 腳本測試" "沒有設 REDIS_SERVER、REDIS_CLI（要本機 redis-server 與 redis-cli 執行檔，不連雲端資料庫）"
fi

# 4、5. cloudflare（要 wrangler）
if [[ "${SKIP_CLOUDFLARE_TESTS:-0}" == "1" ]]; then
  skip "cloudflare key-parity、migration" "SKIP_CLOUDFLARE_TESTS=1"
elif ! command -v wrangler >/dev/null 2>&1; then
  skip "cloudflare key-parity、migration" "PATH 上沒有 wrangler（build.mjs 產生 .cloudflare-generated/ 與 migration 起本機 workerd 都需要它）"
else
  if CF_BUILD_ROOT="$LOGDIR/cf-build" node scripts/cloudflare/build.mjs --target=candidate > "$LOGDIR/cf-build.log" 2>&1; then
    if node tests/cloudflare-key-parity.mjs > "$LOGDIR/parity.log" 2>&1; then pass "cloudflare key-parity"; else fail "cloudflare key-parity" "$LOGDIR/parity.log"; fi
    if node tests/cloudflare-migration.mjs > "$LOGDIR/migration.log" 2>&1; then pass "cloudflare migration"; else fail "cloudflare migration" "$LOGDIR/migration.log"; fi
  else
    fail "cloudflare build（key-parity、migration 的前置）" "$LOGDIR/cf-build.log"
  fi
fi

echo "  測試：實跑 ${RAN} 支、略過 ${SKIPPED} 支"
exit $FAIL
