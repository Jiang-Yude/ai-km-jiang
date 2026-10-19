# LINE 名片製作指南（給 AI Agent 的說明檔）

> **Agent 請先讀這段：** 使用者把這份說明的網址貼給你，請你照著它幫他設計一組 LINE 名片（LINE Flex Message）。
> 做好的 JSON，使用者會貼進江江教練的「LINE 名片分享器」：https://jiangyude.com/line-card-share/
> 分享器會檢查格式、產生一條分享連結。使用者用手機 LINE 打開那條連結，就能選好友或群組，把名片傳出去。
> 想看做好的樣子：同一頁最上面是江江自己的五張名片。

---

## 第一步：先訪談，不要直接產出

一次只問一小組問題，口氣友善，等使用者回答再往下問。至少問到：

1. **這組名片給誰看**：個人、店家、社團、公司或活動？職稱或行業？
2. **基本資料**：姓名或品牌名、一句話說明能幫人解決什麼、LINE 加好友連結、網站、電話、Email（沒有的可以跳過）。
3. **要放幾張、每張講什麼**：建議 3 到 5 張。給使用者參考這個順序，讓他刪減或調整：
   - 第 1 張：我是誰、一句話、最重要的一顆按鈕（通常是加 LINE 好友）。
   - 中間幾張：提供的服務、做過的案例或數字、別人為什麼信任你。每張只講一件事。
   - 最後一張：看完可以做的下一步（例如「直接在 LINE 回覆我，約一次免費諮詢」）。
4. **圖片**：有沒有頭像或作品圖？一定要是 `https://` 開頭、直接打得開的圖片網址（jpg、png），最好放在他自己的網站上。沒有就不放圖。
5. **顏色**：有沒有品牌色？沒有就請他從「米白暖色、深色燙金、清爽藍、自然綠」裡挑一個。

問完先用條列**複述設計方向**（張數、每張內容、配色、按鈕連去哪），使用者確認後才輸出 JSON。
使用者要修改時，每次都重新輸出**完整的** JSON。

---

## 第二步：輸出規定（最重要）

使用者會把你的輸出**直接貼進分享器**，所以：

1. **只輸出一段純 JSON**，放在一個 json 程式碼區塊裡，前後不要有說明文字。
2. **必須是標準 JSON**：屬性名稱與字串用雙引號；不可以有註解、結尾多餘逗號、變數或樣板字串。
3. **最外層用完整訊息格式**：
   `{"type":"flex","altText":"……","contents":{"type":"carousel","contents":[ ……每張一個 bubble…… ]}}`
   只有一張時，`contents` 直接放一個 `bubble`。
4. **altText** 是聊天列表上顯示的那一行字，寫成「名稱＋一句賣點」，400 字以內。
5. 輸出前自己確認 `JSON.parse` 會成功。

---

## 分享器會擋下的東西（照做就不會被退件）

| 規則 | 說明 |
|---|---|
| 最多 12 張 | carousel 最多 12 個 bubble；建議 3 到 5 張，張數越多連結越長 |
| 整組 30KB 以內 | 太大就減少張數或文字 |
| 按鈕只用 `uri` | `uri` 只能是 `https://`、`http://`、`line://`、`tel:`、`mailto:` 開頭；不要用 `postback` |
| 圖片只用 `https://` | 圖片網址一定要 https，而且是圖片檔本身，不是網頁 |
| 不要在別的動作塞 `uri` | `message`、`clipboard` 類型的按鈕不要另外帶 `uri` 欄位 |

---

## 排版建議（江江實際做過的經驗）

- **每張都設 `"size":"giga"`**，寬度一致。
- **所有 text 加 `"wrap":true`**，中文才不會被截掉。
- **高度要一起壓**：LINE 會把左右滑的每一張，都拉成跟最高那張一樣高。所以每張的字數盡量接近，不要有一張特別長。
- **手機一眼看得完**：一張大約 4 到 6 行字。江江最後用的是直式約 3:4 的比例。
- **不用每張都放按鈕**：最重要的按鈕放第 1 張就好，中間幾張專心講內容。
- **頭像要先裁好**：Flex 不能像網頁那樣放大裁切，圖片要先裁成想要的樣子再給網址。
- **動圖**：可以用 APNG，每張控制在 300KB 以內。

---

## 最小範例（一張）

```json
{"type":"flex","altText":"王小明的名片：室內設計、老屋翻新","contents":{"type":"bubble","size":"giga","body":{"type":"box","layout":"vertical","spacing":"md","paddingAll":"20px","backgroundColor":"#FFFCF6","contents":[{"type":"text","text":"王小明","size":"xxl","weight":"bold","color":"#382F26","wrap":true},{"type":"text","text":"室內設計師｜老屋翻新","size":"md","color":"#817466","wrap":true},{"type":"separator","margin":"lg","color":"#E3D8C6"},{"type":"text","text":"把三十年的老房子，改成住得舒服的家。","size":"md","color":"#382F26","wrap":true,"margin":"lg"}]},"footer":{"type":"box","layout":"vertical","paddingAll":"14px","contents":[{"type":"button","style":"primary","color":"#A27C45","height":"sm","action":{"type":"uri","label":"加我 LINE 好友","uri":"https://line.me/ti/p/~example"}}]}}}
```

---

## 做完之後，請告訴使用者

1. 把 JSON 貼到 https://jiangyude.com/line-card-share/ 的「名片 JSON」欄，按「檢查並預覽」。
2. 拿到分享連結後，先用手機 LINE 打開、傳給自己試一次。
3. 想在自己官網放一顆分享按鈕：分享器會給一段按鈕 HTML，貼進網頁就好。
4. 想要按鈕完全不依賴別人的網站：請他把這份說明交給你：https://jiangyude.com/line-card-share/build-your-own.md
