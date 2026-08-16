# DEV LOG

## 2026-08-16 — Session 09：提高本機語音輸出音量

### 改動摘要
依 Howard 的實聽回饋，將 MiniMax 本機語音輸出由 5 提高至 7。保留在最高 10 以下，以降低破音風險。

### 修改檔案
- `.env` — 將 `MINIMAX_TTS_VOLUME` 設為 7；此檔案受 Git 排除，不會提交。
- `DEV_LOG.md` — 記錄本機音量調整與後續驗證。

### 驗證結果
- Voice Agent 已重新啟動並確認讀取音量值 7。
- 8081、8082 連接埠正常監聽，並已向 Howard 專屬 LiveKit Agent 完成註冊。
- `.env` 仍受 Git 排除規則保護，未納入本次提交。

### 尚未完成／未驗證
- 尚未建立新的真實語音合成；仍需由 Howard 實聽確認音量與是否破音。

### 下一步
- [ ] Howard 重新連線後，以短句確認音量是否合適。

## 2026-08-16 — Session 08：釋放中斷通話名額並修正斷線收尾

### 改動摘要
修正 Voice Agent 在使用者尚未加入房間時就斷線，因例外發生前尚未讀取派送資料而無法通知 Core API 結束通話的問題。Worker 現在會在等待使用者前先驗證並保留派送資料，讓失敗收尾可以將通話標記為失敗並釋放名額。

### 修改檔案
- `apps/voice-agent/src/voice_agent/worker.py` — 先讀取可信的派送資料，再連線與等待使用者，讓早期斷線也能執行既有失敗收尾流程。
- `apps/voice-agent/tests/test_worker_helpers.py` — 新增早期可取得派送資料的回歸測試。
- `DEV_LOG.md` — 記錄本次原因、修正與驗證。
- 本機 Supabase — 使用既有 `finalize_voice_session(..., true)` 流程結束 1 筆已中斷但仍為 `ACTIVE` 的測試通話；保留對話與訊息，未刪除資料。

### 驗證結果
- 回歸測試先確認修正前無法取得早期派送資料，修正後通過。
- Voice Agent 全部 54 項測試通過，Python 語法編譯檢查通過。
- 資料庫確認進行中的 admission 與 conversation 皆為 0。
- Voice Agent 已重新啟動，8081、8082 連接埠正常監聽，並向 Howard 專屬 LiveKit Agent 完成註冊。

### 尚未完成／未驗證
- 尚未再次由瀏覽器建立真實通話，以避免在修正後未經 Howard 操作就要求麥克風與使用外部語音服務。
- 目前瀏覽器分頁保留舊的中斷狀態，需要重新整理後才會顯示新的可連線狀態。

### 下一步
- [ ] Howard 重新整理前端頁面後，確認顯示「開始語音對話」。

## 2026-08-16 — Session 07：調整本機語音輸出音量

### 改動摘要
新增 MiniMax 語音輸出音量設定，並依 Howard 指定將本機值設為 5。設定會同時套用至 HTTP 與 WebSocket 語音合成，避免只在其中一種傳輸方式生效。

### 修改檔案
- `apps/voice-agent/src/voice_agent/runtime_config.py` — 讀取並驗證 `MINIMAX_TTS_VOLUME` 必須大於 0 且不超過 10。
- `apps/voice-agent/src/voice_agent/providers/minimax_protocol.py` — 將設定的音量寫入 MiniMax 請求。
- `apps/voice-agent/src/voice_agent/providers/minimax_provider.py` — 將音量帶入 HTTP 與 WebSocket 語音合成。
- `apps/voice-agent/src/voice_agent/worker.py`、`apps/voice-agent/src/voice_agent/preview_server.py` — 將本機設定交給語音提供者。
- `apps/voice-agent/tests/*` — 新增音量範圍與傳遞的回歸測試。
- `.env.example` — 記錄安全的預設值與有效範圍。
- `.env` — 本機值設為 5；此檔案受 Git 排除，不會提交。

### 驗證結果
- 修正前的回歸測試已確認失敗，證實音量設定原本不會傳到語音服務。
- Voice Agent 全部 53 項測試通過，Python 語法編譯檢查通過。
- 已重新啟動 Voice Agent；8081、8082 連接埠正常監聽，且已向 Howard 專屬 LiveKit Agent 完成註冊。
- 已讀取本機設定並確認 `MINIMAX_TTS_VOLUME` 為 5。
- `.env` 仍受 Git 排除規則保護，未納入本次提交。

### 尚未完成／未驗證
- 尚未發起新的真實語音合成，因此仍需由 Howard 實聽確認音量與是否破音。

### 下一步
- [ ] Howard 重新連線後說一句短句，確認音量與音質。

## 2026-08-16 — Session 06：修正 Voice Agent 外掛主程序註冊

### 改動摘要
修正 Soniox 與 OpenAI LiveKit 外掛第一次在背景工作程序載入，造成「Plugins must be registered on the main thread」並讓通話在 Agent 就緒前中斷的問題。三個 LiveKit 外掛現在都會在 Voice Agent 主程序註冊。

### 修改檔案
- `apps/voice-agent/src/voice_agent/worker.py` — 在主程序載入 Soniox、OpenAI 與 Silero 外掛。
- `apps/voice-agent/tests/test_worker_plugin_registration.py` — 新增回歸測試，確保三個需要註冊的 LiveKit 外掛皆在主程序匯入。
- `DEV_LOG.md` — 新增本次外掛註冊修正與驗證紀錄。

### 驗證結果
- 新回歸測試先確認修正前失敗，修正後通過。
- Voice Agent 全部 52 項測試通過，且 Python 語法編譯檢查通過。
- 重啟後 Voice Agent 已在主程序註冊 OpenAI、Silero、Soniox 外掛，並以 Howard 專屬名稱向 LiveKit 日本區完成註冊。
- Core API 與 Voice Agent 本機連接埠維持正常運作。

### 尚未完成／未驗證
- 尚未在修正後啟動真實通話，以避免未經確認要求麥克風權限及使用外部語音服務；完整 STT、AI 與 TTS 流程仍待實測。

### 下一步
- [ ] 使用者在瀏覽器按下「重新連線」並允許麥克風後，驗證 Voice Agent 就緒與語音對話流程。

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
