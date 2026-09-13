# 功能清單、行為與完成狀態

## 判讀方式

本文件依目前 router、middleware、瀏覽器腳本、EJS 與測試記錄實際行為。「已實作」不等於沒有缺陷或完整測試；「部分」表示核心程式存在但整合有明確缺口；「未實作」表示只有預留變數／畫面文案，或沒有程式。所有 API 路徑相對於預設 `http://localhost:3001`，請求 body 使用 JSON。詳細 schema 與驗證機制見 [ARCHITECTURE.md](./ARCHITECTURE.md)。

| 功能 | 狀態 | 可驗證範圍／限制 |
| --- | --- | --- |
| 公開商品列表、分頁、詳情 | 已實作 | 4 個 API 測試；無搜尋、分類、上下架欄位 |
| 註冊、登入、profile | 已實作 | 6 個 API 測試；無改密碼、refresh、登出撤銷 API |
| 訪客／會員購物車 | 已實作 | 6 個 API 測試；JWT 優先、owner 分離 |
| 登入後合併訪客車 | 未實作 | session 車保留，會員查詢不會讀它 |
| 收件資料與交易建單 | 已實作 | 基本建單／空車驗證；交易失敗及併發缺乏測試 |
| 個人訂單列表／詳情 | 已實作 | 限本人；列表沒有分頁 |
| ECPay 測試付款方式 | 部分 | AIO 顯示測試商店可用方式（含信用卡與網路 ATM）、查詢驗簽與持久排程；尚未完成實際付款端到端驗收 |
| 後台商品 CRUD | 已實作 | 6 個 API 測試；刪除可能受購物車外鍵阻擋 |
| 後台訂單篩選／詳情 | 已實作 | 4 個 API 測試；沒有修改訂單端點 |
| 運費 | 未實作 | 購物車、結帳與訂單均只顯示和保存商品小計；首頁仍保留未接線的免運宣傳文案 |
| Toast、空狀態、loading | 已實作 | 無瀏覽器自動測試；部分 API 失敗會偽裝成空列表 |
| 購物車 badge | 部分 | 初載按項目筆數，加購卻每次加一；刪除／改量不即時同步 |
| 訂閱、評論、物流、退款 | 未實作 | 靜態文案／商品說明不等於业务功能 |
| OpenAPI 產生 | 已實作 | JSON 產生器；無 Swagger UI，部分註解與實作不同 |

## 共通查詢、格式與錯誤

商品前台／後台列表、後台訂單列表共用以下分頁演算法；個人訂單和購物車沒有分頁。

| 參數 | 預設 | 實際轉換與範圍 |
| --- | --- | --- |
| page | 1 | `Math.max(1, parseInt(value) || 1)`；負數到 1、0／NaN 回 1 |
| limit | 10 | `Math.max(1, Math.min(100, parseInt(value) || 10))`；最大 100、負數到 1、0 回 10 |
| offset | 計算值 | `(page-1)*limit`，不是可傳入的獨立參數 |

parseInt 會接受如 `'2abc'` 得 2、`'1.9'` 得 1，不是嚴格型別驗證。page 超過末頁不截回最後頁，回空陣列與原 page。totalPages 是 `Math.ceil(total/limit)`，無資料時為 0。排序只有 `created_at DESC`，同秒資料沒有次要排序鍵；不保證穩定順序。首頁自行指定 limit=9，後台 UI 指定 10。

成功 envelope 是 `{ data, error:null, message }`；業務失敗多為 `{ data:null, error:<機器碼>, message:<中文> }`。機器碼表如下，實際發生位置在各節詳列：

