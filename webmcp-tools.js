/* ============================================================
   webmcp-tools.js · WebMCP 唯讀工具層 v1（2026-08-30）
   ------------------------------------------------------------
   把站內既有的公開索引（site-index.json＋search-aliases.js）
   包成四個 WebMCP 工具，讓支援 WebMCP 的瀏覽器 AI（如 ChatGPT
   的 Site tools、Chrome origin trial）可以直接查站內內容。

   邊界（改這支檔案前先讀）：
   - 只有唯讀查詢。不收表單、不寫入內容、不碰任何私人資料。
   - 資料源只有兩個：同源的 /site-index.json 與 window.SEARCH_ALIASES
     （search-aliases.js）。不得新增外部請求。
   - 唯一的寫出＝匿名使用記錄 fire-and-forget 到同源 /api/search-log
     （2026-08-30 江江拍板；跟站內搜尋 log 同一套），只記查詢字串與
     命中數、不記身分，失敗靜默、絕不影響工具回傳。要再加任何寫出，
     先回官網看板拍板，並同步改 scripts/check-webmcp.mjs 的白名單。
   - 搜尋語意刻意與 search.js 一致（小寫子字串 AND 比對，欄位＝
     title/summary/problem/audience/id＋三維 tags＋別名庫）。改比對
     邏輯要兩邊一起改，不要讓站內搜尋與 WebMCP 搜尋各說各話。
   - 服務價格的真相在 offers.json／offers 頁，本檔不硬編任何價格
     與長篇人物介紹；get_site_capabilities 只給入口。
   - WebMCP 仍是 W3C Community Group 草案（document.modelContext），
     不支援的瀏覽器必須完全無感：功能偵測不過就整支直接 return，
     任何註冊失敗都吞掉，不往 console 丟錯。
   ============================================================ */
