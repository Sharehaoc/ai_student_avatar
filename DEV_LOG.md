# DEV LOG

## 2026-08-23 — Session 21：正式頭像上傳相容性修正

### 改動摘要
正式端到端驗收發現管理員頭像上傳在 Render 的 Node 24 執行環境被 Supabase Storage 拒絕，但使用同一組服務端憑證與同一張圖片的原始位元組可成功寫入。將 Storage 上傳改為先將 HTTP multipart 檔案轉成原始位元組後送出，避免 Node 24 的檔案串流相容問題。

### 修改檔案
- `apps/api/src/storage/supabase-avatar-storage.ts` — 以穩定的原始位元組傳送 Storage 上傳內容。
- `DEV_LOG.md` — 記錄正式驗收根因與修正。

### 驗證結果
- API TypeScript 型別檢查通過。
- API Vitest：50 項測試通過。
- 尚待 Render 部署此修正後，重測管理員頭像上傳、Persona 發布與公開前臺同步。

### 尚未完成／未驗證
- 尚未完成真實麥克風、STT、AI、TTS 的正式端到端通話。

### 下一步
- [ ] 部署頭像上傳修正並重新驗收 Storage、管理頁及公開前臺。

## 2026-08-23 — Session 20：正式語音政策初始化修正

### 改動摘要
端到端驗收發現正式環境沒有任何 `usage_policies` 資料列，導致已發布 Persona 無法建立語音對話。將正式 OWNER／Persona 初始化流程補齊與本機初始化相同的缺省語音政策建立步驟；若政策已存在，不會覆寫既有設定。

### 修改檔案
- `apps/api/src/scripts/production-owner-persona-bootstrap.ts` — 新租戶初始化時建立預設語音使用政策。
- `DEV_LOG.md` — 記錄根因、修正與驗證結果。

### 驗證結果
- API TypeScript 型別檢查通過。
- API Vitest：50 項測試通過。
- 尚待執行正式初始化 workflow，確認政策建立與實際語音通話。

### 尚未完成／未驗證
- 尚未完成真實麥克風、STT、AI、TTS 的正式端到端通話。

### 下一步
- [ ] 推送修正並手動執行正式 OWNER／Persona 初始化 workflow，再重新驗收語音連線。

## 2026-08-23 — Session 19：正式 OWNER 與 Persona 初始化流程

### 改動摘要
新增只在 GitHub `production` 環境執行的 OWNER 與 Persona 初始化流程。流程使用 Supabase Auth 建立或更新管理員、建立租戶與 Persona 草稿，並發布一個 Persona 版本；敏感資料只從 GitHub Environment Secret 讀取。

### 修改檔案
- `apps/api/src/scripts/production-owner-persona-bootstrap.ts` — 正式環境初始化程式。
- `apps/api/package.json` — 新增對應的執行指令。
- `.github/workflows/initialize-production-owner-persona.yml` — 受 production Environment 保護的手動 workflow。

### 驗證結果
- API TypeScript 型別檢查通過。
- API Vitest：50 項測試通過。
- GitHub production 的初始化 workflow 已成功；Supabase 中已確認 1 個 OWNER、1 個 Persona 草稿與已發布版本。
- Render Web 已以公開 Persona ID 重新部署；Render Core 已改用 Supabase Session Pooler，健康檢查回應 HTTP 200。
- 已使用正式 Web 實際登入 OWNER、儲存草稿並發布 Persona v2。
- 三個語音限制皆設為 5，Core 的正式語音總開關已設為 true。
- GitHub 的 `DEPLOYMENT_ENABLED` 已設為 true；正式 LiveKit 部署 workflow 成功，唯一的 Agent 已回到 running。

### 尚未完成／未驗證
- 尚未進行會實際使用麥克風與外部 STT／AI／TTS 額度的端對端語音通話。

### 下一步
- [ ] 取得使用者同意後，以短時間真實通話驗證麥克風、STT、AI、TTS 與逐字稿完整流程。

## 2026-08-23 — Session 18：初始化 LiveKit Production Agent

### 改動摘要
以本機 `.env` 的最新 LiveKit Project 憑證同步 GitHub Repository Secrets，補齊 Voice Agent 必要的既有 MiniMax Group ID，並執行 LiveKit Production Agent 初始化。初始化流程已建立唯一的 Production Agent；由於 Repository 設定不允許 GitHub Actions 自動建立 Pull Request，改由已登入的 GitHub 帳戶手動建立同一個 `livekit.toml` PR，通過檢查後合併。