| HTTP／error | 情境 |
| --- | --- |
| 400 VALIDATION_ERROR | 必填、email、數量、價格、庫存或付款 action 不符 |
| 400 STOCK_INSUFFICIENT | 加購累計量、修改量或建單所需量超過庫存 |
| 400 CART_EMPTY | 本會員購物車無可 JOIN 的商品項目 |
| 400 INVALID_STATUS | 非 pending 訂單再次付款 |
| 401 UNAUTHORIZED | 缺有效 JWT／session、JWT 驗證失敗、帳號已不存在、登入錯密碼 |
| 403 FORBIDDEN | 通過 JWT 但不是 admin |
| 404 NOT_FOUND | 商品、自己名下購物車項目或訂單不存在；未知 API |
| 409 CONFLICT | email 重複；欲刪商品存在 pending 訂單 |
| 500 INTERNAL_ERROR | 未處理 SQL／型別等錯誤；集中 handler 不暴露細節 |

集中 errorHandler 即使回非 500 status 仍使用 INTERNAL_ERROR，因此格式錯誤 JSON 通常是 400／INTERNAL_ERROR。沒有全面 schema validator；下述「必填」多採 truthy 判斷，不代表所有非字串或純空白輸入皆回 400。

## 帳號與認證

### 註冊：POST /api/auth/register

公開端點。先檢查必填、email 格式、password.length，再查 email 重複；符合時以 UUID、bcrypt cost=10 建立 user 角色帳號，接著簽 7 天 JWT。沒有 email 驗證信、角色選擇、註冊後合併購物車或 email 小寫化。

| body 欄位 | 必要性 | 行為 |
| --- | --- | --- |
| email | 必填 | truthy 且符合 `^[^\s@]+@[^\s@]+\.[^\s@]+$`，不 trim／轉小寫 |
| password | 必填 | `.length >= 6`，正式寫入 bcrypt hash；沒有最大長度規則 |
| name | 必填 | truthy，後端沒有 trim 空白驗證 |
| role 或其他額外鍵 | 不使用 | 即使傳 admin，建立時仍寫 user |

成功 201，data 為 `{ user:{id,email,name,role}, token }`；不含 password_hash、created_at。缺欄、email 不符、短密碼回 400 VALIDATION_ERROR；重複 email 回 409 CONFLICT。SQL 寫入先於 JWT 簽發，沒有包成交易，因此 secret 缺失等簽發錯誤可能已留下帳號；修復後直接登入或換測試 email。

### 登入：POST /api/auth/login

必填 email、password，無預設值。以原字串查使用者並 bcrypt.compareSync；不存在和錯密碼都回相同 401 UNAUTHORIZED，避免從訊息區分帳號是否存在。成功 200，data 形狀同註冊。缺欄回 400 VALIDATION_ERROR；沒有登入限速或鎖帳實作。

### 個人資料：GET /api/auth/profile

需要 Bearer JWT，無 query 或 body。通過 middleware 後以 req.user.userId 查 `{id,email,name,role,created_at}`。route 有 404 NOT_FOUND 分支，但一般不存在帳號會先被 authMiddleware 以 401 擋下。profile 角色来自 DB，middleware 授權角色来自 token；兩者在角色修改後可能不同。

### 瀏覽器登入與登出

`/login` 提供登入／註冊 tabs、欄位提示及 submitting 防重送。成功後 Auth.login 存 token 與 user，讀 `redirect` query 導頁，缺少則回 `/`。redirect 未限制同源路径。Auth.logout 只清 token／user 再跳首頁，session ID 保留，也不撤銷既有 JWT。

apiFetch 的 401 一律清身分、導 `/login`、回 undefined，這也包含登入密碼錯誤。requireAuth 保留 pathname 到 `/login?redirect=...`，但全域 401 導頁不保留原路徑；requireAdmin 也不保留 redirect。JWT 確切參數、角色更新限制與 session 流程見架構文件。

## 商品瀏覽

### GET /api/products 與 GET /api/products/:id

兩端點皆公開。列表接受共通 page／limit，查全部 products，沒有庫存大於零篩選；回 data `{products:[完整商品列],pagination}`。詳情使用資料庫 id（非商品名稱）查單筆，回 data 完整商品列，不存在回 404 NOT_FOUND。

