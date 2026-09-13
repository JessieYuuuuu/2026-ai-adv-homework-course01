# 更新日誌

## 紀錄原則與證據範圍

本文件只記可由 Git、檔案內容或本次實際驗證確認的變化。日期採 `YYYY-MM-DD`，同一日期下區分新增、已知限制與驗證。未發版文件異動放 Unreleased，不以 npm 版本欄位推定已發布套件，也不為初始提交中的每項功能捏造較早上線時間。

新增紀錄至少說明使用者／開發者可觀察的變更、影響的模組與資料契約、必要的環境或升級步驟，以及實際執行的測試。若有計畫，連到 `plans/archive/YYYY-MM-DD-feature-name.md`；尚未完成者留在 plans，不能以歸檔代替完成驗證。

## [Unreleased] - 2026-09-11

### 新增：完整專案文件

逐一檢視第一方後端程式、所有瀏覽器腳本、EJS layout／partials／pages、CSS、全部測試、npm／OpenAPI／Vitest／環境設定與Git歷史後，建立以下文件與目錄：

| 文件／目錄 | 新增內容與用途 |
| --- | --- |
| `AGENTS.md` | 專案定位、真實npm指令、跨模組關鍵規則、@docs引用 |
| `docs/README.md` | 技術版本、PowerShell／shell快速開始、種子資料、指令与文件索引 |
| `docs/ARCHITECTURE.md` | 逐檔用途、啟動順序、19個API操作、14個path、schema全部欄位、JWT／session及交易資料流 |
| `docs/DEVELOPMENT.md` | 現況與新規範區別、命名、模組系統、環境變數、API／middleware／DB／頁面擴充、JSDoc及歸檔流程 |
| `docs/FEATURES.md` | 各功能行為、body必填選填、分頁預設、精確狀態／錯誤與已知未完成整合 |
| `docs/TESTING.md` | 6檔32案例、實際排序與依賴、獨立副本執行、helper、測試範例、缺口與手動驗收 |
| `docs/plans/`、`docs/plans/archive/` | 以.gitkeep保留目錄；未虛構任何已完成開發計畫 |

本次工作只新增文件與目錄，不修改業務程式、DB schema、套件版本、路由註解或既有本機 `.codex` 設定。範本需求中提及 CLAUDE.md 的結構已用於使用者指定的 AGENTS.md，沒有額外建立另一份重複入口。

### 已記錄：既有整合限制

以下是既有程式的檢視發現，不是本次新增的bug或已修復項目：

- 訪客與會員購物車分開；JWT優先，無效Bearer不降級；登入沒有合併車。
- 建單交易扣庫存、存商品快照、清會員車；失敗付款不回補，也不允許再次付款。
- 付款僅模擬狀態；ECPAY_*／BASE_URL範本未接線；query payment只影響提示。
- 前台運費顯示未滿500加150，但後端只保存商品小計；月配、評論、配送文案沒有對應服務。
- 商品刪除除pending訂單409外，還可能受cart_items外鍵阻擋而500。
- JWT role取token、DB只查帳號存在；前端角色只是導覽；HTML路由沒有伺服器認證。
- 部分數量輸入被parseInt截斷；OpenAPI quantity必填與實作預設不一致；PUT商品為部分更新。
- 測試共享實體DB且不清理，sequence.files不能保證所列順序，既有付款／交易邊界缺測。
- badge初始項目數與加購增量不一致；全域401登入導頁、redirect未限制、header姓名拼innerHTML等行為需在後續功能／安全修改另行處理。

具體重現條件與檔案來源見 FEATURES、ARCHITECTURE；未建立未獲安排的修復計畫，也未宣稱上述問題已解決。

### 驗證

於Node 22.23.2／npm 11.2.0建立專案內獨立來源副本，使用全新SQLite、測試JWT_SECRET、NODE_ENV=test與預設admin帳密。npm依賴使用專案內cache成功安裝244 packages；原預設cache與指定外部cache曾遇Windows EPERM，未更動應用程式解決。

`npm test` 初次因sandbox/esbuild上層目錄存取被拒而未啟動；允許後同副本測試通過，結果6 test files、32 tests全數成功。實際檔案順序為orders、cart、adminProducts、auth、adminOrders、products，已用於修正文件對排序設定的解讀。

`npm run css:build` 與 `npm run openapi` 在副本成功，生成OpenAPI的14個path、19個HTTP操作已核對。瀏覽器視覺與互動未作本次驗證。沒有在原專案資料庫執行測試，也沒有部署或發布。

## 1.0.0 程式基線 — 2026-04-07

### 可查證歷史

目前可見Git歷史只有初始提交 `004e507`，日期2026-04-07，訊息 `init`。`package.json` 版本1.0.0且private=true；沒有足夠證據把它稱為對外發布版本。以下是初始提交已有的功能集合，不代表其各自的開發日期。

### 原始功能與結構

單一Express應用提供EJS前後台與靜態資源；SQLite使用WAL、外鍵、五張表與初始管理員／八商品seed。認證以bcrypt與7天JWT完成；商品公開讀取；購物車支援訪客／會員；會員可建單、查訂單和模擬付款；後台提供商品CRUD與全站訂單查詢。

前端使用Vue 3 CDN、Tailwind CSS 4與Google Fonts，腳本直接掛載各頁#app；加入全域Auth、apiFetch、Notification與導覽初始化。文件工具為swagger-jsdoc生成OpenAPI JSON，測試為Vitest／Supertest的6份API整合檔。

### 基線限制

初始化只有CREATE TABLE IF NOT EXISTS，沒有資料遷移版本；資料庫路徑未按環境隔離。沒有真金流、退款、物流、訂閱排程、完整schema驗證、瀏覽器自動測試或CI。既有程式詳細狀態以本次讀碼文件為準，不將這些缺口回填成不存在的過往修正版本。

## 後續更新方式

功能完成時在Unreleased加入具體觸發與新結果，若改JWT、owner、金額、schema或付款狀態，必須說明相容性與資料升級。保留先前日期的檢視紀錄，後續修復應新增「已修復」並連結相關計畫／提交，不直接抹掉曾存在的限制。正式切版時才將已確認異動整理到真實版本標題，並同步套件版本及驗證資訊。
