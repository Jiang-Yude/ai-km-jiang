// llm-router.js：AI 助理雙軌路由（Claude API 優先、OpenAI 備援）
// 建立 2026-10-09。計劃正本＝主知識庫〈2026-10-09-0853 系統設計：AI助理改走Claude API雙軌切換計劃〉第九節。
// 同一份檔案複製在 ai-km-jiang／yongli-canvas／lyca-line-agent 三個 repo，改一處要三處一起改
// （lyca-line-agent/test/llm-router.test.mjs 有測試；本檔是 ai-km-jiang 用的 CommonJS 版，內容同 ESM 版只差 export 寫法）。
//
// 開關（每套系統各自的環境變數，改完要重新部署才生效）：
//   LLM_PRIMARY        claude | openai（未設＝openai，等於完全照舊）
//   ANTHROPIC_API_KEY  Claude 金鑰（只放平台 secret，不進 repo）
//   CLAUDE_MODEL       預設 claude-sonnet-5-5
//   CLAUDE_BUDGET_MS   Claude 這一段最多等多久（含重試），預設 20000
//   CLAUDE_COOLDOWN_MS 額度用完後多久不再先試 Claude，預設 1800000（30 分鐘）
//
// 備援規則（跨家審第 1、2 條）：
//   暫時故障（429、5xx、529、逾時、連線失敗）→ 重試 1 次，仍失敗就交給 OpenAI
//   額度不足（402、billing_error、餘額不足）→ 直接交給 OpenAI，並在冷卻期內不先試 Claude
//   設定錯誤（401、403、404、400）→ 交給 OpenAI，log 標 alert
//   Claude 拒答（stop_reason=refusal）→ 回固定婉拒訊息，不轉給 OpenAI
//   每則訊息最多切換一次；log 只記狀態，不記 key、請求本文或使用者內容
//   Claude 回傳格式異常、讀 JSON 失敗 → 當暫時故障；Claude 回空字串（多半是思考吃光 max_tokens）→ 直接交給 OpenAI，
//   因為同一個請求重送大概率還是空的
//   整則截止時間：呼叫端可傳 deadlineAt（毫秒時間戳），Claude 這段不會超過它，過了就直接走 OpenAI
//   備援時間上限：LLM_PRIMARY=claude 時，換到 OpenAI 的那次呼叫會收到 { signal }（逾時 fallbackTimeoutMs，預設 25 秒），
//   呼叫端把 signal 交給 fetch。LLM_PRIMARY=openai 時不傳 signal，OpenAI 呼叫跟原本完全一樣。
//
// 已知限制（2026-10-09 跨家審第 7 條）：額度冷卻記在執行個體記憶體，Workers／Vercel 的新執行個體會再試一次 Claude。
// 額度不足的錯誤會立即回來（不等逾時），所以代價只是每個新執行個體多一次很快的失敗，不會讓使用者多等。

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_CLAUDE_MODEL = "claude-sonnet-5-5";
const DEFAULT_REFUSAL_TEXT = "這個問題我沒辦法回答，換個方式問問看，或直接聯絡江江。";

let claudeCooldownUntil = 0; // 同一個執行個體內有效，冷卻是盡力而為

function _resetCooldownForTest() { claudeCooldownUntil = 0; }

function envNum(v, d) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; }

// OpenAI 的 reasoning_effort → Claude 的 output_config.effort
function mapEffort(r) {
  const v = String(r || "").toLowerCase();
  if (v === "minimal" || v === "none" || v === "low") return "low";
  if (v === "medium") return "medium";
  if (v === "high" || v === "xhigh") return "high";
  return "medium";
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p) => (typeof p === "string" ? p : p && p.text) || "").join("\n");
  return String(content ?? "");
}

