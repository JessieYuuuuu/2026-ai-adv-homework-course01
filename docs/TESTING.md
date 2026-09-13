# 測試規範與指南

## 測試層次與基準

目前測試為 Vitest 2.1.9 + Supertest 7.2.2 的 API 整合測試。tests/setup.js 直接 require app，請求走真正 Express middleware、JWT、bcrypt、SQLite 與 seed，沒有 mock database 或第三方服務。Supertest 使用 app 建立測試所需 HTTP server，不需要先 `npm start` 或占用固定 3001。

現有 8 份 `.test.js` 共 40 個 `it`：其中 6 份為 API 整合測試，另有 2 份 ECPay 簽章／表單與付款排程測試。沒有 browser E2E、DOM 測試、視覺快照、真實測試卡付款、覆蓋率 provider、coverage script 或 CI pipeline。測試通過只能證明已斷言的基本 API 行為，不能推定跨 owner、交易 rollback 或所有輸入邊界已驗證。

## 實測紀錄

2026-09-13 在專案根目錄執行 `npm test`、`npm run css:build` 與 `npm run openapi`：

| 檢查 | 結果 | 解讀 |
| --- | --- | --- |
| `npm test` | 8 檔、40 案例通過 | `tests/setup.js` 在載入 app 前設定唯一的系統暫存 `DATABASE_PATH`，不寫入專案根目錄的開發資料庫；付款測試以注入的 HTTP client 模擬綠界查詢回應。 |
| `npm run css:build` | 通過 | Tailwind 產生已忽略 Git 的 `public/css/output.css`。 |
| `npm run openapi` | 通過 | 重新產生 `openapi.json`，付款端點註解可成功解析。 |

此驗證不呼叫綠界，也不測試 Server Notify 或真實測試卡付款；這些外部流程不屬本機作業的驗收範圍。

2026-09-11 在獨立程式副本、全新 SQLite、Node 22.23.2／npm 11.2.0，設定測試 JWT 與預設管理員後執行：

| 檢查 | 結果 | 解讀 |
| --- | --- | --- |
| `npm ci --cache .tmp-docs-npm-cache --no-audit --no-fund` | 成功，244 packages | 使用專案內 cache 避開 npm 預設 cache 權限問題 |
| `npm test` | 6 檔、32 案例通過 | 初次 sandbox 執行遭 esbuild 上層目錄讀取限制；獲允許後同副本命令通過 |
| `npm run css:build` | 通過 | Tailwind 產生壓縮 CSS |
| `npm run openapi` | 通過 | 產出 JSON，14 個 path、19 個 method 操作 |

測試輸出有 Vite CJS API deprecated 警告，但未造成失敗。本次不宣稱完成瀏覽器互動／視覺 QA。原專案 SQLite 未用於測試；副本資料、產物和 npm 暫存於完成驗證後清理。

## 測試檔案表

| 檔案 | 案例數 | 覆蓋內容 | 建置資料與依賴 |
| --- | --- | --- | --- |
| `tests/setup.js` | helper，非 test | app、request、getAdminToken、registerUser | 引入時建表／seed；不清資料、不重設 secret |
| `tests/auth.test.js` | 6 | 註冊成功、重複email、管理員登入、錯密碼、profile、有無token | 後續重複／profile依赖首案例的email／token；管理員帳密固定 |
| `tests/products.test.js` | 4 | 列表、limit=2分頁、詳情、404 | 第一案例取得商品id，詳情依賴它；要求至少有一商品 |
| `tests/cart.test.js` | 6 | 訪客新增／讀／改3件／刪、會員加2件、商品404 | beforeAll取列表第一商品；訪客CRUD沿用itemId；會員項目不清理 |
| `tests/orders.test.js` | 6 | 建單、空車、無認證、本人列表／詳情、404 | beforeAll註冊並加1件；首案例建單後，空車與詳情依賴結果 |
| `tests/adminProducts.test.js` | 6 | 列表、新增、部分更新、刪除、會員403、無token401 | beforeAll取admin token；新增→更新→刪除共享createdProductId |
| `tests/adminOrders.test.js` | 4 | 列表、pending篩選、詳情、會員403 | beforeAll登入admin並註冊會員、加1件、建立pending訂單 |
| `tests/ecpayService.test.js` | 3 | 官方 SHA256 CheckMacValue 向量、竄改金額驗簽失敗、AIO staging 表單 | 不呼叫綠界；使用固定測試商店參數與本機物件 |
| `tests/paymentScheduler.test.js` | 5 | AIO 表單、pending 唯一約束、已簽章成功入帳、金額不符、HTTP 403 暫停與 5 秒節流 | 建單後以可注入 `fetchImpl` 模擬 QueryTradeInfo/V5；不對外發出 HTTP 請求 |

