# 學員 AI 分身：API Key 與本機設定清單

## 學生必須準備的外部服務

| 服務 | 必要設定 | 用途 | 保密等級 |
|---|---|---|---|
| Supabase | `VITE_SUPABASE_URL` / `SUPABASE_URL` | 登入、JWT 驗證與資料庫 API 網址 | 公開設定 |
| Supabase | `VITE_SUPABASE_PUBLISHABLE_KEY` | 瀏覽器使用 Supabase Auth | 可公開，但仍需 RLS |
| Supabase Postgres | `DATABASE_URL` | Core API 從伺服器連資料庫 | Secret |
| Supabase Storage Admin | `SUPABASE_SECRET_KEY` | Core API 代 OWNER 上傳頭像 | Secret，僅 API server |
| LiveKit Cloud | `LIVEKIT_URL` | 即時語音房間網址 | 伺服器設定 |
| LiveKit Cloud | `LIVEKIT_API_KEY` | Core API 簽發短效房間 Token | Secret，只放伺服器 |
| LiveKit Cloud | `LIVEKIT_API_SECRET` | 與 API Key 成對簽署 Token | 高度 Secret |
| Soniox | `SONIOX_API_KEY` | 把學員語音轉成文字（STT） | Secret |
| OpenAI | `OPENAI_API_KEY` | 產生 AI 回答（LLM） | Secret |
| MiniMax | `MINIMAX_API_KEY` | 把 AI 文字轉成語音（TTS） | Secret |
| MiniMax | `MINIMAX_GROUP_ID` | 只供舊帳號／舊介面相容 | 目前 T2A 可留空，不分發給學生 |

`DIRECT_URL` 只供 migration 或管理工具直連資料庫；目前 Web、Core API 與 Voice Worker 的本機 runtime 都沒有讀取它。Core 使用新的 `SUPABASE_SECRET_KEY` 代上傳 Storage 頭像，不使用 legacy `SUPABASE_SERVICE_ROLE_KEY`，兩者都絕對不可放進學生前端。

## 不是 API Key，但仍需設定

| 設定 | 來源 | 說明 |
|---|---|---|
| `VITE_API_URL` | 自己的 Core API 網址 | 本機預設 `http://localhost:8080` |
| `VITE_PERSONA_ID` | 資料庫 `personas.id` | 公開 UUID，決定前端進入哪個 AI 分身 |
| `VITE_PERSONA_AVATAR_URL` | 尚未發布時的前端 fallback | 選填；正常頭像由 OWNER 後臺上傳並透過公開 Persona API 連動，留空顯示斜線佔位符 |
| `MINIMAX_VOICE_ID` | 老師提供的 MiniMax 複製聲音結果 | 由 Codex 寫入後端 `.env`；`local:setup` 匯入 Persona 草稿，發布後固定在 Persona Version 的 `voice_snapshot.voiceId` |
| `OPENAI_MODEL` | 課程指定的模型名稱 | 固定填寫 `gpt-4.1-mini` |
| `LIVEKIT_AGENT_NAME` | 課程專案設定 | Core 簽 Token 與 Voice Worker 必須完全一致 |
| `VOICE_INTERNAL_TOKEN` | 學生本機或部署平台自行產生 | Core 與 Voice Worker 之間的內部密碼，至少 32 字元 |
| `CORE_API_URL` | 自己的 Core API 網址 | Voice Worker 回連 Core；本機可用 `http://127.0.0.1:8080` |
| `WEB_ORIGIN` | 自己的前端網址 | CORS 限制；本機預設 `http://localhost:5173` |
| `PORT` | Core API 設定 | 預設 `8080` |
| `MINIMAX_API_HOST` | MiniMax 官方國際版網址 | 預設 `https://api.minimax.io` |
| `MINIMAX_TTS_RUNTIME` | 課程 runtime 選擇 | `auto`、`http` 或 `ws` |
| `MINIMAX_TTS_WS_URL` | MiniMax 官方 WebSocket 網址 | 預設 `wss://api.minimax.io/ws/v1/t2a_v2` |
| `MINIMAX_TTS_SIMPLIFIED_GLYPH` | 語音清洗開關 | 預設 `true`，只影響送給 TTS 的字形 |
| `SONIOX_ENABLE_SPEAKER_DIARIZATION` | STT 設定 | 預設 `true` |
| `VOICE_POWER_ON` | 老師／維運開關 | 沒有完成 Key 與負載驗證前保持 `false` |
| `VOICE_GLOBAL_CONCURRENCY_LIMIT` | 課程單套系統設定 | 語音開啟時必須是正整數；開課前以超額拒絕測試確認生效 |
| `VOICE_SETUP_RATE_LIMIT` | 課程單套系統設定 | 每分鐘開房上限，語音開啟時必須是正整數 |

## Coach Tracy 唯讀參考結果

| 項目 | Coach 是否有 | 本機處理 |
|---|---|---|
| LiveKit URL / API Key / API Secret / Agent Name | 有 | 可暫時只在本機程序行程使用，不寫進 Git |
| Soniox API Key / speaker diarization | 有 | 可暫時只在本機程序行程使用 |
| MiniMax API Key / 舊版 Group ID / API Host / runtime / WS URL | 有 | 課程只沿用 API Key；Group ID 保留空白 |
| MiniMax Tracy Voice ID | 有 | 只能當本機測試 Persona 的臨時 Voice ID，不是 API Key |
| Supabase URL / publishable key / Postgres URL | 沒有本套件可直接複用的值 | 使用獨立的本機 Supabase，不連 Coach 正式資料庫 |
| OpenAI API Key | Coach 專案不是學生 Key 來源 | 每位學生使用老師分配的專屬 Key，只放自己的 `.env`；不可從 Coach 複製或分發 |

Coach 的 Google OAuth、付款、郵件、FAL／HolyGrail、正式 Postgres 與其他業務 Secret 不屬於「學員 AI 分身」的必要設定，不複製、不分發。

## 給學生的安全規則

1. GitHub 只上傳 `.env.example`，永遠不上傳 `.env`。
2. `VITE_` 開頭的值會進入瀏覽器，只能放公開 URL、publishable key、Persona ID 和公開頭像路徑。
3. LiveKit secret、Soniox、OpenAI、MiniMax、Postgres 連線字串與內部 Token 只能放伺服器或部署平台的 Secret Manager。
4. 老師分配給每位學員的 Key 必須互不相同，不得在多套學員系統之間複製共用。
5. 機密值不得放進課程 Markdown、截圖、對話記錄或 log。
