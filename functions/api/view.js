import factory from "../../.cloudflare-generated/view.mjs";
import {siteItems} from "../../.cloudflare-generated/catalog.mjs";
import {serve} from "../../cloudflare/runtime.mjs";
// 2026-10-19 安全修補 M1：把打包時的 site-index.json 網址清單帶給 view.js 當路徑白名單（Pages 執行期讀不到檔案）。
const knownUrls = siteItems.map(i => i && i.url).filter(Boolean);
export const onRequest = context => serve("view",factory,{...context, env:{...context.env, VIEW_KNOWN_URLS: knownUrls}});
