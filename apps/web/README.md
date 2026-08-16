# Web App

| 項目 | 說明 |
|---|---|
| 責任 | 提供學生操作介面、請求 API token、管理瀏覽器 LiveKit room 與麥克風狀態。 |
| 不負責 | 不驗證最終授權、不直連資料庫、不持有 provider keys、不自行決定 prompt。 |
| Coach 來源 | `web/src/lib/voice/useLivekitCall.js`、`FanVoiceSessionProvider.jsx` 的通用語音流程。 |
| 處理方式 | 概念重寫；以 SDK-independent `LiveKitVoiceSession` 包住真實 Browser LiveKit adapter，不搬 React/Coach 產品狀態。 |
| 輸入／輸出 | 輸入：使用者點擊、`conversationId`、LiveKit events；輸出：token request、mic/mute/disconnect、UI state。 |
| 依賴 | `@flying-eagle/contracts`、`livekit-client` 2.21.0、`@supabase/supabase-js` 2.112.3。 |
| 環境變數 | 只允許 `VITE_API_URL`、Supabase URL／Publishable Key 與公開 Persona ID；不允許 service role 或 provider secrets。 |
| 本機驗證 | 根目錄執行 `pnpm --filter @flying-eagle/web test`、`pnpm --filter @flying-eagle/web typecheck` 與 `pnpm --filter @flying-eagle/web build`。 |
| 已知限制 | React 登入、OWNER 後臺、公開 Persona、手機路由與 LiveKit 失敗重試已用本機真實瀏覽器驗證；真實麥克風與 provider 完整 E2E 尚未完成。 |
| 可替換 provider | Browser media transport 透過 `LiveKitRoomAdapter` 替換；STT/LLM/TTS 不屬於 Web。 |

## 已建立的安全界線

- Browser token payload 嚴格限制為 `{ conversationId }`。
- Conversation payload 嚴格限制為 `{ personaId }`；Persona 名稱、Prompt、Voice 與發音表都由 Core 決定。
- 同時重複呼叫 `start()` 時，共用同一個啟動 promise，避免重複取 token、進房與開麥克風。
- 麥克風發布失敗會斷開半連線 Room 並清除狀態，下一次開始可重新取 token、進房與發布麥克風。
- 先在使用者點擊鏈啟用瀏覽器音訊，再取 Token、進 Room，最長等待 Voice Agent 75 秒後才開麥克風。
- 接收 `lk.agent.state`、字幕、Active Speakers、連線與斷線事件。
- 遠端 audio track 統一 attach；track unsubscribe／disconnect 時 detach 並移除 DOM。
- Token response 的 `conversationId` 必須和請求相同，避免錯房。
- disconnect 後移除所有 Room listener 與本機 session 狀態；伺服器仍需負責 reservation 的最終釋放。
