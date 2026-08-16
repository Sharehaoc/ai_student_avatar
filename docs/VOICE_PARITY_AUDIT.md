# Coach Tracy David 版語音一致性稽核

稽核基準：唯讀來源 `COACH_Tracy(David版)`，分支 `codex/safe-tts-waveform`，commit `23f4f94ea7d974206748abeedbfe11b5c29a70bd`。

## 結論

課程版已把 Coach 中可沿用的通用語音路徑接進實際 Worker，包含 LiveKit、Soniox、OpenAI、MiniMax HTTP／WebSocket、VAD、插話、開場白、安全斷句、台灣用語、簡繁、多音字、串流清洗、逐字稿與通話結束計費。

「程式已對齊」不等於「外部環境已驗證」。目前已在獨立本機 Supabase 驗證 Auth、Conversation 與資料庫併發，Voice Worker 也已向真實 LiveKit Cloud 註冊；但瀏覽器麥克風到 Soniox／OpenAI／MiniMax 的單套完整通話仍須用學員專屬 Key 實測。

| 區塊 | Coach Tracy David 版 | 課程版目前狀態 | 一致性 |
|---|---|---|---|
| 安全斷句 | `tts_segmenter.py`，避免依 LLM chunk 大小亂切，保護數字與結尾符號 | 純邏輯已擷取並進入 MiniMax HTTP／WS streaming path | 已對齊 |
| 台灣口語 | 兒化詞、破折號、重複停頓 | 概念重寫，並補常見台灣技術用語 | 已對齊並補強 |
| 簡體轉台灣正體 | `zhconv==1.4.3` | 改用 Apache-2.0 的 `OpenCC==1.4.1` `s2twp`，逐字稿與 TTS 朗讀稿分流 | 輸出契約已對齊，授權風險已排除 |
| 思考文字清理 | `strip_thinking_transform` | chunk-independent streaming transform，可處理 tag 被分到多個 chunk | 已對齊並補強 |
| LLM 腳本污染 | 遇到 `用戶:`／`User:`／`使用者:` 後截斷 | streaming transform 以相同邏輯截斷，不依 chunk 邊界 | 已對齊 |
| Persona 專屬發音表 | config／persona 的 `pronunciation_fixes` | PersonaVersion 不可變版本、Conversation Snapshot、Soniox terms 與 MiniMax 朗讀提示 | 已對齊並改為租戶隔離 |
| 數字、電話、金額、年份與多音字 | `tts_text_normalizer.py` | 已建立相同類型的正規化與回歸測試 | 核心案例已對齊 |
| MiniMax 保守簡體字形 | 324 個字，只送 TTS | 逐字比對 324 個字差異 0，不寫回 DB | 已對齊 |
| MiniMax HTTP／WebSocket | PCM、timeout、retry、WS task lifecycle | 24kHz mono PCM、SSE arbitrary chunks／CRLF、WS lifecycle、空音訊重試、有界 retry／throttle | 程式已對齊；sandbox 待驗 |
| Web LiveKit SDK | Room events、字幕、agent state、readiness、mic、AudioContext 波形、audio cleanup | React、Supabase token provider、75s readiness、字幕、agent state、短暫斷線提示、自動恢復、學生／AI 實際音軌 RMS 與平滑、mic／mute 與 cleanup | 連線程式已對齊；本機 Auth 已驗，真實麥克風通話 E2E 待驗 |
| Web 通話視覺 | 深森林綠全螢幕、Persona 圓形頭像、粒子場、能量帶、頂部狀態、三顆底部控制、浮動字幕與掛斷確認 | 沿用實際 `fan/call/page.jsx` 的交互層級，學生版改為純黑背景與斜線頭像佔位符，並保留 Auth、Conversation、LiveKit 與安全存檔邏輯 | 桌機、手機、純黑背景、無 Tracy 圖片請求、錯誤態、確認對話框與鍵盤焦點已實機驗證；三顆通話控制待真實 Voice Worker E2E |
| LiveKit Token／explicit dispatch | Server 驗證、RoomConfiguration、agent name、metadata | Supabase JWT、ownership、atomic admission、唯一房名、5 分鐘 token、server-derived metadata | 程式已對齊；Cloud E2E 待驗 |
| Python Worker／AgentSession | 進房、等 participant、VAD、事件、開場白、shutdown | 嚴格 metadata 核對、Core Snapshot、prewarm VAD、事件、watchdog、開場白、finalization | 程式已對齊；真實 dispatch 待驗 |
| Soniox STT | `stt-rt-v4`、中英文、關鍵詞、diarization、800ms endpoint | 使用官方 LiveKit Soniox plugin 1.6.9，設定已離線建構驗證 | 設定已對齊；真實 socket 待驗 |
| OpenAI LLM | Coach 為 HolyGrail／Fal，課程明確改 OpenAI | LiveKit OpenAI plugin 1.6.9，model 必須顯式設定 | 課程規格替代，不應和 Coach provider 位元一樣 |
| VAD 與插話 | Silero 1.2／0.3／0.3／0.65，interruption 1.0s | 相同參數已放進 prewarm 與 fallback load | 已對齊 |
| Turn handling | Coach 含 HolyGrail／Fal 專屬 partial fallback、short-turn 補救與 dead-air 經驗法則 | 使用 LiveKit AgentSession 1.6.9 原生 endpointing／partial／final／interruption | 不盲搬 provider-specific hack；必須透過 OpenAI staging 故障測試才能決定是否加補救 |
| 逐字稿與秒數 | 每 turn 持久化、結束處理 | final item 以 event ID 冪等回寫，DB row lock 排 sequence，DB 時間計費且重送不重複扣款 | 核心 lifecycle 已對齊；摘要／主人畫面待做 |
| 斷線與錯誤收尾 | disconnect、session error、shutdown、掛斷確認 | Web 顯示重連狀態；掛斷／通話中登出先確認，離房後以 JWT＋本人 ownership 輪詢終態，逾時不假裝保存；Worker flush writes、關 provider／Core、DB 釋放 admission | 程式已對齊；斷網與真實保存確認 E2E 待驗 |
| 延遲與容量 | STT／LLM／TTS metrics 與長期調校 | metrics 已寫入無文字的結構化 log，admission fail-closed | 可觀測性程式已建；每套獨立系統的單通延遲與超額拒絕待實測 |

