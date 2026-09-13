# 花漾生活 Flower Life

## 項目介紹

這是將花卉購物網站前台、管理後台與 REST API 放在同一個 Node.js 專案的教學實作。套件名稱為 `backend-project`，`package.json` 版本為 `1.0.0`、`private: true`。網站不是獨立 Vue SPA：Express 回傳 EJS 頁面，頁面再以瀏覽器中的 Vue 3 與 Fetch 載入、操作資料。

訪客可以瀏覽商品、使用購物車；註冊登入後可以建立訂單、查看個人訂單並模擬付款成功或失敗。管理員可新增、編輯、刪除商品，以及查看全站訂單。所有資料保存在專案根目錄 SQLite 檔案，不需要另啟資料庫服務。

文件以目前原始碼為準。「已實作」表示路由及畫面已有對應程式，不代表所有邊界、安全性或瀏覽器流程都有自動測試。真正第三方金流、訪客購物車合併、運費入帳、訂單取消、退款與物流追蹤尚未實作；商品文案中的月配訂閱亦不是週期扣款功能。

## 技術棧

以下版本來自提交中的 `package-lock.json`，不是最新版本推薦。鎖檔格式為 3；安裝請優先使用 `npm ci`。

| 層次 | 技術／鎖定版本 | 在本專案的角色 |
| --- | --- | --- |
| 執行環境 | Node.js；本次檢視環境為 22.23.2、npm 11.2.0 | 專案未設定 `engines` 或 `.nvmrc`；可用 Node 22.x 重現 |
| HTTP | Express 4.16.4、cors 2.8.6 | API、頁面路由、JSON／表單解析、靜態資源與 CORS |
| 設定 | dotenv 16.6.1 | `app.js` 載入根目錄 `.env` |
| 資料 | better-sqlite3 12.8.0 | 同步 SQL、prepared statements、交易、WAL 與外鍵 |
| 身分 | bcrypt 6.0.0、jsonwebtoken 9.0.3、uuid 11.1.0 | 雜湊密碼、7 天 JWT、UUID v4 |
| HTML | EJS 5.0.1 | 前後台 layout、partials、各頁 HTML |
| 瀏覽器互動 | Vue 3 CDN global production build | 每頁 `createApp(...).mount('#app')`；不由 npm 鎖定確切版本 |
| 樣式 | Tailwind CSS／CLI 4.2.2 | CSS-first `@theme`，產生 `/css/output.css` |
| 文件生成 | swagger-jsdoc 6.2.8 | `@openapi` 註解轉為 OpenAPI 3.0.3 JSON |
| 測試 | Vitest 2.1.9、Supertest 7.2.2 | 6 份 API 整合測試、32 個案例 |
| 外部資源 | unpkg、Google Fonts、Unsplash | Vue、中文字型與商品／形象圖片；瀏覽器需可連線 |

better-sqlite3 鎖定版本宣告支援 Node `20.x || 22.x || 23.x || 24.x || 25.x`，bcrypt 要求 Node `>=18`。原生套件安裝可能需要下載預編譯檔，缺少相符檔案時會進入本機編譯；不能只看 Express 的最低 Node 版本選擇環境。

## 快速開始

### 1. 安裝與設定（PowerShell）

在已取得的專案根目錄執行。以下只在 `.env` 不存在時複製範本，避免蓋掉已有設定：

```powershell
node --version
npm --version
npm ci
if (!(Test-Path -LiteralPath .env)) {
  Copy-Item -LiteralPath .env.example -Destination .env
}
# 此值只供本機教學；透過程序環境覆蓋範本中的 JWT placeholder。
$env:JWT_SECRET = 'flower-life-local-development-secret-change-before-sharing'
$env:FRONTEND_URL = 'http://localhost:3001'
npm start
```

### 2. macOS／Linux shell 對應指令

```sh
node --version
npm --version
npm ci
if [ ! -f .env ]; then cp .env.example .env; fi
export JWT_SECRET='flower-life-local-development-secret-change-before-sharing'
export FRONTEND_URL='http://localhost:3001'
npm start
```

