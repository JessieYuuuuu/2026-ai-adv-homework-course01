# 更新日誌

## 紀錄原則與證據範圍

本文件只記可由 Git、檔案內容或本次實際驗證確認的變化。日期採 `YYYY-MM-DD`，同一日期下區分新增、已知限制與驗證。未發版文件異動放 Unreleased，不以 npm 版本欄位推定已發布套件，也不為初始提交中的每項功能捏造較早上線時間。

新增紀錄至少說明使用者／開發者可觀察的變更、影響的模組與資料契約、必要的環境或升級步驟，以及實際執行的測試。若有計畫，連到 `plans/archive/YYYY-MM-DD-feature-name.md`；尚未完成者留在 plans，不能以歸檔代替完成驗證。

## [Unreleased]

### Added

- 2026-10-05 使用 `frontend-design` skill 與 Pencil MCP 建立桌面／手機版黑金設計稿，涵蓋首頁、商品詳情、結帳、訂單建立及付款完成；7 張固定設計快照與說明保存於 `docs/design/`。
- 2026-09-29 新增 `src/services/orderService.js`，集中處理會員購物車建單、明細快照、庫存扣除與清空購物車的單一交易；既有 `/api/orders` 回應契約維持不變。實作與驗證見 [計畫紀錄](./plans/archive/2026-09-29-cart-badge-order-service.md)。
- 2026-09-17 新增本機 `POST /api/ecpay/notify` 占位路由，回覆純文字 `1|OK`；通知內容不參與付款狀態更新。實作與限制見 [計畫紀錄](./plans/archive/2026-09-17-ecpay-feedback-alignment.md)。
- 2026-09-13 新增 ECPay staging 付款流程：建立 AIO 表單、保存 `payment_attempts` 與排程狀態、以 QueryTradeInfo/V5 查詢並驗證 CheckMacValue、商店編號、交易編號與訂單金額。
- 新增本人付款建立、到期手動查詢與付款頁返回查詢端點；背景排程每 30 秒掃描到期交易，單筆查詢維持 10 分鐘間隔，HTTP 403 會保存 30 分鐘全域暫停。
- 新增 ECPay 本機測試：涵蓋官方簽章向量、竄改金額拒絕、staging AIO 表單、重複付款防護、驗簽入帳、403 暫停及節流；測試資料庫改用唯一暫存 SQLite 檔。

### Changed

- 2026-10-05 將消費者前台視覺重設為「黑金高級花藝會所」：首頁採精品型錄式花藝影像與黑金品牌字體，並統一導覽、頁尾、商品詳情、購物車、結帳、訂單確認、付款完成、登入與空狀態的曜石黑、香檳金及響應式版面。管理後台不在本次範圍，API 與資料契約未變更；實作與驗證見 [計畫紀錄](./plans/archive/2026-10-05-storefront-redesign.md)。
- 2026-09-29 將訂單建立 route 的交易邏輯移至 service；購物車 badge 在初次載入、加購、改量與刪除後都重新同步目前項目數，避免重複加購造成數字漂移。
- 2026-09-17 將文件與測試對齊表單實際送出的 `ChoosePayment=ALL`，並將 ReturnURL 指向本機占位路由；付款結果仍由後端查詢驗簽確認。統一 `docs/` 的繁體字用法。
- 付款狀態不再接受瀏覽器模擬結果；僅在後端驗簽並比對查詢回應後更新訂單。購物車、結帳、訂單與付款表單均使用保存的商品小計。
- 同步更新 README、架構、開發規範、功能與測試文件；外部 ReturnURL 與真實測試卡驗收不屬本機作業範圍，計畫已依本機完成條件歸檔至 `docs/plans/archive/`。

### Fixed

- 2026-09-29 修正購物車 badge 與實際項目列數不一致的問題；`node --check`、`git diff --check` 通過，`npm test` 通過 8 檔、41 案例。
- 2026-09-17 修正 ReturnURL 死路徑及付款表單測試預期與實作不一致；`npm test` 通過 8 檔、41 案例，`npm run openapi` 產生 17 個 path、22 個 method 操作。
- 移除購物車與結帳頁未入帳的運費摘要；首頁保留的「滿額免運」僅為待處理靜態文案。

## [Documentation baseline] - 2026-09-11

### Added

逐一檢視第一方後端程式、所有瀏覽器腳本、EJS layout／partials／pages、CSS、全部測試、npm／OpenAPI／Vitest／環境設定與Git歷史後，建立以下文件與目錄：

