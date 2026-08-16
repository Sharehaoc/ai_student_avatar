# Database Package

| 項目 | 說明 |
|---|---|
| 責任 | 管理 Supabase Postgres schema、migration、RLS、repository 與交易邊界。 |
| 不負責 | 不放 UI、不產生 LiveKit token、不持有 provider business logic。 |
| Coach 來源 | `prisma/schema.prisma` 的核心 User/Persona/Conversation/Message 關係。 |
| 處理方式 | 從零重寫最小 schema；不帶 legacy DB、billing、tickets 與複雜記憶表。 |
| 輸入／輸出 | 輸入：已授權 repository commands；輸出：contracts 對應 records。 |
| 依賴 | Supabase Postgres、migration tooling；API 透過 repository 使用。 |
| 環境變數 | Migration/CI 使用 `DIRECT_URL`；runtime API 使用 `DATABASE_URL`。 |
| 本機驗證 | `pnpm --filter @flying-eagle/database test && pnpm --filter @flying-eagle/database typecheck`。 |
| 已知限制 | 六個 migration、OWNER／VISITOR 隔離、發布、頭像、admission、preview rate limit 與跨帳號整合已在獨立本機 Supabase 驗證；正式雲端套用仍需備份與部署驗證。 |
| 可替換 provider | repository interface 隔離 Supabase/Postgres client；Auth/RLS 語意仍需重新實作。 |

正式 migration 的單一來源位於根目錄 `supabase/migrations/`，第一版已包含 `tenants`、`profiles`、`tenant_memberships`、`personas`、`persona_versions`、`usage_policies`、`conversations`、`messages`、`voice_admissions`。

瀏覽器不直接查業務資料：所有表都啟用 RLS 並撤銷 `anon`／`authenticated` grants，API 使用參數化 SQL且仍需以已驗證 user ID 做業務授權。這是 deny-by-default，不代表只靠高權限資料庫連線就可以省略 API 權限檢查。

`reserve_voice_admission` 把檢查與保留名額放在同一個資料庫 transaction 內，避免兩個請求同時看到「還有一格」後都放行。正式資料庫套 migration 前仍須備份、review SQL，並使用 Supabase migration 工具在開發 branch 先驗證。

`append_voice_message`、`activate_voice_session` 與 `finalize_voice_session` 分別負責逐字稿冪等寫入、通話開始與通話結束計費。Sequence 與通話秒數都由資料庫 lock 內產生，不信任 Worker 自報數字。
