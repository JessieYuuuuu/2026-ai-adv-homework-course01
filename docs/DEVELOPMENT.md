# 開發規範與擴充指南

## 規範適用範圍

本文件將「原始碼現況」與「新增程式應遵循的規範」分開說明。現況沒有 ESLint、Prettier、TypeScript、migration 或 CI 設定，不能將文件建議當成已由工具強制執行。開始修改前先讀 [AGENTS.md](../AGENTS.md)、對應功能路由及頁面、[ARCHITECTURE.md](./ARCHITECTURE.md) 的資料不變條件；API 可觀察行為以 [FEATURES.md](./FEATURES.md) 為基準。

新功能應先明確列出會影響哪些模組：例如運費影響 cart／checkout 畫面、orders.total_amount、付款金額、訂單明細及測試；訪客車合併影響 auth、cart owner、資料約束及登入導頁。不能只在單一畫面或 route 補欄位就宣告整合完成。

## 命名規則對照

| 類別 | 現況／規範 | 範例與注意 |
| --- | --- | --- |
| 後端路由檔 | camelCase + Routes.js | `adminProductRoutes.js`；從 app.js 明確掛前綴 |
| middleware 檔 | camelCase + Middleware.js | `authMiddleware.js`；錯誤 handler 既有例外 `errorHandler.js` |
| 函式、變數 | camelCase | `getOwnerCondition`、`totalAmount`、`recipientName` |
| 共用瀏覽器物件 | 既有 PascalCase | `Auth`、`Notification`，不要誤改為 npm import |
| 常數 | UPPER_SNAKE_CASE | `SAFE_MESSAGES`、`TOKEN_KEY`、`PORT` |
| DB 表名 | snake_case 複數 | `cart_items`、`order_items` |
| DB 欄位 | snake_case | `user_id`、`total_amount`、`created_at` |
| API body | 保留既有混合契約 | cart `productId`、order `recipientName`，管理商品則是 `image_url` |
| API 回傳 | 通常沿用 DB snake_case | `product_id`、`order_no`；分頁 `totalPages` 為 camelCase |
| URL | 小寫複數資源 | `/api/products/:id`、`/api/cart/:itemId`；付款為 `/:id/payment`、`/:id/payment/verify`、`/:id/payment/returned` |
| 頁面腳本 | kebab-case.js | `product-detail.js`、`admin-orders.js` |
| EJS 模板 | kebab-case.ejs | `order-detail.ejs`；後台另放 pages/admin |
| DOM id／data 屬性 | kebab-case | `cart-badge`、`data-order-id`，JS 用 dataset.orderId |
| 測試檔 | 模組名.test.js | `adminProducts.test.js`；helper 在 setup.js |
| CSS token | kebab-case、語意命名 | `--color-rose-primary` → `text-rose-primary` |
| 錯誤碼 | UPPER_SNAKE_CASE | `CART_EMPTY`、`STOCK_INSUFFICIENT` |
| 計畫檔 | 日期 + kebab-case | `2026-09-11-shipping-total.md` |

現有程式大多兩空白縮排、單引號、分號，字串插值或多行 SQL 用 template literal。新程式採 const 優先，確需重新賦值才 let；瀏覽器既有 var 可保留，不必為文件或單一功能全面格式重寫。中文檔案用 UTF-8，PowerShell 讀檔時明確加 `-Encoding UTF8`，避免將終端亂碼誤判為檔案損壞。

## 模組系統與載入顺序

package.json 沒有 `type:module`。app、server、src、工具腳本與 tests 使用 `require`／`module.exports`；不要直接在其中加入 ESM import/export，或為單檔修改整個 package type。vitest.config.js 是唯一現有 ESM 語法設定，經 Vitest/Vite 載入，不能據此認為後端全面 ESM。

