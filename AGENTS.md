# AGENTS.md

## 專案概述

花漾生活 Flower Life（npm 套件名稱 `backend-project`，版本 `1.0.0`）是花卉電商教學專案。Node.js／Express 提供 REST API 與 EJS 頁面，瀏覽器使用 CDN Vue 3，Tailwind CSS 4 負責樣式；better-sqlite3 直接存取根目錄 `database.sqlite`。目前包含商品、帳號、雙模式購物車、訂單、模擬付款及管理後台。

後端採 CommonJS，沒有 controller/service/ORM 分層；SQL 與業務邏輯位於 `src/routes/*Routes.js`。頁面由 EJS 產生外框，再由 `public/js/pages/*.js` 呼叫 API。閱讀或修改模組時，必須同時檢查對應路由、頁面腳本、模板和測試。

## 常用指令

所有指令在專案根目錄執行，詳細前置條件見 @docs/README.md。

| 指令 | 實際行為與使用時機 |
| --- | --- |
| `npm ci` | 依 `package-lock.json` 安裝固定依賴；包含原生模組 |
| `npm start` | 先建置 CSS，成功後執行 `node server.js` |
| `npm run dev:server` | 只啟動伺服器，沒有自動重啟功能 |
| `npm run dev:css` | Tailwind CLI 監看 `public/css/input.css` 與樣式來源 |
| `npm run css:build` | 產生壓縮的 `public/css/output.css` |
| `npm run openapi` | 從路由註解產生根目錄 `openapi.json`，不啟動 Swagger UI |
| `npm test` | 執行 Vitest／Supertest；會修改同一份 `database.sqlite` |

啟動前設定 `JWT_SECRET`；`server.js` 直接執行時缺值會退出，但資料庫初始化發生在檢查之前。測試應在可丟棄副本執行，不能把 `NODE_ENV=test` 當成資料庫隔離。

## 關鍵規則

- 保持 API `{ data, error, message }` 回應、現有 camelCase 請求／snake_case 資料欄位，以及 CommonJS 模組契約；修改端點同步更新 `@openapi` 註解與相關前端。
- 認證與資料隔離必須由伺服器保障。管理 API 先經 `authMiddleware` 再經 `adminMiddleware`；一般使用者訂單與購物車 SQL 必須限制 owner。前端 localStorage 的角色判斷只控制導覽。
- 保留購物車 JWT 優先規則：Bearer 無效即 401，不降級訪客；登入不合併訪客車。庫存於建立訂單交易內扣除，失敗付款不回補，付款僅模擬。改動這些契約需同步檢查整個購買流程。
- 資料表以 `CREATE TABLE IF NOT EXISTS` 初始化，沒有 migration；變更 schema 必須交代既有資料升級與外鍵處理。不得把 `.env`、SQLite 資料或產生的 CSS 當成原始碼提交；不要覆寫現有本機 `.codex/` 設定。
- 功能開發使用 `docs/plans/` 記錄 `User Story → Spec → Tasks`，檔名 `YYYY-MM-DD-<feature-name>.md`；完成並記錄驗證後移至 `docs/plans/archive/`，同步更新功能狀態與更新日誌。

## 詳細文件

- @docs/README.md — [項目介紹與快速開始](./docs/README.md)
- @docs/ARCHITECTURE.md — [架構、逐檔用途、資料流、API 與 schema](./docs/ARCHITECTURE.md)
- @docs/DEVELOPMENT.md — [命名、模組、擴充步驟與計畫歸檔](./docs/DEVELOPMENT.md)
- @docs/FEATURES.md — [功能行為、完成狀態、欄位與錯誤情境](./docs/FEATURES.md)
- @docs/TESTING.md — [測試依賴、執行方式、範例與已知缺口](./docs/TESTING.md)
- @docs/CHANGELOG.md — [可追溯的更新日誌](./docs/CHANGELOG.md)