### 修改檔案
- `apps/voice-agent/livekit.toml` — 由 LiveKit 初始化流程產生並經 PR 合併；僅含部署設定，不含 Secret。
- `DEV_LOG.md` — 記錄 LiveKit 初始化、PR 驗證與目前狀態。

### 驗證結果
- GitHub 已具備四個 LiveKit 相關 Secrets；實際值未輸出或提交。
- `livekit.toml` 已確認不含 Secret，且其子網域與目前 LiveKit Project 相符。
- PR 的 Python Voice Agent 與 TypeScript／Web Build 檢查皆通過後合併。
- LiveKit Cloud 顯示唯一 Agent 的 Production 部署狀態為 `running`。
- `DEPLOYMENT_ENABLED=false` 維持不變；`LIVEKIT_AGENT_NAME` 維持為 `flying-eagle-voice-agent`。

### 尚未完成／未驗證
- GitHub 初始化 workflow 的最終結果仍標示失敗，原因是 Repository 不允許 GitHub Actions 自動建立 PR；Agent 建立本身已成功，且 PR 已手動完成。
- 尚未執行真實語音通話的端對端測試。

### 下一步
- [ ] 在不啟用 `DEPLOYMENT_ENABLED` 的前提下，執行一次受控的正式語音通話測試。

## 2026-08-23 — Session 17：修正 Render 靜態網站 Blueprint 方案欄位

### 改動摘要
移除 `ai-avatar-web` 的 `plan: free`。Render 將此服務辨識為 `runtime: static` 的靜態網站，不接受 Web Service 的 `plan` 欄位；靜態網站仍可免費部署。

### 修改檔案
- `render.yaml` — 移除 `ai-avatar-web` 的不相容方案欄位。
- `DEV_LOG.md` — 記錄 Blueprint 預覽頁實際回報的設定錯誤與修正。

### 驗證結果
- Render Blueprint 預覽頁實際回報：`services[1].plan no such plan free for service type web`。
- 已依 Render 官方靜態網站 Blueprint 範例保留 `type: web`、`runtime: static`、`buildCommand` 與 `staticPublishPath`，且不指定 `plan`。

### 尚未完成／未驗證
- 修正尚待推送至 GitHub，並由 Render 預覽頁重新驗證。
- Core 與 Web 尚未建立，環境變數、公開網址與健康檢查仍待後續部署。

### 下一步
- [ ] 推送本次修正後，重新開啟 Render Blueprint 預覽並完成第一次建立。

## 2026-08-22 — Session 16：準備 Render Blueprint 首次部署

### 改動摘要
確認 Render Blueprint 只定義 `ai-avatar-core` 與 `ai-avatar-web`，不建立 Render Postgres；將靜態網站服務明確固定為 Free 方案。Core 保留 Render 的動態 `PORT`、`API_HOST=0.0.0.0` 與 `/health` 檢查；Web 保留 `apps/web/dist` 發布路徑與 SPA rewrite。

### 修改檔案
- `render.yaml` — 為 `ai-avatar-web` 明確加入 `plan: free`。
- `DEV_LOG.md` — 記錄首次部署前已驗證與待補齊項目。

### 驗證結果
- `render.yaml` 僅定義 Core 與 Web 兩項服務，未定義 `databases`。
- 兩項服務皆設定 `autoDeployTrigger: checksPass`，且來源分支為 `main`。
- 上一版 `main` 的 GitHub Checks 已通過；本次 Blueprint 提交待推送後重新驗證。

### 尚未完成／未驗證
- Render 尚未建立服務；需待 GitHub Checks 通過並安全補齊所有 `sync: false` 設定後才能首次部署。
- Supabase 與 MiniMax 的部分部署設定尚未存在本機 `.env`，不可用空值建立服務。
- 尚未初始化 LiveKit Production Agent，`DEPLOYMENT_ENABLED` 維持未建立。

### 下一步
- [ ] 等待本次 main Checks 通過，補齊 Render Secret 後建立 Blueprint 並完成 Core／Web 互相回填與健康檢查。

## 2026-08-22 — Session 15：連接獨立 LiveKit Cloud Project

### 改動摘要
確認 Howard 帳號下的獨立 LiveKit Cloud Project 後，建立專供本專案伺服器使用的 API Key。LiveKit URL、API Key 與 API Secret 僅透過本機剪貼簿輸入，經格式清理後寫入受 Git 忽略的 `.env`，並同步至 GitHub Repository Secrets。未初始化 Production Agent，亦未建立或啟用 `DEPLOYMENT_ENABLED`。