商品列包含 id、name、description、price、stock、image_url、created_at、updated_at；description／image_url 可為 null。沒有 keyword、category、sort 等參數；傳入未使用 query 不會套用額外篩選。

首頁一頁 9 筆，推薦區直接取當頁 products 的前四筆，不是獨立推薦 API；翻頁會改推薦內容。加購按鈕一次加 1，stock<=0 時禁用。商品詳情 quantity 初始 1、減少最低 1、增加不超當下已載入 stock，送出仍由後端重新檢查。詳情抓取任何錯誤都設定 notFound，不只真正 API 404。

圖片沒有 image_url 時使用 Unsplash fallback，但圖片 URL 存在卻載入失敗時沒有 onerror 替換機制。品牌故事、顧客評語、當日配送是模板常數，不由資料庫提供。

## 雙模式購物車

每個購物車端點都先 dualAuth。有效 JWT 優先於 X-Session-Id；Bearer 無效不降級，沒有 Bearer 才使用非空 session。相同 session 值讀同一車；沒有伺服器發行或過期機制。會員車依 user_id 查、訪客車依 session_id 查，登入後不相加。

### GET /api/cart

無 query/body。JOIN 商品的即時資料，回 data `{ items, total }`。items 的每筆為 `{id,product_id,quantity,product:{name,price,stock,image_url}}`；total 為目前單價乘數量之和，空車為 items=[]／total=0。不包含運費，也不會因 stock 變低而自動刪除或降低已存數量。

### POST /api/cart

| body 欄位 | 必要性／預設 | 行為 |
| --- | --- | --- |
| productId | 必填 | 商品 UUID；缺值 400，查無商品 404 |
| quantity | 選填，預設 1 | 先 parseInt，再要求整數且 >=1；null 不套預設，轉 NaN 後拒絕 |

同 owner 已有商品時，新量是 existing.quantity + qty，回同一 item id；未有則插入 UUID 新項目。比較的是累加後數量，不是本次加購量。超過 product.stock 回 400 STOCK_INSUFFICIENT，沒有更改資料；合法回 200 `{id,product_id,quantity}`，不扣庫存。

`quantity:1.9` 或字串 `'2abc'` 會被截成整數，現況與「必須正整數」訊息、OpenAPI schema 不完全一致。OpenAPI required 列 quantity，但 route 有預設值，對接以實作為準並列入日後同步修正。

### PATCH /api/cart/:itemId

必填 quantity，沒有預設；解析規則同 POST。以 id 加 owner 查項目，其他人的項目與不存在都回 404 NOT_FOUND。quantity 是新的絕對值，例如原 3 傳 2 變 2，不是加 2。低於 1 回 VALIDATION_ERROR，不能用 0 刪除；高於目前商品庫存回 STOCK_INSUFFICIENT。成功 200，data 形狀同加購。

### DELETE /api/cart/:itemId

不需要 body。先驗 owner 和 id，不存在／不屬本人皆 404，存在才刪除，200 `{data:null,error:null,message:'已從購物車移除'}`。沒有刪除整車 API。刪除不影響庫存，因加購沒有預留庫存。

### 金額與 badge 差異

購物車、結帳與訂單頁均顯示商品小計；後端 `cart.total`／`orders.total_amount` 與送往綠界的金額相同。運費、折扣與稅額尚未實作；首頁的「滿額免運」僅為未接線的靜態宣傳文案。

header 初始 badge 是 items.length；首頁與詳情每成功加購直接加一，因此重複加同商品也會增加 badge。購物車內改量或刪除不更新 header badge，重載後才重新取項目筆數。不要將它當準確件數或金額依據。

## 結帳與訂單

### POST /api/orders

必須登入，訪客 session 無法建單。body 只接受收件資料作為業務輸入：

