# 模組契約

## 邊界總覽

| 模組 | 接收 | 輸出 | 可以依賴 | 不可以依賴 |
|---|---|---|---|---|
| Web | 使用者操作、API 回應、LiveKit browser events | `conversationId` token 請求、麥克風控制、逐字稿 UI | `@flying-eagle/contracts`、瀏覽器 LiveKit adapter | Supabase service role、MiniMax／Soniox 金鑰、資料庫直寫 |
| API | Supabase JWT、`personaId`、`conversationId`、管理端請求 | Conversation、admission 結果、短效 LiveKit token、資料 CRUD | contracts、database、LiveKit server SDK、rate limiter | 瀏覽器狀態、Python provider 內部類別 |
| Voice Agent | LiveKit room metadata、音訊、server-side prompt snapshot | STT 事件、LLM token、TTS 音訊、session usage | provider protocols、LiveKit Agents、API/server credentials | 使用者傳入的 system prompt、Web bundle secrets |
| Contracts | 中立資料 | Zod schema 與 TypeScript types | Zod | app runtime、SDK、資料庫 client |
| Database | API 內部 repository 呼叫 | 受 RLS／交易保護的資料 | Supabase Postgres、migration tooling | UI 元件、provider SDK |

## 1. Conversation

`ConversationRecord` 是一次對話的不可混淆身份，至少固定：

- `tenantId`、`userId`、`personaVersionId`
- `promptSnapshot`（含 `pronunciationFixes`）與 `voiceSnapshot`
- 建立、開始、結束時間
- `summary` 與 refinement 版本

規則：對話開始後，不因人格後續編輯而改寫既有快照；這像寄出合約後保留當時版本，不能讓日後修改回頭改變歷史內容。

## 2. Persona 與 PersonaVersion

| 物件 | 責任 | 可否修改歷史 |
|---|---|---|
| Persona | 穩定身份、擁有者、顯示名稱與發布狀態 | 可修改顯示資訊與發布狀態 |
| PersonaVersion | 一次發布的人格、system prompt、聲音與 LLM 設定 | 不可原地覆寫；新內容建立新版本 |

`pronunciationFixes` 屬於 PersonaVersion，最多 100 組。這像每副眼鏡各自有度數：一個 Voice ID 的姓名或破音修正不能變成所有學生共用的全域規則。Conversation 建立時必須把這張表一起寫入 Prompt Snapshot。

第一版不建立公開 prompt 市集，也不允許學生跨 tenant 讀取別人的 PersonaVersion。

## 3. Voice session admission

Browser 送出的唯一業務欄位是：

```json
{ "conversationId": "uuid" }
```

API 必須自行由登入 JWT 與資料庫還原使用者、tenant、persona、prompt、voice 與額度。拒絕回應使用 `UsageLimitDecision` 的固定 code；不得讓客戶端自行帶 `userId`、`systemPrompt`、provider key 或可篡改額度。

## 4. Provider adapters

Python 端固定三個 provider protocol：

- `STTProvider.create(context)`
- `LLMProvider.create(context)`
- `TTSProvider.create(context)`
- 每個 provider 另有 `health()`，回傳同一種 `ProviderHealth`

Orchestrator 只依賴 protocol，不直接 import Soniox、MiniMax 或某一個 LLM SDK。替換服務商時，像更換同規格插頭，不必重拉整間房子的電線。

TTS adapter 在送字給供應商前，必須經 `prepare_tts_input_text` → `SafeTTSStreamSegmenter` → `normalize_minimax_tts_segment`。朗讀提示不得寫回 Message 或 Transcript。

## 5. Transcript

`TranscriptEvent` 是即時事件，`ConversationMessage` 是持久化結果。伺服器必須：

1. 以 server-side session identity 補上 conversation 與 user 關聯。
2. 對重複事件做冪等處理。
3. 不把 provider 原始錯誤、金鑰或完整 prompt 寫進使用者可見訊息。
4. instructor 讀取必須另做角色授權與 tenant 限制，不能只靠知道 conversation ID。

## 6. 設定優先序

設定解析順序固定為：

1. 平台安全上限與禁用項目。
2. tenant／課程管理員允許的 provider 設定。
3. PersonaVersion 快照。
4. Conversation 個別安全覆寫。

下層不得關閉上層安全限制。

## 目前仍未實作或未驗證

- Persona 草稿／發布／版本還原／頭像、登入訪客／對話／逐字稿／刪除 OWNER API 已建立並通過本機整合；整個帳號刪除與資料保留期限政策尚未定義。
- Python worker、LiveKit browser adapter、server token／explicit dispatch 與 Soniox／OpenAI／MiniMax adapters 已完成程式及離線測試，但尚未做真實 E2E。
- 通話正常結束時會以第一則真實 USER 訊息建立「本機擷取式摘要」，不產生未出現於對話的內容；多主題與行動項目的 LLM 式摘要尚未經真實 OpenAI Key 驗證。
- 正式雲端部署與真實 Provider 通話 E2E 尚未驗證。發課模式已確認為每位學員獨立 runtime、Supabase 與專屬 Key，不建 Course Token gateway。

六個 migration、JWT verifier、Conversation ownership、OWNER tenant 隔離、atomic admission 與 token issuer 已在獨立本機 Supabase 驗證；尚未套用正式雲端部署，因此不能標示為 production 已驗證。
