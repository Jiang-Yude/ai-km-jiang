# secret-paste：讓 AI 替你貼密鑰，但看不到值

一支 macOS 上的 Python 小工具。你請 AI 幫忙把 API key、OAuth 用戶端密鑰、token 設定到 Cloudflare 或其他 CLI 時，值從剪貼簿（或隱藏輸入框）直接交給 CLI，不經過 AI 的對話紀錄。

說明文章：<https://jiangyude.com/articles/ai-paste-secret-without-seeing/>

授權：MIT。可以自由使用、修改、分享；不提供任何擔保，用之前請先讀完下面的「誠實邊界」。

## 它做什麼

1. 讀剪貼簿，只檢查格式（開頭、長度、中間不能有空白換行），格式不符就不寫入。
2. 剪貼簿沒有合格的值時，跳出 macOS 隱藏輸入框讓你自己貼（`--source auto`，預設）。
3. 值從 stdin 交給目標指令，不放進指令參數，所以 `ps` 和 shell 歷史紀錄都看不到。
4. wrangler 的輸出先遮蔽才印：值本身，以及值裡任何連續 6 個字元的片段，都換成 `[已遮蔽]`。自訂指令（`--target cmd`）的輸出一律不轉述，只回報成功或失敗。
5. 只印一行：`完成：...` 或 `失敗：...`。
6. 不論成功、失敗、參數打錯、被中斷、`--dry-run`、`--source dialog`，最後一律清空剪貼簿（參數打錯時剪貼簿裡多半正放著密鑰，清掉才安全）。清空時忽略中斷訊號。
7. 被中斷或逾時時，先關掉子行程（含隱藏輸入框）再清剪貼簿，不留下沒關的視窗。
8. 名稱類參數（key、project、name、env、account）用規則全字比對，不能以 `-` 開頭，免得被 wrangler 當成旗標、寫錯地方。

值只存在這支程式的記憶體裡：不寫檔、不經 shell、不印出。

## 安裝前提

| 需要 | 怎麼確認 | 沒有的話 |
|---|---|---|
| macOS | 這支用到 `pbcopy`、`pbpaste`、`osascript`，Windows 和 Linux 不能用 | 程式會直接拒跑 |
| Python 3.8 以上 | 終端機打 `python3 --version` | 到 python.org 下載，或請你的 AI 幫你裝 |
| wrangler（只有要寫進 Cloudflare 才需要） | 專案資料夾裡打 `npx wrangler --version` | 依 Cloudflare 官方建議裝在專案裡：`npm i -D wrangler@latest`，需要先有 Node.js |
| wrangler 已登入 | `npx wrangler whoami` 看得到你的帳戶 | `npx wrangler login` |

wrangler 裝在專案裡時，執行檔在 `node_modules/.bin/wrangler`，用 `--wrangler` 指給這支工具：

```
--wrangler "$PWD/node_modules/.bin/wrangler"
```

全域安裝的 wrangler（在 PATH 裡找得到）就不用帶 `--wrangler`。下面的用法範例都沒寫 `--wrangler`，wrangler 裝在專案裡的話，記得自己補上這個參數，不然會看到「找不到 wrangler」。

下載後放在任何資料夾都可以，下面的例子假設放在 `~/tools/secret-paste/`。

## 用法

### 寫進 Cloudflare Pages

```
python3 ~/tools/secret-paste/secret-paste.py \
  --target pages --key GOOGLE_CLIENT_SECRET --preset google-oauth \
  --project <Pages 專案名> --account <Cloudflare 帳戶 ID> --source clipboard
```

### 寫進 Cloudflare Worker

```
python3 ~/tools/secret-paste/secret-paste.py \
  --target worker --key MY_API_KEY --prefix <密鑰開頭> \
  --name <Worker 名稱> --account <Cloudflare 帳戶 ID> --source clipboard
```

### 其他會從 stdin 讀值的 CLI（例如 GitHub 的 `gh secret set`）

```
python3 ~/tools/secret-paste/secret-paste.py \
  --target cmd --key MY_TOKEN --preset github --source clipboard \
  -- gh secret set MY_TOKEN --repo <帳號>/<repo 名>
```