## TTS 實際處理順序

```text
LLM streaming text
  → 跨 chunk 移除思考標籤
  → 截斷模型捫造的使用者台詞
  → 安全斷句（保護數字與結尾符號）
  → 簡體／中國地區詞轉台灣正體
  → 台灣口語與標點清洗
  → PersonaVersion 專屬發音修正
  → 電話／金額／年份／多音字 MiniMax 朗讀提示
  → 保守簡體字形（只送 MiniMax）
  → 24kHz mono PCM 音訊
```

資料庫與 UI 只保存台灣正體逐字稿，不會把 `成掌`、`環錢`、`软体` 這類只為發音服務的朗讀提示寫回資料庫。

## 刻意不一樣的地方

| 差異 | 原因 |
|---|---|
| OpenAI 取代 HolyGrail／Fal | 這是課程明確技術方向，不是遺漏。 |
| 不搬 Tracy 姓名與發音替換 | 真人姓名必須放在該學生的 PersonaVersion，不可成為全班預設。 |
| 不搬 HolyGrail／Fal 專屬 short-turn hack | 供應商與 SDK 已改變，先用 AgentSession 原生機制；staging 有真實死氣證據時再加 OpenAI 專屬補救。 |
| `websockets==15.0.1` 不跟 Coach 的 16.0 | 這是課程版 MiniMax WS path 已完成回歸驗證並納入完整 Python 鎖檔的版本；未經 E2E 不浮動。 |
| 不搬付款、對話票、Tracy 品牌事件與複雜記憶 | 全部超出課程第一版產品邊界。 |

## 下一個不可跳過的驗證閘門

1. 將已在本機通過的 migration 套用到一套學員雲端 Supabase，驗證 Conversation transaction 與 OWNER／VISITOR 隔離。
2. 用該學員的專屬 keys 實際啟動 Core、Voice Worker 與 Browser，打通一通完整 E2E。
3. 測試插話、短句、無標點長文、簡體輸出、provider timeout、斷網、重連與掛斷收尾。
4. 驗證第二個同時請求會依該套設定被 admission 拒絕，並確認掛斷後名額釋放。

## 套件授權結論

課程版已移除 GPLv2+ 的 `zhconv==1.4.3`，改為 Apache-2.0 的 `OpenCC==1.4.1`。替換後已用 21 個 TTS 文字邊界測試與 324 個 MiniMax 保守簡體字形逐字比對驗證；既有字形差異為 0。