### 修改檔案
- `.env` — 更新 `LIVEKIT_URL`、`LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET`，並統一 `LIVEKIT_AGENT_NAME=flying-eagle-voice-agent`；此檔案受 Git 排除。
- `DEV_LOG.md` — 記錄不含任何 LiveKit 值的連線與驗證結果。

### 驗證結果
- LiveKit Cloud Project 已確認屬於 Howard 已登入帳號；Project 名稱未作為 Agent 派工名稱使用。
- 本機已確認 URL 為 `wss://`、API Key 與 API Secret 均非空，且未保留最外層引號或前後空白。
- GitHub Repository Secrets 已建立：`LIVEKIT_URL`、`LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET`。
- 本機 `.env`、Render Blueprint 與 GitHub Repository Variable 均使用 `flying-eagle-voice-agent` 作為 `LIVEKIT_AGENT_NAME`。
- `.env` 已確認受 Git 忽略；操作後剪貼簿已清除。

### 尚未完成／未驗證
- 尚未初始化或部署 LiveKit Production Agent，也未執行正式雲端語音通話。
- `DEPLOYMENT_ENABLED` 仍未建立，部署 workflow 會維持安全略過。

### 下一步
- [ ] 在 Render 與其他必要雲端資源設定完成後，再取得明確同意執行 LiveKit Production Agent 初始化與端對端語音驗證。

## 2026-08-22 — Session 14：完成 Supabase 資料庫連線本機設定

### 改動摘要
重設 Supabase 雲端資料庫管理密碼，並僅在受 Git 忽略保護的本機 `.env` 建立資料庫連線設定。密碼與連線字串的實際值未寫入 Git、DEV LOG 或任何終端輸出。

### 修改檔案
- `.env` — 新增 `SUPABASE_DB_PASSWORD` 與 `DATABASE_URL`，並加入資料庫管理密碼用途註解；此檔案受 Git 排除。
- `DEV_LOG.md` — 記錄不含機密值的設定與驗證結果。

### 驗證結果
- 已由 Supabase Dashboard 確認 Direct Connection 的主機、連接埠、資料庫與使用者格式；本機 `DATABASE_URL` 格式符合該專案。
- 本機已確認 `SUPABASE_DB_PASSWORD` 與 `DATABASE_URL` 存在，且 `.env` 未被 Git 追蹤、受 `.gitignore` 排除。
- 已清除作業期間使用的 Windows 剪貼簿密碼。

### 尚未完成／未驗證
- Supabase Direct Connection 預設採 IPv6；若部署環境僅支援 IPv4，需改用 Supabase 提供的 pooler 或另行啟用 IPv4 方案。
- Site URL 與 Redirect URLs 仍待 Render Web 網址產生後回填。

### 下一步
- [ ] 完成 Render Web／Core API 設定後，回填 Supabase Auth URL Configuration 並執行真實登入流程驗證。

## 2026-08-22 — Session 13：建立雲端 Supabase Auth 與資料保護基礎

### 改動摘要
建立 Howard 專屬的免費 Supabase 雲端專案，並依序套用專案既有的六份資料庫 migration。此設定建立 Supabase Auth 所需的使用者關聯、OWNER／VISITOR 角色資料模型、受保護的後臺資料結構，以及語音試聽限流。

### 修改檔案
- `DEV_LOG.md` — 記錄雲端 Supabase 專案與資料庫安全設定。

### 驗證結果
- 雲端 Supabase 專案已建立並顯示健康狀態。
- 6 份 migration 均已套用完成。
- 已確認 11 張 `public` 資料表皆啟用 RLS。
- Browser Data API 對應資料表權限均被撤銷；資料必須透過已驗證的 Core API 存取。
- 已執行 Supabase 安全掃描；「RLS 已啟用但沒有 policy」的提示符合本專案撤銷 Data API 權限、只允許後端服務角色存取的設計。

### 尚未完成／未驗證
- 尚未在雲端建立 OWNER 測試帳號、Persona 初始資料或執行真實登入。
- 雲端 Core API 尚未部署；Supabase 資料庫管理密碼與連線字串僅寫入受 Git 忽略的本機 `.env`，未寫入 Git。
- 尚未設定正式網站網址與 Auth Redirect URL；需在 Render 網址確定後設定，避免登入回跳到錯誤網站。

### 下一步
- [ ] 部署 Core API 後，於部署平台的 Secret Manager 設定 Supabase 連線資訊，再做 OWNER／VISITOR 登入與路由隔離驗證。