(function () {
  "use strict";

  var mc;
  try {
    mc = typeof document !== "undefined" ? document.modelContext : null;
  } catch (e) {
    return;
  }
  if (!mc || typeof mc.registerTool !== "function") {
    return;
  }

  var FALLBACK_BASE_URL = "https://jiangyude.com";
  var VALID_TYPES = ["article", "course", "case", "skill", "resource", "page", "tool", "offer"];
  var DIMENSIONS = ["topic", "level", "content_type"];

  var indexPromise = null;

  function loadIndex() {
    if (indexPromise) return indexPromise;
    indexPromise = fetch("/site-index.json")
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.items)) throw new Error("bad index shape");
        return data;
      })
      .catch(function (err) {
        indexPromise = null; // 下一次呼叫可以重試
        throw err;
      });
    return indexPromise;
  }

  function baseUrl(data) {
    return (data && data.site && data.site.base_url) || FALLBACK_BASE_URL;
  }

  function absUrl(data, url) {
    var u = String(url || "");
    if (/^https?:\/\//.test(u)) return u;
    if (u.charAt(0) !== "/") u = "/" + u;
    return baseUrl(data) + u;
  }

  /* ── 與 search.js 相同的比對範圍 ── */

  function flattenTags(tags) {
    if (!tags) return [];
    var out = [];
    DIMENSIONS.forEach(function (dim) {
      (tags[dim] || []).forEach(function (v) {
        out.push(v);
      });
    });
    return out;
  }

  function aliasesFor(id) {
    var map = (typeof window !== "undefined" && window.SEARCH_ALIASES) || {};
    var plain = String(id || "").replace(/^article-/, "");
    return map[id] || map[plain] || [];
  }

  function matchesQuery(item, query) {
    var haystack = [item.title, item.summary, item.problem, item.audience, item.id]
      .concat(flattenTags(item.tags))
      .concat(aliasesFor(item.id))
      .join(" ")
      .toLowerCase();
    var tokens = query.split(/\s+/).filter(Boolean);
    return tokens.every(function (token) {
      return haystack.indexOf(token) !== -1;
    });
  }

  /* ── 共用回傳格式 ── */

  function fail(code, message, extra) {
    var out = { ok: false, error: { code: code, message: message } };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k];
      }
    }
    return out;
  }

  function publicItem(data, item) {
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      url: absUrl(data, item.url),
      date: item.date || null,
      updated: item.updated || null,
      summary: item.summary || "",
      problem: item.problem || "",
      audience: item.audience || "",
      tags: item.tags || {},
    };
  }

  /* limit 嚴格驗證：只收範圍內整數，其餘一律結構化錯誤。
     （2026-08-30 Codex 跨家審必改項：不得悄悄把 "2"、2.7、true、99
     收斂成合法值，執行期行為要跟公開 inputSchema 說的一樣。） */
  function readLimit(value, def, max) {
    if (value === undefined) return { ok: true, value: def };
    if (typeof value !== "number" || !isFinite(value) || Math.floor(value) !== value) return { ok: false };
    if (value < 1 || value > max) return { ok: false };
    return { ok: true, value: value };
  }

  /* additionalProperties: false 的執行期對應：列出不認識的參數 */
  function unknownKeys(input, allowed) {
    var extra = [];
    for (var k in input) {
      if (Object.prototype.hasOwnProperty.call(input, k) && allowed.indexOf(k) === -1) extra.push(k);
    }
    return extra;
  }

  /* 內容 ID 的合法形態（現行 213 筆全符合；非法值不回顯，收小
     prompt injection 與上下文膨脹面） */
  var ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

  /* execute 的統一保險：任何內部錯誤都收成結構化錯誤物件，
     不讓例外細節（堆疊、路徑）流出去。
     同時做 schema type:"object" 的執行期對應：undefined 視為沒帶參數，
     null／陣列／純量一律結構化錯誤，不悄悄當成空物件。 */
  function guard(fn) {
    return function (input) {
      return Promise.resolve()
        .then(function () {
          if (input === undefined) input = {};
          if (typeof input !== "object" || input === null || Array.isArray(input)) {
            return fail("invalid_input", "參數必須是 JSON 物件。(input must be a JSON object.)");
          }
          return fn(input);
        })
        .catch(function () {
          return fail("internal_error", "工具執行失敗，請稍後再試。(Tool failed, please retry later.)");
        });
    };
  }

  function indexUnavailable() {
    return fail("index_unavailable", "站內索引 site-index.json 暫時載入失敗，請稍後再試。");
  }

  /* 匿名使用記錄：本檔唯一的寫出動作。fire-and-forget、失敗靜默。 */
  function logToolCall(tool, q, n) {
    try {
      var body = JSON.stringify({
        q: String(q || "").slice(0, 80),
        n: typeof n === "number" ? n : null,
        surface: "webmcp",
        tool: tool,
      });
      /* sendBeacon 回傳 false＝沒排進傳送佇列，也要走 fetch fallback */
      var sent = false;
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        try {
          sent = navigator.sendBeacon("/api/search-log", new Blob([body], { type: "application/json" })) === true;
        } catch (e2) {
          sent = false;
        }
      }
      if (!sent) {
        fetch("/api/search-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body,
          keepalive: true,
        }).catch(function () {});
      }
    } catch (e) {
      /* 記錄失敗不影響工具 */
    }
  }

  /* ── 工具一：search_knowledge ── */

  function searchKnowledge(input) {
    var extra = unknownKeys(input, ["query", "type", "limit"]);
    if (extra.length) {
      return fail("invalid_input", "不接受的參數。允許的參數：query、type、limit。", { allowed_keys: ["query", "type", "limit"] });
    }
    /* 用原始值驗長度（不先 trim），行為才跟 inputSchema 的 minLength/maxLength 一致 */
    var rawQuery = input.query;
    if (typeof rawQuery !== "string" || rawQuery.length < 1 || rawQuery.length > 120) {
      return fail("invalid_query", "query 必填，長度 1 到 120 字。(query is required, 1-120 chars.)");
    }
    var query = rawQuery.trim();
    if (!query) {
      return fail("invalid_query", "query 不能只有空白。(query cannot be whitespace only.)");
    }
    if (input.type !== undefined && VALID_TYPES.indexOf(input.type) === -1) {
      return fail("invalid_type", "type 只接受：" + VALID_TYPES.join("、") + "。", { valid_types: VALID_TYPES });
    }
    var lim = readLimit(input.limit, 5, 10);
    if (!lim.ok) {
      return fail("invalid_limit", "limit 只接受 1 到 10 的整數，超界不自動收斂。(limit must be an integer between 1 and 10.)");
    }
    var q = query.toLowerCase();
    return loadIndex().then(
      function (data) {
        var matched = data.items.filter(function (item) {
          var typeMatch = !input.type || item.type === input.type;
          return typeMatch && matchesQuery(item, q);
        });
        logToolCall("search_knowledge", query, matched.length);
        return {
          ok: true,
          query: query,
          type: input.type || "all",
          total: matched.length,
          returned: Math.min(matched.length, lim.value),
          items: matched.slice(0, lim.value).map(function (item) {
            return publicItem(data, item);
          }),
          hint: matched.length === 0 ? "換個關鍵字再試；多詞會做 AND 比對，可先減少詞數。" : undefined,
        };
      },
      indexUnavailable
    );
  }

  /* ── 工具二：get_knowledge_item ── */

  function getKnowledgeItem(input) {
    var extra = unknownKeys(input, ["id"]);
    if (extra.length) {
      return fail("invalid_input", "不接受的參數。允許的參數：id。", { allowed_keys: ["id"] });
    }
    /* 驗原始值、不 trim：schema 的 pattern 不收前後空白，執行期也不收 */
    var id = input.id;
    if (typeof id !== "string" || !ID_PATTERN.test(id)) {
      /* 非法 id 不回顯原值 */
      return fail("invalid_id", "id 必填，只接受英數、點、底線、連字號，長度 1 到 64，前後不可有空白（可先用 search_knowledge 取得精確 ID）。");
    }
    return loadIndex().then(
      function (data) {
        var hit = null;
        for (var i = 0; i < data.items.length; i++) {
          if (data.items[i].id === id) {
            hit = data.items[i];
            break;
          }
        }
        logToolCall("get_knowledge_item", id, hit ? 1 : 0);
        if (!hit) {
          return fail("not_found", "找不到這個 ID 的公開內容。", {
            id: id,
            hint: "ID 需完全一致；不確定時先用 search_knowledge 搜關鍵字。",
          });
        }
        return { ok: true, item: publicItem(data, hit) };
      },
      indexUnavailable
    );
  }

  /* ── 工具三：list_knowledge_taxonomy ── */

  function listKnowledgeTaxonomy(input) {
    var extra = unknownKeys(input, ["dimension", "limit"]);
    if (extra.length) {
      return fail("invalid_input", "不接受的參數。允許的參數：dimension、limit。", { allowed_keys: ["dimension", "limit"] });
    }
    var dimension = typeof input.dimension === "string" ? input.dimension : "";
    if (DIMENSIONS.indexOf(dimension) === -1) {
      return fail("invalid_dimension", "dimension 只接受：topic、level、content_type。", {
        valid_dimensions: DIMENSIONS,
      });
    }
    var lim = readLimit(input.limit, 50, 50);
    if (!lim.ok) {
      return fail("invalid_limit", "limit 只接受 1 到 50 的整數，超界不自動收斂。(limit must be an integer between 1 and 50.)");
    }
    return loadIndex().then(
      function (data) {
        var declared = (data.tag_dimensions && data.tag_dimensions[dimension]) || [];
        var counts = {};
        data.items.forEach(function (item) {
          var vals = (item.tags && item.tags[dimension]) || [];
          vals.forEach(function (v) {
            counts[v] = (counts[v] || 0) + 1;
          });
        });
        var values = declared.map(function (v) {
          return { value: v, count: counts[v] || 0 };
        });
        // 依使用量排序，讓 agent 先看到主力分類
        values.sort(function (a, b) {
          return b.count - a.count;
        });
        logToolCall("list_knowledge_taxonomy", dimension, values.length);
        return {
          ok: true,
          dimension: dimension,
          updated: data.updated || null,
          total_values: values.length,
          values: values.slice(0, lim.value),
        };
      },
      indexUnavailable
    );
  }

  /* ── 工具四：get_site_capabilities ── */

  function getSiteCapabilities(input) {
    var extra = unknownKeys(input, []);
    if (extra.length) {
      return fail("invalid_input", "本工具不收任何參數。", { allowed_keys: [] });
    }
    return loadIndex().then(
      function (data) {
        var base = baseUrl(data);
        logToolCall("get_site_capabilities", "get_site_capabilities", 1);
        return {
          ok: true,
          site: {
            name: (data.site && data.site.name) || "江江教練 · AI 知識管理",
            url: base + "/",
            summary: (data.site && data.site.summary) || "",
            index_updated: data.updated || null,
          },
          webmcp_tools: [
            { name: "search_knowledge", purpose: "搜尋站內公開內容（文章、課程、案例、技能包、資源、頁面、工具、服務入口）" },
            { name: "get_knowledge_item", purpose: "用精確 ID 取得單筆公開索引資料與正式網址" },
            { name: "list_knowledge_taxonomy", purpose: "列出站內分類維度（topic／level／content_type）與各分類數量" },
            { name: "get_site_capabilities", purpose: "說明本站對 AI 開放的入口與資料邊界" },
          ],
          agent_endpoints: {
            agent_guide: base + "/agent.html",
            llms_txt: base + "/llms.txt",
            site_index: base + "/site-index.json",
            profile: base + "/profile.json",
          },
          data_boundary:
            "以上工具只讀兩個公開來源：站內索引 site-index.json 與搜尋別名庫 search-aliases.js，內容與站內搜尋一致。沒有寫入內容、送出表單、預約或付款功能；唯一的資料回傳＝工具呼叫的查詢字串、命中數、時間、來源標記與工具名會嘗試匿名記錄（與站內搜尋 log 同一套），用於補齊別名與內容缺口，沒有 IP、帳號或任何身分資訊。服務方案與價格一律以官網服務方案頁當下內容為準，此處不另列。",
          offers_page: base + "/offers.html",
        };
      },
      indexUnavailable
    );
  }

  /* ── 註冊 ──
     registerTool 回傳 Promise，且規格允許在特定環境下 reject；
     這裡整包吞掉，確保任何實作差異都不會在頁面上留下錯誤。 */

  function register(tool) {
    try {
      var p = mc.registerTool(tool);
      if (p && typeof p.catch === "function") p.catch(function () {});
    } catch (e) {
      /* 靜默：漸進增強，註冊失敗等同不支援 */
    }
  }

  register({
    name: "search_knowledge",
    description:
      "搜尋江江教練官網的公開內容：深度文章、課程講座、合作案例、技能包、簡報資源、網站頁面、工具與服務入口。多個關鍵字會做 AND 比對。Search public knowledge items on this site.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, maxLength: 120, description: "關鍵字，1 到 120 字；空格分隔多詞時每個詞都要命中" },
        type: { type: "string", enum: VALID_TYPES, description: "選填，限定內容類型" },
        limit: { type: "integer", minimum: 1, maximum: 10, description: "選填，回傳筆數上限，預設 5" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: guard(searchKnowledge),
  });

  register({
    name: "get_knowledge_item",
    description:
      "用精確 ID 取得官網單筆公開內容的索引資料與正式網址。ID 可先用 search_knowledge 查到。Get one public knowledge item by exact id.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          minLength: 1,
          maxLength: 64,
          pattern: "^[A-Za-z0-9._-]+$",
          description: "內容 ID，需完全一致（例：article-what-is-loop-engineering）",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: guard(getKnowledgeItem),
  });

  register({
    name: "list_knowledge_taxonomy",
    description:
      "列出官網內容的分類維度與各分類的內容數量。dimension 可選 topic（主題）、level（難度）、content_type（內容形式）。List site taxonomy values with counts.",
    inputSchema: {
      type: "object",
      properties: {
        dimension: { type: "string", enum: DIMENSIONS, description: "要列的維度" },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "選填，回傳筆數上限，預設 50" },
      },
      required: ["dimension"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: guard(listKnowledgeTaxonomy),
  });

  register({
    name: "get_site_capabilities",
    description:
      "說明本站是什麼、對 AI 開放哪些工具與資料入口（agent.html、llms.txt、site-index.json、profile.json），以及公開資料的邊界。Describe this site's AI-facing capabilities and data boundary.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: guard(getSiteCapabilities),
  });
})();