瀏覽器檔案是普通 `<script>`，不是 `type=module`。layout 先载 Vue global，再 auth.js、api.js、notification.js，前台再 header-init.js，最後单一 pageScript。頁面頂層會解構 Vue 的 createApp/ref 等名稱，故每頁只應載入自己的腳本，不能一次載入多個 pages/*.js，否則可能重複宣告 const 且多次 mount。

database.js 首次 require 就初始化並 seed，CommonJS cache 在同程序共享 connection。請勿在測試中假設重新 require 一次就得到乾淨 DB，也勿在其他測試仍使用時關閉這個 connection。Express 4 的同步拋錯可進 errorHandler；新增 async handler 時要自行 try/catch 並 `next(err)`，不要依賴 Express 5 的 Promise 行為。

## 環境變數

dotenv 在 app.js 開頭載入；已存在程序環境值預設不被 `.env` 覆蓋。以下區分 runtime 真正使用的值與範本預留值。

| 變數 | 用途／讀取處 | 必要性 | 程式預設／範本差異 |
| --- | --- | --- | --- |
| JWT_SECRET | authRoutes 簽發；authMiddleware／cart dualAuth 驗簽；server 啟動檢查 | 認證、註冊與正常啟動必要 | 無程式預設；範本 `your-jwt-secret-key-here` 只是 placeholder |
| PORT | server.js listen | 選填 | `3001`；範本未列 |
| FRONTEND_URL | app.js cors origin | 選填 | 程式預設 `http://localhost:3001`；範本為 `http://localhost:5173` |
| ADMIN_EMAIL | database.js seed 查找／新增管理員 | 選填 | `admin@hexschool.com` |
| ADMIN_PASSWORD | database.js 新管理員 hash | 選填 | `12345678`；不修改已存在帳號 |
| NODE_ENV | database.js seed bcrypt cost；框架／測試環境 | 選填 | 專案不設定預設；恰為 test 時 seed cost=1，其他為10；註冊仍固定10 |
| BASE_URL | 範本預留 | 現況不需要 | 範本 localhost:3001，原始碼無讀取 |
| ECPAY_MERCHANT_ID | 範本預留商店識別 | 現況不需要 | 範本 3002607，無 runtime 接線 |
| ECPAY_HASH_KEY | 範本金流參數 | 現況不需要 | 範本有測試值，無 runtime 接線；勿把正式密鑰寫進文件 |
| ECPAY_HASH_IV | 範本金流參數 | 現況不需要 | 範本有測試值，無 runtime 接線 |
| ECPAY_ENV | 範本預留環境 | 現況不需要 | 範本 staging，無 runtime 接線 |

沒有 DATABASE_URL／DB_PATH；設定這些變數不会切換資料庫。所有執行環境都由 src/database.js 定位同一根目錄 database.sqlite。測試 helper 使用固定管理員帳密，與自訂 ADMIN_* 可能不相容。變更 JWT_SECRET 会使以舊 secret 簽出的 JWT 驗證失敗，但登出只刪本機資料。

新增變數時：先定義實際讀取位置、是否必填與缺值失敗方式；更新 `.env.example`、本表和快速開始；測試用臨時值覆蓋；不得提交本機 `.env`。第三方設定必須有對應程式與驗證，不能只新增變數就標記整合完成。

## 新增或修改 API 的步驟

1. 在 docs/plans 建立計畫，列 User Story、可觀察 Spec、Tasks。先定 owner、角色、body 欄位、錯誤碼、回應形狀和是否改 DB。
2. 在既有適當 router 新增路徑，或建立 `src/routes/<resource>Routes.js`，以 express.Router、module.exports 匯出；新 router 需在 app.js 的 pageRoutes／404 之前掛載。
3. 判斷認證模式：公開商品不強加 JWT；會員資源用 authMiddleware；後台先 auth 再 admin；雙模式目前私有在 cartRoutes，不要誤以為已可直接 import。
4. 執行 body／path／query 驗證，對新欄位明确檢查型別再使用 trim、數學或 bcrypt。數值是否接受數字字串需寫進 Spec；不要無意複製 parseInt 的截斷行為。
5. SQL 值一律 placeholder。owner 欄位如需插值，只能從固定白名單選擇，不能把 query 欄位名直接插入 SQL。一般會員查訂單／cart 時同時限制 id 和 owner。
6. 若多表狀態要一起成功，以 db.transaction 處理，明確區分交易外讀取與交易內寫入。不要在同步 transaction callback 內 await 網路；金流呼叫與本機交易需另外設計狀態流程。
7. 成功／錯誤回 `{data,error,message}`，遵循既有 201／200／400／401／403／404／409。可預期業務錯誤直接回適當機器碼；未預期錯誤交集中 handler，不洩 SQL／堆疊。
8. 補 @openapi 註解，再更新對應 public/js/pages 與 EJS。確認新增資料欄位和大小寫一致，並處理 apiFetch 401 回 undefined 的契約。
9. 補有意義的整合測試，至少成功、輸入失敗、跨 owner 拒絕與重要 DB 副作用；詳見 TESTING。需要時手動驗收 UI，不能只以 API 綠燈代替畫面驗證。
10. 執行測試、CSS／OpenAPI 相關檢查，更新 FEATURES／CHANGELOG，完成後歸檔計畫。

新 API 最小風格範例（說明寫法，並非現有端點）：

```js
const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const router = express.Router();

router.get('/example', authMiddleware, (req, res) => {
  res.json({
    data: { userId: req.user.userId },
    error: null,
    message: '成功'
  });
});

module.exports = router;
```

## 新增 middleware 的步驟

1. 確認它應是全域、router 層或單端點；若需要 req.body，必須排在 body parser 後；若需要 req.sessionId，排 sessionMiddleware 後；若需要 req.user，排 auth 後。
2. 定義新增的 request 欄位、可重入性、失敗 HTTP／機器碼。成功恰呼叫一次 next，失敗 `return res.status(...).json(...)`，避免回應後繼續執行。
3. 一般 middleware 使用 `(req,res,next)`；錯誤 middleware 保留四參數 `(err,req,res,_next)`，且掛載末端。不要因 unused parameter 刪掉第四參數。
4. 測試缺值、無效值、合法值、與前後 middleware 的順序。認證異動要涵蓋刪除帳號、過期 token、role 與雙模式 fallback 規則。
5. 在 ARCHITECTURE 更新生命週期及授權敘述，在 FEATURES 更新可見錯誤；JWT payload 或 owner 模式改動也需同步 Auth／apiFetch。

## 新增資料表或欄位的步驟

1. 先列 schema：欄位型別、顯式 NOT NULL、PK／UNIQUE、CHECK、FK、預設、索引、刪除行為與用途。金額、數量、狀態欄位需交代不變條件。
2. 修改 database.js 的初始化 SQL，使全新資料庫建立正確；既有 `CREATE TABLE IF NOT EXISTS` 不會替已有表補欄位，另提供可重複執行的版本升級策略與資料回填計畫。
3. 處理現有資料與外鍵。例如改 products 刪除行為必須考慮 cart_items FK 與 order_items 無商品 FK；不要直接關 foreign_keys 來掩蓋不一致。
4. 檢查所有 SELECT * 回應是否無意暴露新欄位；新增敏感欄位應明確 projection。檢查前台 body 命名與 schema 映射，不要全面改名破壞客戶端。
5. 在乾淨 DB 與含舊資料 DB 分別驗證，確認 upgrade／seed 重跑不会重複或覆蓋使用者資料；用交易處理多步寫入。
6. 更新 ARCHITECTURE 每欄表格、相關功能、測試 fixtures 與計畫的升級／回復說明。

目前沒有 `npm run migrate`，文件不可提供虛構指令。資料庫重設只適用可丟棄副本，正式或個人資料應先保留；WAL 模式備份不能隨意在寫入中只複製主檔並忽略尚未 checkpoint 的變更。

## 新增前台或後台頁面

在 views/pages（或 admin 子目錄）新增模板，根容器使用 id=app；在 pageRoutes 選 renderFront／renderAdmin 並傳 title、pageScript，後台另傳 currentPath；新增對應 public/js/pages kebab-case.js，在 Vue setup 中提供模板需要的狀態／函式。路由 id 透過 EJS escaped data-* 傳入，不要直接拼進 JavaScript 字串。

沿用 Auth、apiFetch、Notification，新增頁面不再複製 token 存取。公開頁與會員頁的 guard 分清；後台仍需 API adminMiddleware。列表要處理 loading、empty、error；目前部分頁將錯誤轉空陣列，是既有局限，不應無意複製到新功能。

樣式 token 放 public/css/input.css 的 @theme，避免修改 output.css；每次更動模板 class 後執行 css:build。Tailwind 需要可掃描的完整 class 字串，動態組合新 class 時檢查產物。legacy public/stylesheets/style.css 未被 head 載入，修改它不會改現有畫面。

使用 Vue 插值或 textContent 顯示使用者字串；header-init 現況以 innerHTML 拼姓名，沒有跳脫，這是已知風險而非建議模式。新增登入 redirect 应先限制站內路徑；目前 login.js 未驗證 redirect。這兩點如修復需另列功能／安全變更，而非在文件工作中默默改業務程式。

## JSDoc 與 OpenAPI 註解

現有路由已有大量 `/** @openapi ... */` YAML；tests/setup.js 的 helper 則只有簡短描述，沒有完整 @param／@returns。以下是新函式應採用的格式，而非宣稱所有既有函式已遵守。

普通 JSDoc：第一段用一句話說目的，第二段說 owner、交易或副作用等必要契約；接 @param 型別／名稱／用途，@returns 型別／內容；實際會拋錯才列 @throws，不要替只回 HTTP 的函式虛構 exception。

```js
/**
 * 取得已完成認證之請求的購物車 owner 條件。
 * 欄位名只允許固定白名單；value 必須以 SQL placeholder 綁定。
 *
 * @param {Object} req - 已經過 dualAuth 的 Express request。
 * @param {{userId: string}} [req.user] - JWT 認證成功的會員。
 * @param {string} [req.sessionId] - 未使用會員模式時的訪客識別。
 * @returns {{field: 'user_id'|'session_id', value: string}} owner 條件。
 */