| 文件／目錄 | 新增內容與用途 |
| --- | --- |
| `AGENTS.md` | 專案定位、真實npm指令、跨模組關鍵規則、@docs引用 |
| `docs/README.md` | 技術版本、PowerShell／shell快速開始、種子資料、指令與文件索引 |
| `docs/ARCHITECTURE.md` | 逐檔用途、啟動順序、19個API操作、14個path、schema全部欄位、JWT／session及交易資料流 |
| `docs/DEVELOPMENT.md` | 現況與新規範區別、命名、模組系統、環境變數、API／middleware／DB／頁面擴充、JSDoc及歸檔流程 |
| `docs/FEATURES.md` | 各功能行為、body必填選填、分頁預設、精確狀態／錯誤與已知未完成整合 |
| `docs/TESTING.md` | 6檔32案例、實際排序與依賴、獨立副本執行、helper、測試範例、缺口與手動驗收 |
| `docs/plans/`、`docs/plans/archive/` | 以.gitkeep保留目錄；未虛構任何已完成開發計畫 |

本次工作只新增文件與目錄，不修改業務程式、DB schema、套件版本、路由註解或既有本機 `.codex` 設定。範本需求中提及 CLAUDE.md 的結構已用於使用者指定的 AGENTS.md，沒有額外建立另一份重複入口。

### Changed

以下是既有程式的檢視發現，不是本次新增的bug或已修復項目：

- 訪客與會員購物車分開；JWT優先，無效Bearer不降級；登入沒有合併車。
- 建單交易扣庫存、存商品快照、清會員車；失敗付款不回補，也不允許再次付款。
- ECPay 本機付款提供 AIO 表單、QueryTradeInfo/V5 簽章驗證、交易持久化與背景查詢；付款選項與本機通知占位路由的後續調整見上方 2026-09-17 紀錄。
- 購物車、結帳、訂單與綠界付款金額均為保存的商品小計，運費尚未實作；首頁仍保留「滿額免運」靜態文案，與目前功能不一致。月配、評論、配送文案沒有對應服務。
- 商品刪除除pending訂單409外，還可能受cart_items外鍵阻擋而500。
- JWT role取token、DB只查帳號存在；前端角色只是導覽；HTML路由沒有伺服器認證。
- 部分數量輸入被parseInt截斷；OpenAPI quantity必填與實作預設不一致；PUT商品為部分更新。
- 測試共享實體DB且不清理，sequence.files不能保證所列順序，既有付款／交易邊界缺測。
- badge初始項目數與加購增量不一致；全域401登入導頁、redirect未限制、header姓名拼innerHTML等行為需在後續功能／安全修改另行處理。

具體重現條件與檔案來源見 FEATURES、ARCHITECTURE；未建立未獲安排的修復計畫，也未宣稱上述問題已解決。

**驗證紀錄（2026-09-11）**

於Node 22.23.2／npm 11.2.0建立專案內獨立來源副本，使用全新SQLite、測試JWT_SECRET、NODE_ENV=test與預設admin帳密。npm依賴使用專案內cache成功安裝244 packages；原預設cache與指定外部cache曾遇Windows EPERM，未更動應用程式解決。

`npm test` 初次因sandbox/esbuild上層目錄存取被拒而未啟動；允許後同副本測試通過，結果6 test files、32 tests全數成功。實際檔案順序為orders、cart、adminProducts、auth、adminOrders、products，已用於修正文件對排序設定的解讀。

`npm run css:build` 與 `npm run openapi` 在副本成功，生成OpenAPI的14個path、19個HTTP操作已核對。瀏覽器視覺與互動未作本次驗證。沒有在原專案資料庫執行測試，也沒有部署或發布。

## [1.0.0] - 2026-04-07

### 可查證歷史

目前可見Git歷史只有初始提交 `004e507`，日期2026-04-07，訊息 `init`。`package.json` 版本1.0.0且private=true；沒有足夠證據把它稱為對外發布版本。以下是初始提交已有的功能集合，不代表其各自的開發日期。

### 原始功能與結構

單一Express應用提供EJS前後台與靜態資源；SQLite使用WAL、外鍵、五張表與初始管理員／八商品seed。認證以bcrypt與7天JWT完成；商品公開讀取；購物車支援訪客／會員；會員可建單、查訂單和模擬付款；後台提供商品CRUD與全站訂單查詢。

前端使用Vue 3 CDN、Tailwind CSS 4與Google Fonts，腳本直接掛載各頁#app；加入全域Auth、apiFetch、Notification與導覽初始化。文件工具為swagger-jsdoc生成OpenAPI JSON，測試為Vitest／Supertest的6份API整合檔。

### 基線限制

初始化只有CREATE TABLE IF NOT EXISTS，沒有資料遷移版本；資料庫路徑未按環境隔離。沒有真金流、退款、物流、訂閱排程、完整schema驗證、瀏覽器自動測試或CI。既有程式詳細狀態以本次讀碼文件為準，不將這些缺口回填成不存在的過往修正版本。

## 後續更新方式

功能完成時在Unreleased加入具體觸發與新結果，若改JWT、owner、金額、schema或付款狀態，必須說明相容性與資料升級。保留先前日期的檢視紀錄，後續修復應新增「已修復」並連結相關計畫／提交，不直接抹掉曾存在的限制。正式切版時才將已確認異動整理到真實版本標題，並同步套件版本及驗證資訊。
