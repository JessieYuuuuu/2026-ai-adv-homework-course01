# 購物車 badge 與訂單服務整理

- 建立日期：2026-09-29
- 狀態：已完成
- 依據：老師後續作業回饋

## User Story

作為購物者，我希望購物車 badge 永遠反映目前的購物車項目數；作為維護者，我希望訂單建立交易集中在 service，讓 route 只處理驗證與回應。

## Spec

- badge 初始載入、加購、改量與刪除後，都重新讀取目前購物車項目數；重複加購同商品不額外增加項目數。
- `src/services/orderService.js` 負責讀取會員購物車、檢查庫存、計算金額、建立訂單與明細、扣庫存及清空購物車的單一交易。
- 保留既有 API 回應格式與錯誤代碼；庫存更新加入條件，避免交易內扣成負數。

## Tasks

- [x] 建立訂單 service 並讓訂單 route 呼叫。
- [x] 將 badge 更新集中為重新查詢購物車。
- [x] 更新文件、測試與驗證紀錄。

## 驗證

- `node --check src/services/orderService.js`
- `node --check src/routes/orderRoutes.js`
- `git diff --check`
- `npm test`：8 個測試檔、41 個案例全部通過。