`--` 後面接的指令，必須是「沒給值就從 stdin 讀」的那種。不確定的話先查該 CLI 的說明。

### 先驗不寫

加 `--dry-run`，只驗格式並說明會寫到哪裡。注意 dry-run 跑完也會清空剪貼簿，正式跑之前要再按一次複製鍵。

### 參數

| 參數 | 說明 |
|---|---|
| `--target` | `pages`＝`wrangler pages secret put`；`worker`＝`wrangler secret put`；`cmd`＝`--` 後接自訂指令 |
| `--key` | 密鑰名稱 |
| `--prefix` | 預期開頭，可重複，符合任一個就算過 |
| `--preset` | 常用開頭：`google-oauth`（GOCSPX-）、`openai`（sk-）、`anthropic`（sk-ant-）、`github`（ghp_、github_pat_） |
| `--any-format` | 不檢查開頭。沒給開頭也沒寫這個就拒跑，避免誤貼別的東西 |
| `--min-length` | 最短長度，預設 8 |
| `--project` | Pages 專案名 |
| `--name` | Worker 名稱，worker 目標必填（不靠目前資料夾的 wrangler 設定檔猜） |
| `--env` | wrangler 的 `--env`。Pages 能不能用它指定預覽環境，以你的 wrangler 版本與 Cloudflare 官方文件為準 |
| `--account` | Cloudflare 帳戶 ID，也可用環境變數 `CLOUDFLARE_ACCOUNT_ID`。wrangler 目標必填：同一個登入可能管好幾個帳戶，非互動模式不帶會失敗或寫錯帳戶 |
| `--wrangler` | wrangler 執行檔路徑，預設找 PATH |
| `--cwd` | 目標指令的工作目錄 |
| `--source` | `auto`（預設，剪貼簿不合格才跳輸入框）、`clipboard`（只讀剪貼簿，不跳框）、`dialog`（直接跳框） |
| `--dry-run` | 只驗格式，不執行 |

## AI 代貼的完整流程

最簡單的做法：複製鍵你自己按，再跟 AI 說「已經複製好了，跑 secret-paste」，AI 只負責下指令。不需要瀏覽器自動化工具，也碰不到下面那顆雷。

要讓 AI 連複製鍵都替你按時：

1. AI 用瀏覽器自動化按網頁自己的「複製」鍵，讓密鑰進剪貼簿。找按鈕時只回傳座標或「找到／沒找到」，**不回傳任何可能含值的文字**（見下方的雷）。
2. AI 跑本工具，帶 `--source clipboard`（AI 自己跑時用這個，格式不符就停，不會突然跳框）。
3. 看到 `完成：` 就結束，剪貼簿已清空。

你人在電腦前、手上有值但網頁沒有複製鍵時，把指令裡的 `--source clipboard` 改成 `--source dialog`（或整個拿掉，用預設的 `auto`），程式才會跳出隱藏輸入框讓你自己貼。帶著 `--source clipboard` 時不會跳框。

### 可以直接貼給 AI 的交代

```
接下來要把 <密鑰名稱> 設定到 <Cloudflare Pages 專案名／Worker 名稱>。
請用 secret-paste.py 處理，規則：
1. 不准讀出、印出、轉述密鑰的值；不准跑 pbpaste。
2. 複製鍵我自己按。你如果要用瀏覽器幫我按，找按鈕只回傳座標或布林值，不回傳按鈕的文字或 aria-label。
3. 先跑 --dry-run 確認會寫到哪裡，給我看那一行。dry-run 跑完會清空剪貼簿，我說可以之後，我再按一次複製鍵，你正式跑。
4. wrangler 如果裝在專案裡，指令要加 --wrangler 指到 node_modules/.bin/wrangler。
5. 工具只會回一行「完成」或「失敗」，照實轉告我就好。
```

## ⚠️ 雷：Google Cloud 複製鍵的 aria-label 含完整密鑰

