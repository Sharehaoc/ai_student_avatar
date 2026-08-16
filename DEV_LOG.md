# DEV LOG

## 2026-08-16 — Session 01：修正 Windows 本機 Supabase 初始化

### 改動摘要
修正 Windows 上的本機初始化工具，讓它能正確執行 `pnpm.cmd` 並讀取已啟動的 Supabase 狀態。

### 修改檔案
- `apps/api/src/scripts/local-bootstrap.ts` — 在 Windows 使用命令殼執行 `pnpm.cmd`。
- `DEV_LOG.md` — 建立本專案的開發紀錄。

### 驗證結果
- 已重新執行 `pnpm local:bootstrap`，本機帳號、AI 分身與 Git 排除的 `.env` 已建立。
- 已執行 `pnpm --filter @flying-eagle/api typecheck`，通過。

### 尚未完成／未驗證
- 尚未啟動 Core API 或 Voice Agent；本階段只會啟動 Web 前端。

### 下一步
- [ ] 初始化本機帳號與 `.env`，再只啟動 Web 前端。