function getOwnerCondition(req) {
  if (req.user) return { field: 'user_id', value: req.user.userId };
  return { field: 'session_id', value: req.sessionId };
}
```

OpenAPI 註解每個操作至少包含完整 `/api/...` 路徑、method、summary、tags、security（若有）、query/path parameters、requestBody required 與 schema、各 status response。YAML 縮排只用空格，寫在 route 附近；範例：

```js
/**
 * @openapi
 * /api/cart:
 *   post:
 *     summary: 加入商品到購物車
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *       - sessionId: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productId]
 *             properties:
 *               productId:
 *                 type: string
 *               quantity:
 *                 type: integer
 *                 default: 1
 *                 minimum: 1
 *     responses:
 *       200:
 *         description: 已加入購物車
 *       400:
 *         description: 數量不合法或庫存不足
 *       401:
 *         description: 缺少有效的 JWT 或訪客識別
 *       404:
 *         description: 商品不存在
 */
```

此範例示範修正 quantity 必填宣告，並未修改現有路由註解；完整實作時還要加三欄回應 schema。兩個 security 陣列項目表示「或」，同一物件放兩個 scheme 則不是相同意思。生成成功只證明可產 JSON，不保證註解吻合 runtime。

## 計畫歸檔流程

1. 計畫檔案命名格式：`YYYY-MM-DD-<feature-name>.md`。
2. 計畫文件結構：`User Story → Spec → Tasks`。
3. 功能完成後：移至 `docs/plans/archive/`。
4. 更新 `docs/FEATURES.md` 和 `docs/CHANGELOG.md`。

建立計畫前先盤點同功能既有計畫，避免重複。日期採建立計畫的實際日期，feature-name 用可讀英文 kebab-case。Spec 必須說請求／回應、授權、DB、前端、錯誤和驗收；不涉及部分寫不適用原因。Tasks 分成可驗證項目，而非單一句「完成開發」。

```markdown
# 運費總額一致化