| 欄位 | 必要性 | 檢查與儲存 |
| --- | --- | --- |
| recipientName | 必填 | truthy，存 recipient_name |
| recipientEmail | 必填 | truthy 且同註冊 email regex，存 recipient_email |
| recipientAddress | 必填 | truthy，存 recipient_address |
| items、total、userId、status 等 | 不使用 | 商品、價格、使用者、狀態由伺服器決定 |

前端 additionally 對姓名／地址 trim 驗空白；後端沒有相同 trim，因此不能把 UI 限制作 API 保證。驗收件資料後讀取 user_id 購物車 JOIN 商品，無項目 400 CART_EMPTY，任一 quantity>stock 回 400 STOCK_INSUFFICIENT 並列商品名稱。金額以當下商品價格重算，不相信請求 total，也不含稅、折扣或運費。

通過檢查後產生訂單 id、`ORD-<UTC YYYYMMDD>-<UUID 前五碼大寫>`。一個 db.transaction 內寫訂單、明細快照、逐項扣庫存、清空此會員全部購物車。讀車、檢庫存與計總額在 transaction 外，沒有併發 retry；SQL 失敗會回滾寫入，未處理錯誤回 500。

成功 201，data 僅包含 `id,order_no,total_amount,status,items,created_at`；此處 items 只有 `product_name,product_price,quantity`，與詳情 items 的完整欄位不同。初始 status=pending，扣庫存已發生，不等待付款。商品 updated_at 在扣庫存時不更新。

前端 `/checkout` 掛載先 requireAuth，再讀車；空車或讀取失敗會跳 `/cart`。提交有 submitting guard，成功跳 `/orders/<id>`。該 guard 只防同頁按鈕重送，不是 API 層冪等保證。

### GET /api/orders

JWT 必要。查本人所有訂單，依 created_at DESC，回 `{orders:[{id,order_no,total_amount,status,created_at}]}`。沒有 pagination、狀態 filter、收件人或 items；傳 page／limit／status 不會限制。無資料回空陣列 200。

### GET /api/orders/:id

JWT 必要。用訂單 id 和 req.user.userId 同時查詢；查無或他人訂單皆 404 NOT_FOUND，admin 使用這支一般端點也只看到自己的訂單。成功回完整 orders 列加 items，items 是完整 order_items 列，含 id、order_id、product_id、product_name、product_price、quantity。歷史顯示不 JOIN 現行商品，因此調價／改名不改快照。

## 模擬付款

### PATCH /api/orders/:id/pay

需要本人 JWT。必填 body `action`，預期只有字串 `success` 或 `fail`；對應 paid／failed。順序是先驗 action，再查本人訂單，最後驗 status=pending。缺 action 或一般不合法字串回 400 VALIDATION_ERROR；不存在／他人訂單 404；非 pending 400 INVALID_STATUS。

```text
建立訂單 → pending ── action=success → paid
                   └─ action=fail    → failed
```

成功 200，data 為完整訂單加完整 items。fail 是成功處理「付款失敗」模擬，所以 HTTP 200、error=null、message='付款失敗'；不能只靠 HTTP 200 判斷是否已收款。狀態以回應的 data.status 為準。

paid／failed 都不能再付款，沒有補庫存、重試、取消、退費、金流回呼。前端失敗文案「請重試」與無重付機制不一致。UI paymentMessages 用 `failed`，API action 卻用 `fail`；`?payment=cancel` 只顯示取消提示，不新增取消狀態。

actionMap 是一般 JavaScript 物件，以 `actionMap[action]` truthy 判斷，沒有自有鍵檢查；如原型屬性名稱並非可靠地一律回 VALIDATION_ERROR，可能走到非預期值／SQL 錯誤。未來強化驗證應加明確枚舉測試，不能僅照抄現有判斷。

## 後台商品管理

全部端點由 router.use(authMiddleware, adminMiddleware) 保護，JWT 缺失／無效 401，普通會員 403。HTML 後台本身公開且有前端 guard，實際資料與寫入仍由 API 驗證。後台 UI 有新增編輯表單、刪除確認與分頁，但多數失敗只顯示「儲存失敗／刪除失敗」，不顯示具體 backend message。

