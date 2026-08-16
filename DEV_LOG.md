# DEV LOG

## 2026-08-16 — Session 05：隔離個人 Voice Agent 派送

### 改動摘要
將本機 LiveKit Agent 名稱改為 Howard 專屬名稱，避免共用 LiveKit 專案中的不同學生 Worker 互相接走通話工作。將先前卡住的本機測試通話與入場名額標記為失敗並保留紀錄，再重新啟動 Core API 與 Voice Agent。

### 修改檔案
- `.env` — 將 `LIVEKIT_AGENT_NAME` 改為本機專屬名稱；此檔案不納入 Git。
- 本機 Supabase — 將 5 筆 `PENDING`／`CONNECTING` 測試通話及 2 筆占用中的 admission 標記為 `FAILED`，未刪除對話紀錄。
- `DEV_LOG.md` — 新增本次派送隔離與驗證紀錄。

### 驗證結果
- Core API 健康檢查回應 HTTP 200；8080、8081、8082 連接埠皆正常監聽。
- Voice Agent 已使用 Howard 專屬 Agent 名稱向 LiveKit 日本區完成註冊。
- 本機解碼測試確認 Core 產生的 Token 使用相同 Agent 名稱。
- 資料庫中未再存在 `PENDING`、`CONNECTING`、`ACTIVE` 通話或未過期的 `RESERVED`／`ACTIVE` admission。
- 瀏覽器重新載入後恢復顯示「開始語音對話」。
- `.env` 仍受 Git 排除規則保護，未將 API Key、密碼或 Token 加入版本控制。

### 尚未完成／未驗證
- 為避免未經確認使用麥克風及產生外部服務費用，尚未開始真實通話；STT、AI 與 TTS 完整流程仍待驗證。

### 下一步
- [ ] 使用者允許麥克風及外部服務測試費用後，開始一通短時間測試通話。

## 2026-08-16 — Session 04：開啟本機語音服務

### 改動摘要
開啟本機語音總開關，並設定最小的同時通話與建立通話速率上限，讓已運作的 Core API 與 Voice Agent 可提供語音對話入口。

### 修改檔案
- `.env` — 將本機語音服務設為開啟，同時通話與每分鐘建立通話上限皆設為 1；此檔案不納入 Git。
- `DEV_LOG.md` — 新增本次本機語音服務開啟與驗證紀錄。

### 驗證結果
- Core API 重新啟動後健康檢查回應 HTTP 200。
- Voice Agent 的本機 8081、8082 連接埠持續正常監聽。
- 瀏覽器重新載入對話頁後，「語音服務目前尚未開放」訊息已消失，並顯示「開始語音對話」按鈕。
- `.env` 仍受 Git 排除規則保護，未將 API Key、密碼或 Token 加入版本控制。

### 尚未完成／未驗證
- 尚未要求瀏覽器使用麥克風，也未開始真實語音通話，因此未驗證外部語音辨識、AI 回覆與語音合成流程。

### 下一步
- [ ] 使用者明確允許麥克風後，開始一通本機測試通話並驗證 STT、AI 與 TTS。

## 2026-08-16 — Session 03：啟動本機完整服務

### 改動摘要
建立專案專用 Python 環境並以鎖定檔安裝 Voice Agent 依賴。修正 LiveKit Silero 外掛在背景執行緒才載入，導致 Voice Agent 預熱失敗的問題。

### 修改檔案
- `.env` — 補齊課程提供的本機預設設定與內部 Token；此檔案不納入 Git。
- `apps/voice-agent/src/voice_agent/worker.py` — 在主執行緒載入 Silero 外掛，避免背景程序預熱時的外掛註冊錯誤。
- `DEV_LOG.md` — 新增本次服務啟動與修正紀錄。

### 驗證結果
- `pnpm install --frozen-lockfile` 已確認 Node.js 鎖定依賴。
- Core API 測試：50 項通過。
- Voice Agent 測試：51 項通過，且語法編譯檢查通過。
- 本機 Supabase：8 個容器皆正常執行；Web 與 Core API 健康檢查皆回應 HTTP 200。
- Voice Agent 已註冊 LiveKit，且本機 8081、8082 連接埠正常監聽。

### 尚未完成／未驗證
- 尚未要求瀏覽器使用麥克風，未進行真實語音通話驗收。

### 下一步
- [ ] 使用者允許麥克風後，驗證登入、通話、逐字稿與語音回覆流程。

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
