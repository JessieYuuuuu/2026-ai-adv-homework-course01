# 完整測試流程

## User Story

作為專案維護者，我希望能以固定 npm 指令驗證訂單從購物車、配送、資料庫交易到綠界測試付款的完整流程，並能產生可提交的 Postman Collection，以降低跨層整合失誤。

## Spec

- 使用 Vitest 與 Supertest 建立訂單 Integration Test，每次執行使用唯一暫存 SQLite，完成後關閉連線並清除測試檔，不讀寫根目錄 `database.sqlite`。
- Integration Test 需驗證會員、商品、購物車、含配送資料的建單、資料庫訂單與明細、運費、總額、庫存、清車，以及交易失敗時的完整回滾。
- 使用 Playwright 操作已啟動的 `http://localhost:3001`，不得由測試啟動應用程式；完成綠界網路 ATM／土地銀行測試付款、返回站點、UI 與 API paid 狀態驗證，並保存成功截圖。
- 重新產生 `openapi.json`，再由專案腳本產生 Postman Collection；Collection 使用 `{{baseUrl}}`，包含 `baseUrl`、`token`、`sessionId`，登入後自動保存 JWT，受保護 API 使用 Bearer Token。
- `package.json` 提供 `test:unit`、`test:integration`、`test:e2e`、`postman` 四個入口。

## Tasks

- [x] 新增隔離資料庫的訂單 Integration Test
- [x] 新增直接連線既有服務的 Playwright E2E
- [x] 新增 OpenAPI → Postman Collection 產生器與產物
- [x] 新增並驗證 npm 指令
- [x] 更新測試與專案文件
- [x] 完成驗證並歸檔計畫

## 完成與驗證紀錄

- `npm run test:unit`：21/21 通過。
- `npm run test:integration`：2/2 通過；獨立驗收比對正式資料庫的 users、products、cart_items、orders、order_items 與庫存總和，執行前後完全一致，且沒有 Integration Test 暫存 SQLite 殘留。
- `npm run postman`：成功產生 OpenAPI 22 個 operations 對應的 22 個 Postman requests；三個付款 URL 均使用 `{{id}}`，登入腳本、Bearer Token 與 Collection 變數皆通過檢查。
- `npm run test:e2e`：完成登入、加購、含配送資訊結帳、綠界網路 ATM、台灣土地銀行、Save、返回站點、API `paid` 與訂單列表「已付款」精確驗證；成功截圖輸出至 `docs/e2e/payment-success.png`。
- E2E 會真實新增訂單、訂單品項、付款紀錄並扣除庫存；第二輪獨立驗收亦實際執行並確認通過。
- Postman Collection 與 E2E PNG 均由 `.gitignore` 排除；提交來源產生器、測試程式、OpenAPI 與文件即可。