Google Cloud 主控台「複製到剪貼簿」按鈕的 `aria-label`（給螢幕閱讀器讀的隱藏文字）直接帶著完整密鑰。用瀏覽器自動化（Claude in Chrome、Playwright 之類）列出按鈕或讀頁面文字時，回傳結果會把密鑰一起帶進對話紀錄。這種情況真的發生過，發生了就只能到 Google Cloud 把那把密鑰停用、刪除，再發一把新的。

做法：在頁面裡跑的腳本，回傳前先遮掉，例如

```
label.replace(/GOCSPX-[A-Za-z0-9_-]+/g, "GOCSPX-[已遮蔽]")
```

更保險的做法是根本不回傳文字，只回「找到沒有」和按鈕座標。其他服務的複製鍵也可能有同樣問題，碰新網站一律先當作會漏。

## 誠實邊界

- 威脅模型是「防 AI 不小心看到值」，不是防惡意程式。存心要看的代理直接跑 `pbpaste`、或用 `--wrangler` 換成假執行檔，就能拿到值，這支擋不了。
- 剪貼簿歷史工具（Maccy、Raycast、Paste 這類）會另外留一份紀錄，這支清空的是目前的剪貼簿，清不到歷史。有裝這類工具的機器，要在工具裡排除來源，或改用 `--source dialog`。
- 這支只保證「它自己」不印值。AI 在它之前用瀏覽器讀頁面、或之後另外跑 `pbpaste`，它管不到。
- 隱藏輸入框會跳到畫面最前面，你要在電腦前才用得到；沒人顧著時用 `--source clipboard`。
- 隱藏輸入框這條路只驗過程式語法，還沒實際跳框測過。
- wrangler 輸出的遮蔽只認得值的原樣片段；如果 CLI 把值改寫（例如 base64）再印出來，遮不到。自訂指令因為不知道會怎麼印，所以完全不轉述輸出，失敗時只看得到 exit code。
- 作者只用假的 pbcopy、pbpaste、wrangler 測過，沒有對真的 Cloudflare 專案寫入。Cloudflare 官方文件寫明 `wrangler secret put` 可以接管線輸入；`wrangler pages secret put` 的文件沒寫到這點，第一次用請先拿不重要的測試值試：名稱取 `SECRET_PASTE_TEST`、值隨便打一串符合開頭的字，看到「完成」後到 Cloudflare 後台確認有這個名稱，再把它刪掉。

## 測試紀錄

用假值與假的 pbcopy、pbpaste、wrangler 實測 15 項，全數符合預期：

| # | 情境 | 結果 |
|---|---|---|
| 1 | 剪貼簿 `TEST-123`，預期 `GOCSPX-` | 拒絕，目標沒執行，exit 1 |
| 2 | 目標是會把值印回來的指令 | 只印「自訂指令輸出不轉述」，含值片段 0 次 |
| 3 | 剪貼簿尾端多一個換行 | 目標收到的值雜湊與原值相同（尾端換行已去掉） |
| 4 | 值中間有換行 | 拒絕 |
| 5 | 假 wrangler 失敗，錯誤訊息印出值的前 7 碼 | 失敗訊息顯示 `[已遮蔽]`，含值片段 0 次 |
| 6 | pages 沒帶 account | 拒絕，exit 2 |
| 7 | pages `--dry-run` | 只列出會寫到哪，沒執行 |
| 8 | 沒給開頭 | 拒絕，exit 2 |
| 9 | `--project=--env`（以 - 開頭） | 拒絕，exit 2 |
| 10 | worker 沒帶 `--name` | 拒絕，exit 2 |
| 11 | `--wrangler` 指向資料夾 | 單行報錯「無法執行目標指令」，沒有程式錯誤堆疊 |
| 12 | pages 成功路徑 | 完成，wrangler 收到正確參數，值雜湊相符 |
| 13 | worker 成功路徑 | 完成，參數帶 `--name` |
| 14 | 參數打錯 | 報錯，exit 2 |
| 15 | 目標指令執行中，本程式被 SIGTERM | exit 130，子行程已結束，沒有留下沒關的行程 |

15 項跑完剪貼簿都是 0 bytes。