// OpenAI chat messages → Claude 的 system ＋ messages
// 開頭連續的 system 併成 system；中途的 system 併進下一則 user；同角色連續的合併；確保第一則與最後一則是 user。
function toClaudeMessages(messages) {
  const sys = [];
  const out = [];
  let pendingSys = [];
  let i = 0;
  while (i < messages.length && messages[i].role === "system") { sys.push(textOf(messages[i].content)); i++; }
  for (; i < messages.length; i++) {
    const m = messages[i];
    const t = textOf(m.content);
    if (m.role === "system") { pendingSys.push(t); continue; }
    const role = m.role === "assistant" ? "assistant" : "user";
    let text = t;
    if (role === "user" && pendingSys.length) { text = `（系統提示）${pendingSys.join("\n")}\n\n${t}`; pendingSys = []; }
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += `\n\n${text}`;
    else out.push({ role, content: text });
  }
  if (pendingSys.length) {
    const t = `（系統提示）${pendingSys.join("\n")}`;
    const last = out[out.length - 1];
    if (last && last.role === "user") last.content += `\n\n${t}`; else out.push({ role: "user", content: t });
  }
  if (!out.length || out[0].role !== "user") out.unshift({ role: "user", content: "（對話開始）" });
  if (out[out.length - 1].role !== "user") out.push({ role: "user", content: "請接著回覆。" });
  return { system: sys.join("\n\n"), messages: out };
}

// 把錯誤分成三類：transient／quota／config
function classifyClaudeError(status, type, message) {
  const msg = String(message || "").toLowerCase();
  if (status === 402 || type === "billing_error" || /credit balance|billing|insufficient.*credit/.test(msg)) return "quota";
  if (status === 429 || status === 408 || status === 409 || status >= 500 || type === "overloaded_error" || type === "timeout" || type === "network") return "transient";
  return "config";
}

