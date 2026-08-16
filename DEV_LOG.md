# DEV LOG

## 2026-08-16 — Session 02：載入專屬 API Key

### 改動摘要
從學生提供的 Word 檔讀取專屬服務設定，僅寫入 Git 排除的本機 `.env`，供後續 Core API 與 Voice Agent 使用。
修復寫入格式造成的本機 `VITE_*` 欄位遺失，並以既有 `local:bootstrap` 恢復 Supabase 前端設定。

### 修改檔案
- `.env` — 寫入 LiveKit、Soniox、OpenAI、MiniMax 與 MiniMax Voice ID 的專屬設定；此檔案不納入 Git。
- `DEV_LOG.md` — 新增本次安全設定紀錄，不記錄任何 Key 值。

### 驗證結果
- 已確認七個指定環境變數都有值。
- 已確認 `VITE_API_URL`、Supabase 前端設定與 Persona ID 都有值。
- 已重新載入前端，登入後介面可正常顯示，瀏覽器沒有 console 錯誤。
- 已確認 `.env` 未被 Git 追蹤，且符合 `.gitignore` 排除規則。

### 尚未完成／未驗證
- 未啟動 Core API 或 Voice Agent，尚未進行外部 API 或語音通話測試。

### 下一步
- [ ] 由學生確認後，啟動 Core API 與 Voice Agent，驗證專屬服務設定。

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
- [x] 已只啟動 Web 前端並確認登入、註冊與管理者登入後的語音介面可顯示。
- [ ] 收到專屬 API Key 後，再啟動 Core API 與 Voice Agent 進行語音通話驗證。
