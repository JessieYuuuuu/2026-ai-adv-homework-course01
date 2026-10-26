# 作業審查回饋修正

## User Story

作為作業維護者，我希望把不同堂次審查發現的文件、測試、E2E 與 CSS 一致性問題集中修正，並固定在 `homework-corrections` 分支延續後續作業修正，避免修改散落於各堂作業分支。

## Spec

- `AGENTS.md` 與 `docs/` 登錄 E2E skill、隔離 Playwright MCP，以及 Unit、Integration、E2E、Postman 指令。
- E2E 自動腳本不得從頁面內直接呼叫訂單 API；成功判斷須核對付款完成頁五項可見資訊及訂單列表狀態。
- E2E skill 分別定義 MCP 信用卡／3D 人工模式與 npm 網路 ATM 自動模式，兩種模式共用 staging、安全與 UI 驗收邊界。
- `test:unit` 涵蓋原有測試與 Shipping 測試，但排除另由 `test:integration` 執行的完整 Integration Test。
- E2E 腳本直接使用穩定版 Playwright；保留 `@playwright/mcp` 上游目前固定的遞移 alpha 依賴並如實記錄。
- 前台改用符合實際色彩的 `brand-gold` token；後台玫瑰色 token 維持不變，重複的 900px／640px 規則合併而不改變既定手機版配置。

## Tasks

- [x] 建立並切換至 `homework-corrections` 分支
- [x] 同步代理入口與維護文件
- [x] 移除 E2E 的頁面內訂單 API 呼叫並補五項 UI 驗收
- [x] 將 E2E skill 拆分為兩種明確模式
- [x] 擴大 `test:unit` 涵蓋範圍
- [x] 將專案直接 Playwright 依賴改為穩定版範圍並更新 lockfile
- [x] 重新命名前台色彩 token 並合併響應規則
- [x] 完成測試、建置、語法與 skill 驗證

## 驗證

- `npm run test:unit`：9 個檔案、62 個案例通過。
- `npm run test:integration`：1 個檔案、2 個案例通過。
- `npm run css:build`：通過。
- `node --check tests/e2e/payment-flow.e2e.js`：通過。
- Skill Creator `quick_validate.py`：`Skill is valid!`。
- `npm ls playwright --all`：E2E 腳本使用 `playwright@1.64.1`；`@playwright/mcp@0.0.83` 使用其上游固定的獨立 alpha 版本。
- 未執行 `npm run test:e2e`，避免在未經額外確認的情況下新增付款測試訂單與扣除目前站點庫存。
