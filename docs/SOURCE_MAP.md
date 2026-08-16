# Coach 來源對照表

本表是課程專案的可追溯清單。`直接擷取`只允許低耦合、可獨立測試的純邏輯；其餘以概念重寫為主，避免把 Tracy 業務規則、計費與舊架構一起搬入。

| Coach 來源 | 課程版目標 | 處理方式 | 移除／隔離內容 | 驗證方式 |
|---|---|---|---|---|
| `web/src/lib/voice/useLivekitCall.js`、`audio-level.js` | `livekit-voice-session.ts`、`livekit-room-adapter.ts`、`browser-audio-analysis.ts`、`audio-level.ts`、`voice-token-provider.ts` | 概念重寫 | HolyGrail 預熱、Tracy 事件、計費、容量輪詢、頁面狀態耦合 | Vitest：啟動去重、錯房拒絕、Auth header、readiness、字幕、重連、實際音軌 RMS／平滑、mic/mute 與 listener cleanup |
| `web/src/lib/voice/FanVoiceSessionProvider.jsx` | `apps/web/src/App.tsx` 與 `voice-ui-state.ts` | 概念重寫 | FAN 命名、Tracy 專用狀態與視覺品牌 | Vitest：partial／final 字幕；Playwright：登入與通話畫面桌機／手機視覺驗收 |
| `web/src/app/fan/call/page.jsx`、`web/public/img/tracy-ai-avatar.png` | `apps/web/src/App.tsx`、`styles.css` | 移植通話介面結構；保留課程版連線邏輯 | 計費、剩餘分鐘、Tracy 版號徽章、專屬 canvas provider 狀態與 Tracy 頭像資產；學生版預設為純黑背景與斜線頭像佔位符 | TypeScript／Vitest；Playwright 桌機 1200×728、手機 390×844、預設佔位符、頭像 URL 設定解析、背景色與無 Tracy 圖片請求 |
| `web/src/app/api/livekit/token/route.js` | `apps/api/src/app.ts`、`voice/livekit-token-issuer.ts`、database admission | 概念重寫 | ticket、訂閱、entitlement、舊容量算法、客戶端 metadata 信任 | Vitest：未登入、payload 竄改、ownership、quota 與 token grant／唯一房名 |
| `web/src/lib/livekit-room.js` | `apps/api/src/voice/livekit-token-issuer.ts` | 概念重寫 | 專案專屬 room naming 與 metadata | JWT claims 單元測試已完成；LiveKit sandbox 整合待驗 |
| `web/src/lib/voice-capacity.js` | `packages/contracts/src/usage-limit.ts` 與未來 admission service | 契約重寫 | fail-open 行為、未量測的每 vCPU 房間數 | Vitest：允許／拒絕狀態一致性；後續壓測校準 |
| `tracy-voice-engine/agent/minimax_tts.py` | `providers/minimax_provider.py`、`minimax_protocol.py` | 介面與 lifecycle 概念重寫 | Tracy 發音字典、無界 retry、網頁與帳務狀態 | Python：HTTP SSE 任意 chunk、CRLF、HTTP／WS model 選擇、真實 SDK 離線組裝；provider sandbox 待驗 |
| `tracy-voice-engine/agent/tts_segmenter.py` | `apps/voice-agent/src/voice_agent/tts/segmenter.py` | 直接擷取純邏輯並標註來源 | 無品牌內容；只保留文字分段 | Python 單元測試：標點與最大長度分段 |
| `tracy-voice-engine/agent/tts_text_normalizer.py` | `apps/voice-agent/src/voice_agent/tts/text_pipeline.py` | 概念重寫 | Tracy 真人姓名；其餘改為共用規則與 PersonaVersion 專屬修音 | Python 測試：電話、專線、金額、百分比、年份、101、多音字、字形 |
| `tracy-voice-engine/agent/voice_text_filters.py` | `apps/voice-agent/src/voice_agent/tts/text_pipeline.py` | 概念重寫 | Tracy 命名；加入台灣技術用語的保守轉換 | Python 測試：兒化、中國技術用語、標點與腳本污染 |
| `tracy-voice-engine/agent/voice_agent.py` | `orchestrator.py`、`worker.py`、三個 provider adapters | 架構概念重寫 | HolyGrail、Fal、Tracy 人格、複雜記憶與帳務 | Python：metadata 防竄改、Core Snapshot、逐字稿、狀態、provider 離線組裝與 worker helper 測試 |
| `tracy-voice-engine/agent/main.py` | `worker.py` 與 `__main__.py` | 概念重寫 | Coach 部署路徑與環境假設 | LiveKit `WorkerOptions`、prewarm VAD 與 CLI 建構已離線驗證；真實 dispatch 待驗 |
| `web/src/app/api/persona/**` | API 內部 Persona 模組與 `PersonaVersion` | 資料模型概念重寫 | Tracy 固定人格、既有角色權限與品牌文案 | Zod schema 測試；後續 DB/RLS 測試 |
| `web/src/components/**/persona*` | 未來學生人格設定 UI | 不直接搬移 | Coach 產品資訊架構、視覺品牌與欄位耦合 | 後續 UI 驗收與可用性測試 |
| `voice-agent` 內硬編碼 persona/system prompt | `PersonaVersion.systemPrompt` 與 `Conversation.promptSnapshot` | 概念重寫 | Tracy 名字、語氣、課程內容與隱藏提示 | Vitest：快照版本必須與 conversation 綁定 |
| `prisma/schema.prisma` 的 User／Persona／Conversation／Message | `supabase/migrations/20260813183634_initial_course_schema.sql` 等 6 個 migration | 欄位語意重寫 | ticket、subscription、invoice、appeal、referral、雙資料庫相容層 | Schema/RLS 結構測試、獨立本機 Supabase migration 與 OWNER／VISITOR 跨帳號整合已完成 |
| conversation 建立與 reservation routes | `POST /conversations`、`PostgresConversationRepository.createForUser` | 流程概念重寫 | 票券扣點、舊 reservation、客戶端 Voice／Prompt 與 fail-open | Vitest：Auth、UUID、strict payload、missing Persona；真實 DB transaction 與已發布 active Persona 條件已驗證 |
| `api/fan/conversations/[id]/end/route.js`、`conversation-finalize.js` | `GET /conversations/:id/status`、Worker finalization、Web 保存確認對話框 | 流程概念重寫 | 票券結算、sendBeacon、Tracy 記憶工作與瀏覽器直接主導終態 | Vitest：JWT、ownership、終態輪詢、短暫網路失敗與逾時不誤報；真實離房 E2E 待驗 |
| transcript 儲存流程 | `TranscriptEvent`、`ConversationMessage` 契約與未來 persistence service | 契約重寫 | Coach 專用事件、評分與抽取流程 | Zod schema 測試；後續冪等寫入測試 |
| instructor transcript access | 未來教師查閱 API | 權限概念重寫 | FAN 角色命名、產品專屬顯示規則 | 後續 instructor/student 權限矩陣與 RLS 測試 |
| conversation transcript export script | 未來課程診斷／匯出工具 | 延後重寫 | Coach 欄位與輸出格式 | 後續 fixture 驗證，不接 production secrets |
| memory、knowledge graph、vector、background extraction | 第一版 conversation summary + optional profile | 不搬移複雜架構 | 向量搜尋、知識圖譜、背景工作與多階段抽取 | 第一版先做摘要契約與資料隔離；成效證明後再擴充 |
| HolyGrail2、Fal、Deepgram、payments、billing、invoice、referral、appeal、materials | 無 | 明確排除 | 全部 | 以目錄與依賴掃描確認未進入課程版 |
| `exports/`、`output/` | 無 | 明確排除 | 未追蹤產物 | 來源 repo `git status` 基線複查 |

## 使用規則

1. 新增任何從 Coach 取出的功能前，先補一列，再動程式碼。
2. 若來源項目同時包含通用邏輯與產品邏輯，預設選擇「概念重寫」。
3. 若要直接擷取，必須同時具備來源註記、獨立測試、無 Tracy 品牌、無計費／權限耦合。
4. 未列出驗證方法的模組，不得標示為完成。