現有多數負向案例只斷言 error 非 null，而非精確機器碼；新增測試應同時斷言 status、error 及必要副作用，避免錯誤分支完全不同卻仍通過。

## 執行順序與依賴關係

vitest.config.js 設 `globals:true`，所以 test 檔不用 import describe／it／expect；`fileParallelism:false` 關閉檔案平行執行；`hookTimeout:10000` 僅針對 hook，不是所有測試自動有 10 秒 timeout。沒有 `setupFiles` 設定，tests/setup.js 是各檔手動 require 的 helper。

設定中 `sequence.files` 列了 auth → products → cart → orders → adminProducts → adminOrders 的檔名字串，但這不是本版 Vitest 的自訂排序器，不能當作實際執行順序保證。本次實際順序為 orders → cart → adminProducts → auth → adminOrders → products，與陣列不同。若日後需要特定檔案排序，應實作對應 sequencer；更好的 fixture 設計是不依賴其他檔案先完成。

跨檔沒有直接共享 JavaScript 變數，但共享同一 SQLite 檔與 seed 商品。兩份 orders 測試各扣1件；cart 的會員加2件保留在DB；反覆執行会累積會員／訂單並消耗商品庫存，且 seed 不補非空商品表。不要以禁止平行推定已做到資料隔離。

檔內鏈式依賴如下：

```text
auth:          註冊 → 重複註冊、profile
products:      列表取id → 商品詳情
cart:          beforeAll商品 → 訪客新增 → 查看／修改 → 刪除
orders:        beforeAll註冊與加購 → 建單 → 空車驗證、詳情
adminProducts: admin登入 → 新增 → 更新 → 刪除
adminOrders:   beforeAll會員加購與建單 → 詳情
```

因此 `-t` 單挑依賴前案的測試可能失敗，例如只執行「update a product」時沒有 createdProductId。可先跑完整測試檔，或將測試改善為自己的 beforeEach／fixture，再進行單例篩選。不要使用 test.concurrent 或 shuffle 跑現有鏈式案例。

## 安全且可重現的執行方式

### 為何要用可丟棄副本

DB 路徑由 src/database.js 依檔案位置固定，`NODE_ENV=test` 只改 seed bcrypt cost，不會使用記憶體 DB。單純切 cwd、改 PORT 或設定 DATABASE_URL 都不會隔離已引入的原檔案。需要複製 app／src／tests 等第一方檔案到另一個目錄，再從副本啟動測試。

以下 PowerShell 範例使用已安裝的根目錄 node_modules，建立唯一名稱的專案內副本。只複製明列的第一方來源，不複製 `.env`／資料庫／`.git`；junction 只共用套件，不共用 src/database.js：

```powershell
# 在原專案根目錄執行，先完成 npm ci。
$testSource = (Get-Location).Path
$testCopy = Join-Path $testSource ('.tmp-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testCopy | Out-Null
$testFiles = @(
  'app.js', 'server.js', 'src', 'tests', 'views', 'public',
  'package.json', 'package-lock.json', 'vitest.config.js',
  'swagger-config.js', 'generate-openapi.js'
)
foreach ($testFile in $testFiles) {
  Copy-Item -LiteralPath (Join-Path $testSource $testFile) -Destination $testCopy -Recurse
}
New-Item -ItemType Junction -Path (Join-Path $testCopy 'node_modules') `
  -Target (Join-Path $testSource 'node_modules') | Out-Null
