// LINE 名片分享器共用：檢查 Flex 名片、把名片壓進分享連結、從連結還原（/line-card-share/ 與 /card/share/ 共用）
var FLEX_SHARE = (function(){
  var LIFF_URL = 'https://liff.line.me/2012081068-MnNPDX8P';
  var MAX_BYTES = 30000;           // 名片 JSON 上限，避免連結長到 LINE 打不開
  var MAX_CODE = 20000;            // 連結參數長度上限（解碼前先擋）
  var MAX_DEPTH = 40;              // 巢狀層數上限
  var URI_OK = /^(https:\/\/|http:\/\/|line:\/\/|tel:|mailto:)/i;

  // 接受三種貼法：完整訊息 {type:'flex',...}、單張 bubble、輪播 carousel
  function normalize(obj, altText){
    if (!obj || typeof obj !== 'object') throw new Error('不是 JSON 物件');
    if (obj.type === 'flex') return obj;
    if (obj.type === 'bubble' || obj.type === 'carousel') return { type:'flex', altText: altText || '名片', contents: obj };
    throw new Error('最外層要是 flex、bubble 或 carousel');
  }

  // 只放行看得懂的名片：格式對、張數不超過 12、連結只能是網址、LINE、電話、Email
  function check(msg){
    var errs = [];
    if (typeof msg.altText !== 'string' || !msg.altText.trim()) errs.push('缺少 altText（聊天列表上顯示的那一行字）');
    else if (msg.altText.length > 400) errs.push('altText 超過 400 字');
    var c = msg.contents || {};
    if (c.type === 'carousel') {
      if (!Array.isArray(c.contents) || !c.contents.length) errs.push('carousel 裡沒有名片');
      else if (c.contents.length > 12) errs.push('一組最多 12 張，目前 ' + c.contents.length + ' 張');
    } else if (c.type !== 'bubble') errs.push('contents 要是 bubble 或 carousel');
    var hosts = {};
    (function walk(n, path, depth){
      if (depth > MAX_DEPTH) { errs.push('名片巢狀太深'); return; }
      if (Array.isArray(n)) return n.forEach(function(x, i){ walk(x, path + '[' + i + ']', depth + 1); });
      if (!n || typeof n !== 'object') return;
      if (n.action) {
        var a = n.action;
        if (a.type === 'uri') { if (!URI_OK.test(a.uri || '')) errs.push(path + ' 的連結不是網址：' + (a.uri || '空白')); else if (/^https?:/i.test(a.uri)) { try { hosts[new URL(a.uri).hostname] = 1; } catch(e){ errs.push(path + ' 的網址格式不對'); } } }
        else if (a.type !== 'message' && a.type !== 'clipboard') errs.push(path + ' 的按鈕類型 ' + a.type + ' 在分享名片裡用不到');
        // 不管哪種按鈕，帶了 uri／altUri 欄位都要是安全網址
        if (a.type !== 'uri' && a.uri != null) errs.push(path + ' 的按鈕不該帶 uri 欄位');
        if (a.altUri && a.altUri.desktop && !URI_OK.test(a.altUri.desktop)) errs.push(path + ' 的電腦版連結不是網址');
      }
      if (n.type === 'image' && !/^https:\/\//i.test(n.url || '')) errs.push(path + ' 的圖片要用 https:// 開頭的公開網址');
      Object.keys(n).forEach(function(k){ if (k !== 'action' && typeof n[k] === 'object') walk(n[k], path + '.' + k, depth + 1); });
    })(c, 'contents', 0);
    errs.hosts = Object.keys(hosts);
    var bytes = new TextEncoder().encode(JSON.stringify(msg)).length;
    if (bytes > MAX_BYTES) errs.push('名片太大（' + bytes + ' bytes，上限 ' + MAX_BYTES + '），請減少張數或文字');
    return errs;
  }

  function b64url(bytes){ var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64url(s){ s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
    var b = atob(s), out = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out; }
  async function pipe(bytes, stream, cap){
    // 邊讀邊算，超過上限就停（避免一小段連結解壓出巨量資料）
    var reader = new Blob([bytes]).stream().pipeThrough(stream).getReader(), chunks = [], total = 0;
    for (;;) { var r = await reader.read(); if (r.done) break; total += r.value.length;
      if (cap && total > cap) { reader.cancel(); throw new Error('名片太大'); } chunks.push(r.value); }
    var out = new Uint8Array(total), o = 0; chunks.forEach(function(c){ out.set(c, o); o += c.length; }); return out;
  }

  // 編碼：z＝壓縮過（瀏覽器支援 CompressionStream 時），j＝沒壓縮
  async function encode(msg){
    var raw = new TextEncoder().encode(JSON.stringify(msg));
    if (typeof CompressionStream === 'function') return 'z' + b64url(await pipe(raw, new CompressionStream('deflate-raw')));
    return 'j' + b64url(raw);
  }
  async function decode(code){
    if (!code || code.length > MAX_CODE) throw new Error('分享連結太長或是空的');
    var kind = code.charAt(0), bytes = unb64url(code.slice(1));
    if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'), MAX_BYTES);
    else if (bytes.length > MAX_BYTES) throw new Error('名片太大');
    else if (kind !== 'j') throw new Error('看不懂這個分享連結');
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  async function shareUrl(msg){ return LIFF_URL + '?c=' + await encode(msg); }

  return { LIFF_URL: LIFF_URL, normalize: normalize, check: check, encode: encode, decode: decode, shareUrl: shareUrl };
})();
