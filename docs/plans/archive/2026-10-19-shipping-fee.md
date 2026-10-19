# 配送費用計算模組（Shipping）

## User Story
作為購買者，我希望結帳與訂單依配送方式（宅配／超商取貨）、商品小計滿額免運、偏遠地區與當日急件正確計算運費，並與訂單總額一致，以確認應付金額。

## Spec
- 新增 `src/utils/shipping.js` 獨立純函數模組，不依賴資料庫或 HTTP，可獨立單元測試。
- 費率：宅配基本運費 120 元；超商取貨 60 元（不屬於基本運費，不受滿額免基本運費影響）；商品小計滿 1,500 元免基本運費（僅豁免宅配基本運費）；偏遠地區加收 200 元；當日急件加收 250 元；附加費可疊加，且在滿額免運後仍加收。
- 運費與商品小計加總為 `orders.total_amount`，並隨訂單一併持久化（`shipping_fee`、`subtotal`、`delivery_type`、`is_remote_area`、`is_same_day_express`）。
- 建單端點 `POST /api/orders` 新增選填欄位 `deliveryType`、`isRemoteArea`、`isSameDayExpress`，缺值以宅配、非偏遠、非急件預設；既不傳送欄位的現有呼叫行為不變（預設宅配，小計滿 1,500 則運費為 0）。
- API 回應 `{ data, error, message }` 契約維持不變，建單與訂單詳情回應新增運費相關欄位。
- 同步更新 `@openapi` 註解並重新產生 `openapi.json`；更新 `docs/FEATURES.md`、`docs/ARCHITECTURE.md`、`docs/CHANGELOG.md`。
- 新增 `tests/shipping.test.js` 單元測試，涵蓋宅配基本運費、超商取貨、1,499／1,500 邊界、偏遠、急件、多項附加費疊加、滿額免運與附加費同時成立。

## Tasks
- [x] 建立 `src/utils/shipping.js` 與常數、純函數
- [x] 在 `src/database.js` orders 表新增欄位並提供既有資料庫可重複執行的欄位升級
- [x] 修改 `src/services/orderService.js` 接收配送選項、計算運費、寫入訂單欄位、total_amount 為小計＋運費
- [x] 修改 `src/routes/orderRoutes.js` 接收並預設配送欄位、回應運費資訊、補 @openapi 註解
- [x] 執行 `npm run openapi` 重新產生 `openapi.json`
- [x] 新增 `tests/shipping.test.js` 並確認 `npm test` 全數通過
- [x] 更新 `docs/FEATURES.md`、`docs/ARCHITECTURE.md`、`docs/CHANGELOG.md`
- [x] 將計畫移至 `docs/plans/archive/` 並記錄驗證結果

## 完成紀錄（2026-10-19）
- 實作模組：`src/utils/shipping.js`，純函數 `calculateShipping` / `getBasicShippingFee` / `isFreeBasicShippingThresholdReached`，費率與常數皆匯出。
- 資料庫：`orders` 新增 `subtotal`、`shipping_fee`、`delivery_type`、`is_remote_area`、`is_same_day_express`，`ensureOrdersShippingColumns()` 可重複執行，既有資料採預設值，外鍵未變更。
- 建單整合：`orderService.createOrderFromCart` 在交易內計算 `total_amount = subtotal + shippingFee` 並寫入運費欄位；`POST /api/orders` 新增選填 `deliveryType`/`isRemoteArea`/`isSameDayExpress`，缺值預設宅配、非偏遠、非急件，既有呼叫不受影響。
- OpenAPI：補 `POST /api/orders` 與訂單詳情回應的運費欄位註解，`npm run openapi` 產生 `openapi.json`。
- 前端：結帳頁配送方式改為符合既有黑金花藝視覺的選項卡，補上免運進度、附加服務說明與訂單金額明細；費率文案固定顯示原始金額，不再於未勾選時誤顯示 0 元。
- 測試：`tests/shipping.test.js` 21 案例全部通過；`npm test` 全部 9 檔 62 案例通過，無 regressions。
- 視覺驗證：以 1440 px 桌面與 390 px 手機寬度檢查配送區塊，確認雙欄／單欄切換、金額層級與內容均無溢位。
