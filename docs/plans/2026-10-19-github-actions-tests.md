# GitHub Actions 自動測試

## User Story

作為專案維護者，我希望程式碼推送或提出 Pull Request 時，自動執行 Shipping 單元測試與訂單 Integration Test，以便在合併前發現測試失敗。

## Spec

- 建立 `.github/workflows/test.yml`。
- Workflow 在 push、pull request 與手動觸發時執行。
- 使用 Node.js 22 與 `npm ci` 安裝 lockfile 依賴。
- Unit Test 與 Integration Test 必須是兩個名稱明確、彼此分開的步驟。
- 不執行 Playwright E2E，也不啟動額外前端或後端服務。
- 本機驗證 YAML 可解析，並執行兩條與 CI 相同的測試指令。

## Tasks

- [x] 建立 GitHub Actions workflow
- [x] 驗證 YAML 格式
- [x] 執行 Unit Test
- [x] 執行 Integration Test
- [x] 更新測試文件與更新日誌
- [ ] commit、push 後確認 GitHub Actions 遠端狀態並歸檔計畫

## 本機驗證紀錄

- YAML 已成功解析，並確認 triggers 為 push、pull request、workflow dispatch。
- Workflow 的執行命令只有 `npm ci`、`npm run test:unit`、`npm run test:integration`；不包含 E2E 或服務啟動。
- `npm run test:unit`：21/21 通過。
- `npm run test:integration`：2/2 通過。
- GitHub Actions 遠端狀態須待本次修改 commit、push 後才能確認。