## 2026-08-22 — Session 12：安裝 Deployment Kit v1.0.3

### 改動摘要
在 `feature/deployment-kit` 分支安裝 Deployment Kit v1.0.3，加入可重現的 Render 與 LiveKit 部署設定。第一次部署尚未設定完成，因此不建立 `DEPLOYMENT_ENABLED`，正式 LiveKit 部署會安全略過。

### 修改檔案
- `.github/workflows/verify.yml` — 改為呼叫固定 v1.0.3 commit 的共用驗證 workflow。
- `.github/workflows/initialize-livekit.yml` — 新增手動初始化 LiveKit Production Agent workflow。
- `.github/workflows/deploy-livekit.yml` — 新增受 `DEPLOYMENT_ENABLED` 保護的正式部署 workflow。
- `render.yaml` — 新增 Core API 與 Web 的 Render Blueprint；所有秘密欄位均要求於平台設定。
- `apps/voice-agent/Dockerfile`、`apps/voice-agent/.dockerignore` — 新增 Voice Agent 容器建置設定。
- `DEV_LOG.md` — 記錄本次安裝與驗證。

### 驗證結果
- Deployment Kit v1.0.3 固定使用 commit `d7cc155ae472df3fdd3cd73f6095d2edf04183ef`，沒有使用 `@main`。
- 已確認 `verify`、`initialize-livekit`、`deploy-livekit`、`render.yaml`、Voice Agent Dockerfile 與 `.dockerignore` 均存在。
- 已確認 GitHub Repository Variable 尚未建立 `DEPLOYMENT_ENABLED`，部署 workflow 預設安全略過。
- `pnpm verify` 通過：TypeScript、Core API、Web Build 與既有測試均成功。
- Voice Agent 暫存驗證環境通過：依賴檢查、54 項單元測試與 Python 編譯檢查均成功。

### 尚未完成／未驗證
- 尚未建立任何正式雲端資源、設定 GitHub Secrets、設定 Render 或執行 LiveKit 初始化。
- 未執行正式部署；需在平台設定與驗收完成後才可啟用 `DEPLOYMENT_ENABLED=true`。

### 下一步
- [ ] 檢查並合併 Deployment Kit Pull Request 後，再進行 Supabase、LiveKit 與 Render 的平台設定。

## 2026-08-22 — Session 11：建立陪伴聊天型 AI 語音分身專案報告

### 改動摘要
依 Howard 與一般使用者溝通的需求，建立 10 頁 PowerPoint 專案報告。內容聚焦在陪伴聊天型 AI 語音分身的使用情境、目前基礎、隱私界線、優化順序與下一步。

### 修改檔案
- `AI語音分身_陪伴聊天者_專案報告.pptx` — 新增 10 頁美化簡報。
- `DEV_LOG.md` — 記錄本次簡報製作與檢查結果。

### 驗證結果
- 已逐頁檢查 10 張投影片的圖片輸出。
- 投影片溢出檢查通過，未發現超出畫面的內容。

### 尚未完成／未驗證
- 簡報中的「真人語音流程待驗證」為專案目前已知狀態，尚未在本次工作中進行麥克風或外部語音服務測試。

### 下一步
- [ ] 取得 Howard 同意後，完成 1～2 分鐘真人語音對話驗證，再依實測回饋更新簡報。

## 2026-08-16 — Session 10：更新本機 LiveKit 連線設定

### 改動摘要
依 Howard 提供的新 LiveKit 設定，更新本機 Voice Agent 與 Core API 共用的連線環境變數，並重啟兩個服務使設定生效。

### 修改檔案
- `.env` — 更新 LiveKit URL、API Key 與 API Secret；此檔案受 Git 排除，不會提交。
- `DEV_LOG.md` — 記錄設定變更與驗證，不記錄任何 Key 值。

### 驗證結果
- 確認更新前沒有進行中的通話或占用名額。
- Core API 健康檢查回應 HTTP 200。
- Voice Agent 已向新的 LiveKit 端點完成註冊，8081、8082 連接埠正常監聽。
- `.env` 已確認受 Git 排除規則保護。

### 尚未完成／未驗證
- 未建立新的真實語音通話，因此尚未驗證新 LiveKit 專案中的完整瀏覽器連線與語音流程。
- Windows 尚未安裝系統 Node.js；Core API 暫以專案已使用的內建 Node 執行環境維持啟動。

### 下一步
- [ ] Howard 重新整理網頁後，重新連線確認新的 LiveKit 設定可建立通話。

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