### GET /api/admin/products

共通 page／limit，預設 1／10，最大 100，回完整商品陣列與 pagination，排序、資料範圍同公開列表。沒有獨立 GET `/api/admin/products/:id`；編輯 modal 用已載入列表那一列填表。

### POST /api/admin/products

| 欄位 | 必要性 | 實際驗證／預設 |
| --- | --- | --- |
| name | 必填 | truthy，沒有 trim 或完整型別驗證 |
| price | 必填 | Number.isInteger 且 >0，字串 `'500'` 不接受 |
| stock | 必填 | Number.isInteger 且 >=0，0 合法 |
| description | 選填 | falsy 寫 null |
| image_url | 選填 | falsy 寫 null；無 URL 格式驗證 |

成功 201 回完整商品列，DB 提供 created_at／updated_at。驗證錯誤回 400 VALIDATION_ERROR。雖 DB stock 預設 0，API 仍要求明確傳 stock，不會套 schema 預設。

### PUT /api/admin/products/:id

先查商品，查無 404。name、description、price、stock、image_url 全部選填，未提供（undefined）保留原值；因此這是部分更新語意而非整體替換。name 有傳時 `name.trim()===''` 拒絕，price 有傳須正整數、stock 有傳須非負整數。name=null／非字串可能因 trim 拋錯到 500，而不是完整 400 驗證。

description 和 image_url 可以明確傳 null 或空字串以清除；這與 POST 的 falsy→null 不同。空 body 也會 UPDATE 並更新 updated_at。成功 200 回完整商品列；既有訂單快照不變，購物車 JOIN 資料會反映新名稱／價格／庫存。

### DELETE /api/admin/products/:id

查无商品 404；任一 order_items 指向此商品且 orders.status=pending 時回 409 CONFLICT。沒有 pending 才執行 DELETE。paid／failed 明細沒有商品 FK，歷史紀錄可留存；cart_items 卻有 FK，所以即使沒有 pending 訂單，只要有任何會員或訪客車引用仍可能 500 INTERNAL_ERROR。沒有自動清理購物車或軟刪除機制。

成功為 200、data=null，不是 204。不要在取得 409 後改寫訂單狀態以「繞過」刪除條件；未來的刪除策略需設計訂單快照、車項目與稽核行為。

## 後台訂單管理

### GET /api/admin/orders

Admin 必要。page／limit 規則同商品；選填 status 只接受 pending、paid、failed，未提供或無效值直接忽略篩選，不回 400。count 與列表用同條件，依 created_at DESC；data 是 `{orders:[完整 orders 列],pagination}`，包含 user_id 及收件地址等欄位，沒有 items 或 user 子物件。

後台下拉變動以 watch 重新載第 1 頁，詳情由另一請求載入。沒有 keyword、日期區間或 userId filter。列表「買家」欄實際顯示 recipient_name，可能與帳號姓名不同。

### GET /api/admin/orders/:id

查全站單筆，不限自己的 user_id；不存在 404。data 是完整 orders 列、完整 items，以及 `user:{name,email}`；查無買家時 user=null。沒有回傳 password_hash，也沒有編輯收件資訊、刪單、管理員改狀態 API。

## 文件產生與待同步契約

`npm run openapi` 掃描 routes 的 @openapi，產生 OpenAPI 3.0.3。bearerAuth 與 sessionId schemes 記錄在 swagger-config.js；購物車 security 為兩個分開物件，代表二擇一。產物不是 runtime validator，也不是瀏覽器 Swagger UI。

目前應優先對照的差異：購物車 quantity 在註解列 required 但程式預設 1；數量 schema 宣告 integer 但 parseInt 接受部分字串／小數；後台訂單列表 schema 未列出 SELECT * 實際包含的全部欄位；PUT 名稱為編輯但行為是部分更新。修改功能時同步維護註解、測試與本文件，不能以生成 JSON 反向推定程式已有該限制。