Push-Location $testCopy
try {
  $env:JWT_SECRET = 'flower-life-isolated-test-secret'
  $env:NODE_ENV = 'test'
  $env:ADMIN_EMAIL = 'admin@hexschool.com'
  $env:ADMIN_PASSWORD = '12345678'
  npm test
} finally {
  Pop-Location
}
```

在專用測試終端跑此範例，環境變數會留在該終端直到關閉。驗證完自行檢查並清理剛建立的唯一副本，先移除 junction 本身、不要遞迴操作它指向的 node_modules；不應提供或使用泛配刪除所有 `.sqlite` 的命令。若環境不支援 junction，可在副本內 `npm ci` 安裝依賴。

### 已在可丟棄環境的簡短命令

```powershell
$env:JWT_SECRET = 'flower-life-isolated-test-secret'
$env:NODE_ENV = 'test'
$env:ADMIN_EMAIL = 'admin@hexschool.com'
$env:ADMIN_PASSWORD = '12345678'
npm test
npm test -- tests/products.test.js
```

```sh
JWT_SECRET=flower-life-isolated-test-secret NODE_ENV=test \
ADMIN_EMAIL=admin@hexschool.com ADMIN_PASSWORD=12345678 npm test
```

不要先用已更改管理員帳號的 DB 跑再試圖靠環境變數恢復預設；seed 不更新已存在帳號。測試失敗先看首次失敗的 status/body，而非只看後續 `.data.token` undefined。

## 輔助函式

### app 與 request

setup.js 的 app 是 `require('../app')`，request 是 Supertest 的函式。典型用法 `await request(app).get('/api/products')`，JWT 用 `.set('Authorization', 'Bearer ' + token)`，訪客用 `.set('X-Session-Id', sid)`，JSON body 用 `.send({...})`。不要手動 listen 再讓 Supertest 重複建 server。

### getAdminToken()

POST `/api/auth/login`，固定 email=`admin@hexschool.com`、password=`12345678`，回 `res.body.data.token`。函式沒有先 assert status，也不接受 overrides。若 DB 沒這個帳號或密碼不符，会以 data=null 的屬性存取錯誤呈現，掩蓋原本401。

### registerUser(overrides={})

預設 email 是 `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`，password=`password123`、name=`測試使用者`。三欄用 `overrides.value || default`，所以無法透過此 helper 傳空字串測試缺欄。回 `{token,user}`，沒有 cleanup、角色自訂或 status assertion；負向註冊直接 request，不要用 helper。

### 目前沒有的 helpers

沒有 resetDatabase、createProduct、createOrder、mockPayment、freezeTime 等 helper。新增共用 fixture 時先確認至少多處需要，明確回傳自己建立的id與清理方式；使用 await 並先 assert fixture 的201／200，避免後續測試出現不相干的undefined錯誤。

## 撰寫新測試的步驟與範例

1. 從功能契約挑可觀察結果：例如同商品加購會累加、他人 cart item 不可修改，而不只是檢查程式用了哪個 helper。
2. 以唯一資料建立自己的 fixture，不依賴 seed 第0筆、不依賴其他 `it`；相關 setup 先斷言狀態。
3. 送出真實 HTTP，斷言 HTTP、error、data 及相關資料不變或副作用。
4. 記錄並按 FK 依賴順序清理自己建立資料，不能清空所有其他案例的資料。
5. 先跑完整相關檔，再跑全套確認共享 DB 不受污染。若涉及畫面，另跑下節手動流程。

下例可存成 `tests/cartIsolation.test.js`，在可丟棄 DB 中執行；使用測試專屬商品和两位會員，驗證乙不能改甲的車，並保留原量。這是文件範例，本次未新增此測試檔：

```js
const { app, request, getAdminToken, registerUser } = require('./setup');
const db = require('../src/database');
const { randomUUID } = require('crypto');

