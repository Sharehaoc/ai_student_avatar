# Core API App

| 項目 | 說明 |
|---|---|
| 責任 | 作為 Auth、資料、admission、短效 LiveKit token、人格與逐字稿的唯一 server boundary。 |
| 不負責 | 不處理瀏覽器媒體、不在 request process 跑長時間語音 worker、不信任 client 傳入身份或 prompt。 |
| Coach 來源 | LiveKit token route、conversation routes、persona routes、instructor transcript access。 |
| 處理方式 | 概念重寫；不搬 ticket、subscription、billing 與 fail-open 邏輯。 |
| 輸入／輸出 | 輸入：Supabase JWT、`conversationId`、受驗證 CRUD payload；輸出：資料、admission decision、短效 room token。 |
| 依賴 | Hono 4.13.1、Supabase JWT/JWKS、Postgres.js 3.4.9、LiveKit Server SDK 2.17.0。 |
| 環境變數 | `DATABASE_URL`、`SUPABASE_URL`、`SUPABASE_SECRET_KEY`、`WEB_ORIGIN`、`LIVEKIT_URL`、LiveKit server keys、容量上限。 |
| 本機驗證 | `pnpm --filter @flying-eagle/api test && pnpm --filter @flying-eagle/api typecheck`。 |
| 已知限制 | 訪客通話、OWNER 管理、Storage、撥號咽喉與 Worker 回寫已完成本機 Supabase integration；正式雲端與真實 provider E2E 尚未完成。 |
| 可替換 provider | LiveKit server service、PostgreSQL rate-limit store 與 database repository 各自有介面。 |

## 已完成的撥號咽喉

`POST /conversations` 只接受 `{ personaId }`，而且只會為已發布、已有 active version、語音已啟用的 Persona 建立 server-side Snapshot；瀏覽器不能指定 Voice 或 Prompt。

`POST /voice/sessions/token` 固定順序：

1. 使用 Supabase asymmetric JWKS 驗證 access token 的簽章、issuer、audience 與 `role=authenticated`。
2. Body 僅接受 `{ conversationId }`，多一個 `voiceId` 或 `tenantId` 都回 400。
3. Postgres 查詢同時限制 `conversation.id`、`visitor_user_id` 與可連線狀態。
4. `reserve_voice_admission` 在資料庫鎖住 UsagePolicy，並以 transaction advisory lock 串行化跨 tenant 的 global concurrency／setup rate 計數。
5. 每次產生唯一房名，避免已存在 Room 忽略 token explicit dispatch。
6. 簽發 5 分鐘 LiveKit Token，`RoomConfiguration.agents` 明確指定 `LIVEKIT_AGENT_NAME`。

Supabase 密碼或 legacy JWT secret 不進 API；新專案採 asymmetric signing key 與 Publishable Key。API 只讀公開 JWKS 驗證使用者 JWT。

聲音試聽限流使用 PostgreSQL 每帳號一列的原子 fixed window，不會因 API 重啟或多 process 而歸零。每個 API 回應都有 `x-request-id`，伺服器輸出不含 Authorization、request body 或 Secret 的單行 JSON 紀錄。
