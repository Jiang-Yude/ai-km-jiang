// 會員登入與留言板：邏輯在 cloudflare/member.mjs；未設定 Google 金鑰時回 503（config 回 enabled:false）
import {handleMember} from '../../cloudflare/member.mjs';
export const onRequest = context => handleMember(context);
