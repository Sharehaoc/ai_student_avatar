# 安全與 Secrets 基線

## 核心原則

1. 瀏覽器 bundle 只允許公開設定；任何 service role、provider key、LiveKit secret 都只能存在伺服器或平台 secret manager。
2. Auth 負責「你是誰」，RLS／授權規則負責「你能看什麼」，兩者缺一不可。
3. Token、登入、AI、TTS、STT、逐字稿匯出與高成本查詢都需要 rate limit。
4. admission、授權、額度與 provider key 取得失敗時採 fail-closed；不能因依賴服務故障就放行。
5. 正式資料的大量修改、刪除與不可逆 migration 必須先備份、提供回滾方法並取得明確同意。

## Secret 分類

| Secret | 所在端 | 禁止出現位置 | 建議輪替 |
|---|---|---|---|
| `DATABASE_URL` | API only | Web、log、錯誤回應、教材截圖 | 洩漏立即輪替 |
| `SUPABASE_SECRET_KEY` | API only | Web、`VITE_` 變數、log、教材截圖 | 洩漏立即輪替 |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | API／Voice Agent | Web、room metadata、逐字稿 | 定期與人員異動時 |
| `SONIOX_API_KEY` | Voice Agent | Web、API 回應、provider 原始錯誤 | 定期與異常帳單時 |
| `MINIMAX_API_KEY` | Voice Agent | Web、逐字稿、client events | 定期與異常帳單時 |
| `OPENAI_API_KEY` | Voice Agent | prompt、回應內容、瀏覽器 | 定期與異常帳單時 |

`.env.example` 只能提供空白欄位名稱，不放任何真實值或看似可用的假 key。

正式發課時，每位學員都有獨立的系統與 Provider Key。三個 GitHub 積木與學員自己的 repository 只放 `.env.example`；真值由學員寫入本機 `.env` 或部署平台 Secret Manager。

## Supabase 基線

- 使用 Supabase Auth 驗證 JWT，不自行開發密碼儲存流程。
- Core API 以伺服器專用 `DATABASE_URL` 存取 Postgres，並使用 `SUPABASE_SECRET_KEY` 代 OWNER 上傳頭像；兩者都只能存在 server 環境，所有 OWNER 操作仍必須先驗證 JWT 與 tenant membership。
- 每張使用者資料表明確啟用 RLS，至少以 `auth.uid()`、`tenant_id`、角色關係限制讀寫。
- service role 只能由 API server 使用，且 server 仍要先做業務授權，不把它當成跳過權限檢查的捷徑。
- 新表是否暴露至 Data API、SQL grants 與 RLS 是不同層，migration 必須逐項明確設定與測試。
- 測試至少包含：A 看不到 B 的 Persona、Conversation、Message；學生不能使用 instructor route；匿名者不能取得 LiveKit token。

參考：[Supabase Auth](https://supabase.com/docs/guides/auth)、[Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)、[新表 Data API 暴露預設值變更](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)。

## 語音與 AI 端點

| 風險 | 必做控制 |
|---|---|
| 任意人燒 provider 額度 | JWT、conversation ownership、quota、rate limit、短效 token |
| 客戶端竄改 prompt／人格 | 僅接受 conversation ID，伺服器載入 prompt snapshot |
| 同一 session 重複開啟 | 客戶端啟動去重 + server admission reservation |
| provider 突發流量 | 有界佇列、timeout、circuit breaker、可觀測的拒絕碼 |
| prompt injection 取得秘密 | secrets 不放 prompt；工具權限白名單；不把 server errors 回傳模型 |
| 逐字稿含個資 | 最小保存、明確用途、tenant 隔離、匯出稽核、刪除流程 |
| 成本失控 | 每人／tenant／provider 限額，並記錄實際用量而非只記成功連線 |

## 日誌規則

可以記錄：request ID、conversation ID、tenant ID、provider、延遲、狀態碼、匿名化用量。

禁止記錄：API key、JWT、service role key、完整 system prompt、完整個資逐字稿、provider 原始 request headers。

## 上線前安全閘門

- [ ] secrets scan 無真實金鑰。
- [ ] Auth、RLS、API 業務授權皆有跨使用者負向測試。
- [ ] token/admission/AI/provider endpoints 有 rate limit。
- [ ] production migration 有備份與回滾說明。
- [ ] staging 完成 SAST、SCA、secret scanning；必要時再做 DAST。
- [ ] 每套學員系統完成一通真實 E2E，並驗證超過設定上限時會 fail-closed。
- [ ] 已確認不同學員的 Key、Supabase 與部署目標沒有互相混用。
