// 線上擼貓：上傳照片生成背影貓、貓牆；邏輯在 cloudflare/petcat.mjs
import {handlePetcat} from '../../../cloudflare/petcat.mjs';
export const onRequest = context => handlePetcat(context);
