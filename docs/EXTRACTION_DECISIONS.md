# Coach Tracy 抽取決策

盤點基準：Coach Tracy 分支 `codex/safe-tts-waveform`，Commit `23f4f94ea7d974206748abeedbfe11b5c29a70bd`。

## 可直接抽取

| 來源 | 抽取內容 | 必要調整 | 驗證 |
|---|---|---|---|
| `tracy-voice-engine/agent/tts_segmenter.py` | 無網路、無 Secret 的 TTS 串流安全分句 | 改 package path 與加入來源註記 | Python 單元測試：不受 LLM chunk 大小影響、不切斷數字與引號 |
| `web/src/lib/conversation-transcript.mjs` | 只保留 USER / ASSISTANT 與內部標記清理概念 | 待 Message API 實作時改成中性角色名 | 待實作 |

## 抽概念重寫

| 來源 | 保留概念 | 不能直接搬的原因 |
|---|---|---|
| `web/src/lib/voice/useLivekitCall.js` | Room 連線、單一麥克風、靜音、掛斷、字幕、cleanup、併發防重 | 869 行中混有容量輪詢、帳務、HolyGrail preparation、Tracy data event 與波形 |
| `web/src/lib/voice/FanVoiceSessionProvider.jsx` | 單一語音 Session Provider | 名稱、事件與 React 生命週期綁定 Tracy UI |
| `web/src/app/api/livekit/token/route.js` | 後端授權、Room 命名、explicit dispatch、短效 Token | 混有對話票、帳務時鐘、Tracy 容量演算與 fail-open 安全閥 |
| `tracy-voice-engine/agent/minimax_tts.py` | MiniMax HTTP/WS 音訊串流、PCM、voice clone、重試經驗 | 依賴 LiveKit 版本、全域 Semaphore、Tracy 發音表、多實驗 runtime；需先完成每 Tenant 限速 |
| `tracy-voice-engine/agent/voice_agent.py` | Soniox → LLM → MiniMax 的 AgentSession 組裝模式與每 Turn 儲存 | 2,838 行混合 HolyGrail、Fal、舊記憶庫、帳務、故障補救與 Tracy 詞彙 |
| `web/prisma/schema.prisma` | User、Persona、Conversation、Message、Prompt Snapshot 關聯 | 882 行包含金流、票券、發票、推薦碼、申訴、記憶與舊資料模型 |
| `web/src/lib/instructor-transcript-access.mjs` | 後端授權後才讀取完整 Transcript、Conversation 與 User 雙重綁定 | 原模型介面定義只適用單一 Tracy Instructor |
| `web/src/lib/persona.js` 與 persona route | Prompt Snapshot 與後臺修改概念 | Tracy Prompt 寫死，API 只存滑桿，沒有 PersonaVersion |
| `tracy-voice-engine/agent/voice_text_filters.py` | 台灣口語、兒化與標點清洗 | 改為中立課程規則並補常見台灣技術用語 |
| `tracy-voice-engine/agent/tts_text_normalizer.py` | 數字、金額、年份、多音字與保守字形 | 真人姓名改為 PersonaVersion 發音表；其餘概念重寫並測試 |

## 完全排除

- HolyGrail2 與所有 runtime conversation ID、snapshot、memory brief 流程。
- Fal.ai LLM 與 embedding。
- Deepgram 舊 STT 流程。
- 金流、訂閱、對話票、LINE Pay、藍新、發票、推薦碼、申訴。
- 素材管理、發布管理、Tracy 專屬場景、品牌文案、人格與真人姓名專屬發音修正。
- 新舊雙資料庫、`turns` 與 Web Message 雙寫相容層。
- 知識圖譜、向量記憶、承諾追蹤、複雜記憶萃取與背景 Job 群。
- Coach Tracy 的 `exports/`、`output/`、`.env`、build output 與 cache。

## 第一批已建立積木

| 目標 | 處理方式 | 檔案 |
|---|---|---|
| 資料契約 | 全新實作 | `packages/contracts/src/` |
| Persona / PersonaVersion | 依 Prompt Snapshot 概念重寫 | `packages/contracts/src/persona.ts` |
| Conversation / Message | 依 Coach Tracy Prisma 關係簡化重寫 | `packages/contracts/src/conversation.ts`, `transcript.ts` |
| LiveKit Client 核心 | 依 `useLivekitCall.js` 的併發防重概念重寫 | `apps/web/src/features/voice/livekit-voice-session.ts` |
| Provider Adapters | 全新介面 | `apps/voice-agent/src/voice_agent/providers/base.py` |
| Session Orchestrator | 依 Voice Agent 組裝概念重寫 | `apps/voice-agent/src/voice_agent/orchestrator.py` |
| MiniMax TTS 分句 | 直接抽取純邏輯 | `apps/voice-agent/src/voice_agent/tts/segmenter.py` |
| TTS 文字清洗與發音 | 依 David 版概念重寫 | `apps/voice-agent/src/voice_agent/tts/text_pipeline.py` |