## User Story
作為購買者，我希望結帳顯示與訂單保存的總額一致，以確認應付金額。

## Spec
- 記錄目前前端未滿500加150、後端只有小計的差異。
- 明確定義費率來源、訂單欄位、歷史訂單策略及總額公式。
- 定義499、500邊界與商品調價後建單的驗收結果。
- 列出需要更新的API回應、畫面、OpenAPI及測試。

## Tasks
- [ ] 決定費率與資料升級規格。
- [ ] 實作並驗證訂單金額與前端摘要一致。
- [ ] 加入499／500邊界與既有訂單回歸驗證。
- [ ] 記錄測試命令、結果及未解限制。
- [ ] 更新FEATURES、CHANGELOG並歸檔。
```

這是寫作範例，未建立運費功能計畫，也不代表運費變更已獲安排。完成條件是 Spec 已滿足、必要檢查有結果、未解事項明確交代；不能為了清空 plans 就把未完成 Tasks 勾完。

歸檔保留原檔名與設計決策，補上實作結果、測試與完成日期；需要時加入 commit 識別，不能捏造 commit。PowerShell 操作範例，僅針對存在且已完成的單一檔案：

```powershell
Move-Item -LiteralPath 'docs/plans/2026-09-11-shipping-total.md' `
  -Destination 'docs/plans/archive/2026-09-11-shipping-total.md'
```

更新 FEATURES 將實際完成部分改狀態并記行为；CHANGELOG 加日期、影響與驗證，連結已歸檔計畫。如重開舊功能，建立新計畫引用舊案，不覆寫歷史結果。兩目錄中的 .gitkeep 僅維持 Git 追蹤，不需移動或當成計畫。

## 交付前檢查

確認只改任務必要檔案，保留使用者本機設定；執行相關 API 測試，前端變更檢查 CSS 與頁面行為；對 schema／認證／金額異動補副作用與跨使用者案例；生成並核對 OpenAPI；確認文件沒有未存在的 commands／API／表欄位；檢視 git diff 與未追蹤產物。詳細測試限制與命令在 [TESTING.md](./TESTING.md)。
