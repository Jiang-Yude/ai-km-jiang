# 在自己的官網放「分享我的 LINE 名片」按鈕（給 AI Agent 的施工說明）

> **Agent 請先讀這段：** 使用者想在他自己的網站上，做一顆按鈕：訪客用手機按下去，LINE 跳出選好友、選群組的畫面，對方收到可以左右滑的名片。
> 這份說明是江江教練在自己官網 jiangyude.com 實際做過的做法。做好的樣子：
> - 分享按鈕：https://liff.line.me/2012081068-MnNPDX8P
> - 對方掃 QR Code 看到的頁（Line 卡）：https://jiangyude.com/linecard/
> - 見面時自己拿手機給人看的頁（Line App）：https://jiangyude.com/lineapp/
> - 教學文章：https://jiangyude.com/articles/line-namecard-share-button/
>
> 名片內容（Flex JSON）還沒做好的話，先照這份說明做名片：https://jiangyude.com/line-card-share/agent-guide.md

---

## 先講清楚原理（請用白話跟使用者說一次）

- LINE 的圖文名片叫 Flex Message，它是「訊息」不是網頁。把網址貼進聊天室，對方只會看到一行連結。
- 要讓一般人用自己的 LINE 把名片傳出去，做法是叫出 LINE 的分享畫面（`liff.shareTargetPicker`）。
- 能叫出分享畫面的，是「在 LINE 裡打開的網頁」，叫 LIFF。所以要做三樣東西：一個 LIFF、一個放在他網站上的分享頁、一個名片檔。

---

## 第一階段：只有使用者本人能做的事（Agent 不要代做）

這幾步要登入使用者的 LINE 帳號、按同意書、做不可逆的公開，**請一步一步帶使用者自己按**，不要要求他給你密碼或代為登入：

1. 到 LINE Developers（https://developers.line.biz/console/）用自己的 LINE 登入，建立或選一個 Provider。
2. 在 Provider 底下建立 **LINE Login channel**。名稱會被 LINE 檢查，含「LINE」字樣可能存不進去，可以改用像「數位名片製作」這類名稱。
3. 在 channel 的 LIFF 分頁新增一個 LIFF：
   - Size：Full
   - Endpoint URL：他網站上分享頁的網址，例如 `https://他的網域/card/share/`（下一階段做出來的頁）
   - Scope：`openid`、`profile`
   - 打開 **shareTargetPicker**（會要求按一次資訊使用同意書）
4. 記下 **LIFF ID**（長得像 `1234567890-AbCdEfGh`），交給你。
5. 把 channel 從 Developing 改成 **Published**。沒公開前只有他自己能用。**這一步不能改回去，請使用者確認名稱與設定都沒問題再按。**

---

## 第二階段：Agent 幫他在網站上做的檔案

假設網站根目錄可以放靜態檔，建議的位置：

| 檔案 | 用途 |
|---|---|
| `card/line-flex.json` | 名片本體：完整 Flex 訊息 `{"type":"flex","altText":"…","contents":{…}}` |
| `card/share/index.html` | 分享頁（LIFF 的 Endpoint），打開就叫出選人畫面 |
| 首頁的一顆按鈕 | 連到 `https://liff.line.me/<LIFF ID>` |
| `linecard/index.html`（可選） | 給人掃 QR Code 看的頁：加好友按鈕＋名片預覽＋轉傳按鈕 |

### 分享頁範本（`card/share/index.html`）

把 `你的LIFF_ID` 換成第一階段拿到的 ID。

```html
<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>分享我的 LINE 名片</title></head>
<body>
<h1>分享我的 LINE 名片</h1>
<p>選好友或群組，對方會收到可以左右滑的名片。</p>
<button id="share" disabled>選擇好友或群組</button>
<p id="msg">準備中…</p>
<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
<script>
var LIFF_ID = '你的LIFF_ID';
var btn = document.getElementById('share'), msg = document.getElementById('msg'), card = null;
function say(t){ msg.textContent = t; }
async function share(){
  if (!liff.isApiAvailable('shareTargetPicker')) return say('請用手機 LINE 打開這一頁。');
  btn.disabled = true;
  try {
    var res = await liff.shareTargetPicker([card], { isMultiple: true });
    say(res ? '已分享，謝謝你！' : '已取消，想分享再按一次。');
  } catch (e) { say('分享失敗：' + e.message); }
  btn.disabled = false;
}
btn.onclick = share;
(async function(){
  try {
    card = await fetch('/card/line-flex.json').then(function(r){ return r.json(); });
    await liff.init({ liffId: LIFF_ID });
    if (!liff.isLoggedIn()) { say('請先登入 LINE…'); return liff.login({ redirectUri: location.href }); }
    btn.disabled = false; say('');
    share(); // 打開就直接跳選人畫面
  } catch (e) { say('開啟失敗：' + e.message); }
})();
</script>
</body></html>
```

### 首頁按鈕

```html
<a href="https://liff.line.me/你的LIFF_ID">分享我的 LINE 名片</a>
```

### Line 卡（可選）

一頁三件事，由上到下：
1. 綠色大按鈕「加我 LINE 好友」，連到他個人 LINE 的加好友連結（在 LINE 的「加入好友」→「行動條碼」可以取得，長得像 `https://line.me/ti/p/xxxx`）。
2. 名片預覽：讀 `card/line-flex.json`，用網頁畫出近似樣子，左右滑。
3. 「轉傳這組名片」按鈕，連到 `https://liff.line.me/你的LIFF_ID`。

再用 QR Code 產生器把 Line 卡網址做成 QR Code，印在實體名片或放手機上給人掃。

---

## 第三階段：測試清單（請使用者用手機做）

1. 手機 LINE 打開 `https://liff.line.me/你的LIFF_ID`，第一次會跳授權畫面，按允許。
2. 出現選人畫面，選自己的另一個帳號或一個朋友，送出。
3. 對方聊天室看到的是卡片，可以左右滑，按鈕點得開。
4. 換一個沒用過的朋友帳號試一次（確認 channel 已 Published，別人也能用）。
5. 在群組試一次。

---

## 常見問題

- **電腦上打開分享頁沒反應**：分享畫面只在手機 LINE 裡可用，電腦請改用手機測。
- **只有自己能分享，別人按了失敗**：channel 還在 Developing，要改成 Published。
- **名片顯示不出來或被退件**：用 LINE 官方的 Flex Message Simulator（https://developers.line.biz/flex-simulator/）貼 JSON 檢查；圖片要 https。
- **個人 LINE 能不能在對方加好友時自動傳名片**：不行，個人帳號沒有自動傳訊；要自己按分享傳給他。

---

## 不想自己架的替代做法

名片做好後，直接貼進江江的 LINE 名片分享器 https://jiangyude.com/line-card-share/ ，就能拿到分享連結和按鈕 HTML，不必開 LIFF。差別是那條連結背後走的是江江網站的分享頁；按鈕對他的生意很重要，或是要交付給客戶的話，長期建議照本說明自己架一個。