describe('Cart ownership', () => {
  const userIds = [];
  let productId;

  afterAll(() => {
    db.transaction(() => {
      for (const id of userIds) {
        db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(id);
      }
      if (productId) db.prepare('DELETE FROM products WHERE id = ?').run(productId);
      for (const id of userIds) {
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
      }
    })();
  });

  it('returns 404 to another owner and keeps the original quantity', async () => {
    const admin = await getAdminToken();
    const productRes = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: `ownership-${randomUUID()}`, price: 300, stock: 5 });
    expect(productRes.status).toBe(201);
    productId = productRes.body.data.id;

    const owner = await registerUser();
    userIds.push(owner.user.id);
    const other = await registerUser();
    userIds.push(other.user.id);

    const added = await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ productId, quantity: 2 });
    expect(added.status).toBe(200);

    const denied = await request(app)
      .patch(`/api/cart/${added.body.data.id}`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ quantity: 1 });
    expect(denied.status).toBe(404);
    expect(denied.body).toMatchObject({ data: null, error: 'NOT_FOUND' });

    const cart = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(cart.status).toBe(200);
    expect(cart.body.data.items).toHaveLength(1);
    expect(cart.body.data.items[0].quantity).toBe(2);
    expect(cart.body.data.total).toBe(600);
  });
});
```

直接 SQL 僅用於 fixture 清理；行為驗證仍透過 HTTP。若測試建了訂單，清理順序需先 order_items 再 orders，最後才 users；商品庫存則用自己專屬 fixture，避免改動 seed 庫存造成別案受影響。新增案例要在實際測試環境跑過，文件範例可讀不等於已執行證據。

## 應補測的整合邊界

| 區域 | 建議補案例 | 現有缺口／原因 |
| --- | --- | --- |
| JWT | 過期、錯secret、非HS256、已刪帳號 | 既有多只測無token |
| 授權 | 普通會員與他人訂單／cart；改DB role後舊token | owner 與token角色跨模組契約 |
| 雙模式 | JWT與session同送、無效Bearer不得fallback、非Bearer+session | cart 核心非標準機制尚未完整測 |
| 數量 | 預設1、0、負數、小數、字串、累加超庫存 | parseInt 行為易和schema分歧 |
| 建單 | 扣庫存精確值、清車、快照不隨商品更新、任一寫入失敗回滾 | 現有空車案只間接驗證清車 |
| 金額 | 低於500與等於500、改價後建單 | 運費只在前端，尚無一致性測試 |
| 付款 | success/fail、重付、他人訂單、不合法action、失敗不補庫存 | 現有orders.test完全未呼叫pay |
| 刪商品 | pending 409、cart FK 500、paid/failed歷史快照保留 | 現有只刪無引用的新商品 |
| 分頁 | 0、負數、>100、末頁外、非法status被忽略 | 現有只測limit=2和pending |
| 錯誤 | malformed JSON、安全message、HTML render例外 | 集中handler與页面callback回應不同 |
| UI | 登入401導頁、訪客轉會員、badge、空狀態與網路失敗 | API測試不跑JavaScript／CDN |

## 手動驗收指南

用可丟棄資料啟動網站並建好 CSS，打開瀏覽器 Console／Network。以下是驗收步驟，不表示本次已逐項人工完成。

1. 訪客首頁：商品與圖片出現，分頁 limit=9，售完按鈕禁用；點詳情數量不能低於1或高於載入庫存。
2. 訪客車：加入同商品两次，確認只一列但量累加；改量、刪除有確認對話框；重載後資料仍在同session。
3. 登入切換：訪客車有商品時登入，新會員車可能空，登出後訪客車仍在；依現況紀錄，不誤判為合併完成。
4. 結帳：登入後加商品，缺收件欄位與錯email顯示提示；有效提交後跳詳情、pending、清車與扣庫存。
5. 付款：兩張分開訂單測成功與失敗，觀察status、按鈕消失；再次PATCH被拒；查庫存確認失敗不回補。
6. 低價商品：管理員建立300元商品，前端顯示450、訂單保存300；目前应記為已知缺口，修復后再改驗收預期。
7. 管理後台：普通會員直接呼叫admin API應403；管理員增改刪、pending篩選、modal明細；買家與收件人分別顯示。
8. 錯誤／資源：失效JWT觸發登入導頁；不明API是JSON404，不明頁面是HTML404；測CDN失敗時查看Console而非認定後端掛掉。

## 常見陷阱與處理

| 現象 | 排查方向 |
| --- | --- |
| `.data.token` 為 null／undefined | helper沒檢查登入狀態；先查JWT_SECRET、seed admin、原始response |
| 單一it失敗但整檔通過 | 檔內前案提供id／token；改fixture而非強制檔案排序 |
| STOCK_INSUFFICIENT出現在fixture | 重跑消耗共用seed；新副本或測試專屬商品 |
| NODE_ENV=test仍改到開發DB | DB位置未分環境；要複製src而不是只改cwd |
| 刪商品500 | cart_items外鍵仍引用；pending檢查不是唯一限制 |
| 測試回200卻付款失敗 | action=fail是正常模擬，需斷言data.status |
| API測試過但UI沒反應 | 未建CSS、Vue CDN失敗、DOM id／腳本順序不符；Supertest不跑瀏覽器 |
| Vitest配置讀取被拒 | sandbox的esbuild子程序上層目錄存取問題；不能據此判定業務測試失敗 |
| OpenAPI生成過但行為不符 | 註解不是runtime驗證器；以route及整合測試核對 |
| 日期先後不穩 | SQLite時間精度到秒，ORDER BY無第二排序鍵，不應斷言同秒資料順序 |

測試結果寫入 CHANGELOG 或歸檔計畫時，區分已跑且通過、未跑與環境阻擋；記錄執行命令與重要環境，不把 32 個API案例描述為完整端到端驗證。
