// 延後公開入口：只有 cloudflare/embargo.json 列的路徑會進來（build.mjs 寫 _routes.json），邏輯在 cloudflare/embargo.mjs
import {handleEmbargo} from '../../cloudflare/embargo.mjs';
export const onRequest = context => handleEmbargo(context);