`.env.example` 的 `FRONTEND_URL` 是 `http://localhost:5173`，但本專案沒有 Vite 前端伺服器；EJS 與 API 預設同在 3001。`BASE_URL` 與 ECPay 變數目前沒有執行程式讀取。完整變數表見 [DEVELOPMENT.md](./DEVELOPMENT.md#環境變數)。

### 3. 開啟與檢查

```text
http://localhost:3001/                 商品首頁
http://localhost:3001/login            登入／註冊
http://localhost:3001/cart             購物車
http://localhost:3001/orders           個人訂單
http://localhost:3001/admin/products   商品管理
http://localhost:3001/admin/orders     訂單管理
```

另一個 PowerShell 終端可測公開 API：

```powershell
Invoke-RestMethod -Uri 'http://localhost:3001/api/products?page=1&limit=2'
```

啟動成功會印出 `Server running on port 3001`。第一次載入 `app.js` 會建立五張表、預設管理員及八筆花卉商品。預設管理員是 `admin@hexschool.com`／`12345678`；若首次初始化前設定 `ADMIN_EMAIL`／`ADMIN_PASSWORD`，則改用設定值。已有相同 email 時不修改密碼、不提升角色；變更 `.env` 不會重設既有帳號。

商品 seed 僅在商品表完全為空時執行，不會補回缺少的一筆，也不會恢復被消耗的庫存。重啟不是資料重置方式。

## 常用指令

| 指令 | 來源／用途 | 注意事項 |
| --- | --- | --- |
| `npm ci` | 根據 lockfile 安裝 | 會重建依賴目錄，不修改套件版本宣告 |
| `npm start` | `npm run css:build && node server.js` | CSS 建置失敗時不啟動 server |
| `npm run dev:server` | `node server.js` | 修改後端需手動重啟；不產生 CSS |
| `npm run dev:css` | Tailwind `--watch` | 另開終端持續執行 |
| `npm run css:build` | Tailwind `--minify` | 產物是忽略追蹤的 `public/css/output.css` |
| `npm run openapi` | `node generate-openapi.js` | 產生／覆寫 `openapi.json`；須在根目錄執行 |
| `npm test` | `vitest run` | 修改實體 DB，先閱讀測試隔離說明 |
| `npm test -- tests/products.test.js` | 單檔案例 | 仍載入 app、建表及 seed |

開發時以兩個終端分別執行 `npm run dev:css`、`npm run dev:server`。這裡沒有 `npm run dev`、lint、format、migration、coverage 或正式部署 script。`npm start` 沒有自行設定 `NODE_ENV=production`。

## 最短購買驗收流程

1. 開啟 `/login` 註冊一般會員，確認登入後導覽列顯示姓名。
2. 到首頁選擇有庫存商品加入購物車，再到 `/cart` 修改數量。
3. 前往 `/checkout`，填寫收件人姓名、Email、地址，提交後應跳到 `/orders/:id`。
4. 訂單初始為 `pending`，此时庫存已扣、會員購物車已清空。
5. 點付款成功或失敗，訂單分別變成 `paid` 或 `failed`，按鈕消失；失敗後不能重付且不補庫存。
6. 以管理員登入 `/admin/orders`，確認可查看該訂單、明細及買家資料。

若先以訪客加購再登入，原訪客購物車仍保存在 session owner 下，會員車可能為空；目前不會搬移或合併。這是現況，並非資料被結帳清除。

## 常見啟動問題

| 現象 | 原因與排查 |
| --- | --- |
| `Fatal: JWT_SECRET is not set` | 在啟動的同一終端設環境變數，或編輯根目錄 `.env`；檢查的是非空，不會辨識範本 placeholder |
| 頁面無樣式 | `dev:server` 沒有建 CSS；執行 `npm run css:build`，確認 `/css/output.css` 可取得 |
| 頁面有 HTML 但按鈕不動 | Vue 來自 unpkg，檢查 CDN 網路、瀏覽器 Console 與脚本載入顺序 |
| 後台跳登入 | localStorage 沒有 token 或 user.role 不是 admin；真正 API 權限另由 middleware 驗證 |
| 修改管理員環境變數沒效果 | seed 對已存在 email 不更新；不能用重啟當作改密碼 |
| npm `EPERM` | 檢查實際失敗路徑、權限與檔案占用；受限环境可試 `npm ci --cache .tmp-docs-npm-cache`，不要刪除資料庫作為修復 |
| 測試反覆執行後庫存不足 | 測試使用同一 DB 且不清理；在可丟棄副本驗證，詳見 TESTING |

## 文件索引

| 文件 | 應在何時閱讀 |
| --- | --- |
| [AGENTS.md](../AGENTS.md) | 開始修改前，確認指令、整合規則與文件入口 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 找檔案、追啟動流程、認證與 SQL schema |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 新增路由、middleware、欄位、頁面與計畫歸檔 |
| [FEATURES.md](./FEATURES.md) | 對接 API、了解輸入預設值、狀態機及已知差異 |
| [TESTING.md](./TESTING.md) | 跑測試、建立 fixture、判斷覆蓋缺口及手動驗收 |
| [CHANGELOG.md](./CHANGELOG.md) | 查證已知版本、文件異動及驗證紀錄 |
| [plans/](./plans/) | 進行中的功能規格與任務 |
| [plans/archive/](./plans/archive/) | 已完成計畫、實作決策及驗證證據 |