async function claudeOnce({ apiKey, model, system, messages, maxTokens, effort, timeoutMs, fetchImpl }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const body = { model, max_tokens: maxTokens, messages, output_config: { effort } };
    if (system) body.system = system;
    let r;
    try {
      r = await fetchImpl(ANTHROPIC_URL, {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e) {
      return { ok: false, kind: classifyClaudeError(0, ctrl.signal.aborted ? "timeout" : "network", ""), code: ctrl.signal.aborted ? "timeout" : "network" };
    }
    let data = null;
    let bodyErr = "";
    try { data = await r.json(); } catch { data = null; bodyErr = ctrl.signal.aborted ? "timeout_body" : "bad_json"; }
    if (!r.ok) {
      // 先看 HTTP 狀態分類（body 讀不到也一樣），401／402／404 不能因為 body 壞掉就被當暫時故障
      if (!data) return { ok: false, kind: classifyClaudeError(r.status, "", ""), code: `${r.status}:${bodyErr}` };
      const type = data?.error?.type || "";
      return { ok: false, kind: classifyClaudeError(r.status, type, data?.error?.message), code: `${r.status}${type ? ":" + type : ""}` };
    }
    if (bodyErr) return { ok: false, kind: "transient", code: bodyErr }; // 200 但 body 讀不到：暫時故障
    if (!data || !Array.isArray(data.content)) return { ok: false, kind: "transient", code: "bad_shape" };
    const text = data.content.filter((b) => b && b.type === "text").map((b) => b.text).join("").trim();
    return { ok: true, stopReason: data?.stop_reason || "", text, usage: data?.usage || null, model: data?.model || model };
  } finally {
    clearTimeout(timer);
  }
}

function log(event, fields) {
  try { console.log(JSON.stringify({ evt: "llm_route", event, ...fields })); } catch { /* 不影響回覆 */ }
}

/**
 * routeChat：依開關先走 Claude，失敗依規則交給 callOpenAI。
 * @param {object} o
 * @param {object} o.env              平台環境變數（Vercel 傳 process.env）
 * @param {Array}  o.messages         OpenAI 格式 messages（給 Claude 用；OpenAI 那條由 callOpenAI 自己組）
 * @param {number} o.maxTokens        Claude max_tokens
 * @param {string} [o.reasoning]      原本給 OpenAI 的 reasoning_effort，會對應成 Claude effort
 * @param {Function} o.callOpenAI     async () => ({ text, finishReason, model })，照原本程式呼叫 OpenAI
 * @param {string} [o.refusalText]    Claude 拒答時回的固定訊息
 * @param {string} [o.system]         log 用的系統名
 * @param {string} [o.fallbackName]   備援那條的名字（預設 openai；本機工具傳 local-chain）
 * @param {number} [o.fallbackTimeoutMs] 開關是 claude 且換到備援時，備援那次的時間上限
 * @param {boolean} [o.stayOnFallback] 同一則訊息前面已換到備援時傳 true
 * @param {number} [o.deadlineAt]     整則訊息的截止時間戳；Claude 這段不會超過它
 * @param {Function} [o.fetchImpl]
 * @returns {Promise<{text:string, finishReason:string, provider:string, model:string, fallbackReason:string|null, refused:boolean}>}
 */
async function routeChat(o) {
  const env = o.env || {};
  const fetchImpl = o.fetchImpl || fetch;
  const sysName = o.system || "unknown";
  const primary = String(env.LLM_PRIMARY || "openai").toLowerCase();
  const started = Date.now();

  const viaOpenAI = async (fallbackReason) => {
    const signal = fallbackReason && typeof AbortSignal !== "undefined" && AbortSignal.timeout
      ? AbortSignal.timeout(o.fallbackTimeoutMs || 25000) : undefined;
    const r = await o.callOpenAI(signal ? { signal } : {});
    const provider = o.fallbackName || "openai";
    log("done", { system: sysName, provider, fallbackReason, ms: Date.now() - started });
    return { text: r.text, finishReason: r.finishReason || "", provider, model: r.model || "", fallbackReason, refused: false };
  };

  if (primary !== "claude") return viaOpenAI(null);
  // 多輪對話裡同一則已經換到 OpenAI：後面幾輪留在 OpenAI，但仍套用備援時間上限
  if (o.stayOnFallback) return viaOpenAI("sticky");
  const apiKey = env.ANTHROPIC_API_KEY || "";
  if (!apiKey) { log("alert", { system: sysName, reason: "claude_key_missing" }); return viaOpenAI("claude_key_missing"); }
  if (Date.now() < claudeCooldownUntil) return viaOpenAI("claude_quota_cooldown");
  if (o.deadlineAt && o.deadlineAt - Date.now() < 3000) return viaOpenAI("claude_deadline");

  const model = env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL;
  let budget = envNum(env.CLAUDE_BUDGET_MS, 20000);
  if (o.deadlineAt) budget = Math.min(budget, o.deadlineAt - started);
  const { system, messages } = toClaudeMessages(o.messages || []);
  const effort = mapEffort(o.reasoning);

  let res = null;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = budget - (Date.now() - started);
      if (remaining < 1500) { res = res || { ok: false, kind: "transient", code: "budget_exhausted" }; break; }
      // 第一次最多用六成預算，留時間給重試一次
      const timeoutMs = attempt === 0 ? Math.max(1500, Math.floor(remaining * 0.6)) : remaining;
      res = await claudeOnce({ apiKey, model, system, messages, maxTokens: o.maxTokens || 4000, effort, timeoutMs, fetchImpl });
      if (res.ok || res.kind !== "transient") break;
    }
  } catch {
    res = { ok: false, kind: "transient", code: "unexpected" }; // 任何意外都不能擋住備援
  }

  if (res.ok) {
    if (res.stopReason === "refusal") {
      log("done", { system: sysName, provider: "claude", refused: true, ms: Date.now() - started });
      return { text: o.refusalText || DEFAULT_REFUSAL_TEXT, finishReason: "refusal", provider: "claude", model: res.model, fallbackReason: null, refused: true };
    }
    if (!res.text) {
      // 空回覆（多半是 max_tokens 被思考吃完）當暫時故障處理，交給 OpenAI
      return viaOpenAI(`claude_empty:${res.stopReason || "na"}`);
    }
    log("done", { system: sysName, provider: "claude", stopReason: res.stopReason, inTok: res.usage?.input_tokens, outTok: res.usage?.output_tokens, ms: Date.now() - started });
    return { text: res.text, finishReason: res.stopReason === "max_tokens" ? "length" : "stop", provider: "claude", model: res.model, fallbackReason: null, refused: false };
  }

  if (res.kind === "quota") claudeCooldownUntil = Date.now() + envNum(env.CLAUDE_COOLDOWN_MS, 1800000);
  if (res.kind === "config") log("alert", { system: sysName, reason: "claude_config_error", code: res.code });
  return viaOpenAI(`claude_${res.kind}:${res.code}`);
}

module.exports = { _resetCooldownForTest, toClaudeMessages, classifyClaudeError, routeChat };
