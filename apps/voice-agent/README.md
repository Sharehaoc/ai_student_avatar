# Voice Agent

| 項目 | 說明 |
|---|---|
| 責任 | 在 LiveKit worker 中串接 STT → LLM → TTS，並送出逐字稿、健康狀態與用量事件。 |
| 不負責 | 不處理瀏覽器登入、付款、教師 UI，也不把人格硬編碼在 agent。 |
| Coach 來源 | `voice_agent.py`、`minimax_tts.py`、`tts_segmenter.py` 與 worker 啟動流程。 |
| 處理方式 | Orchestrator/provider 邊界重寫；純文字 segmenter 直接擷取，TTS 文字清洗依 David 版概念重寫。 |
| 輸入／輸出 | 輸入：server-issued room metadata、audio、prompt snapshot；輸出：STT text、LLM response、TTS audio、usage/health events。 |
| 依賴 | Python 3.11+、LiveKit Agents 與 Soniox／OpenAI／Silero plugins 1.6.9、OpenAI SDK 2.54.0、MiniMax HTTP／WebSocket client 與 `OpenCC==1.4.1`。已固定 `aiohttp==3.14.3`、`python-dotenv==1.2.2`與 `json-repair==0.60.1`，避免已知漏洞版本。 |
| 環境變數 | LiveKit、Soniox、MiniMax、LLM secrets，只允許 worker process 讀取。 |
| 本機驗證 | `python3 -m unittest discover -s apps/voice-agent/tests -v` 與 `python3 -m compileall apps/voice-agent/src`。 |
| 已知限制 | Worker 與三個 provider adapter 的程式、SDK 組裝和 51 項測試已完成；Worker 已向真實 LiveKit Cloud 註冊，但瀏覽器麥克風到三個 provider 的完整 E2E 仍需完成。 |
| 可替換 provider | `STTProvider`、`LLMProvider`、`TTSProvider` protocol；orchestrator 不 import 具體 SDK。 |

## Provider 實作規則

1. 每個 adapter 自己處理 timeout、retry、錯誤分類與 health check。
2. 限流要有界線，不能用無限佇列把尖峰藏起來。
3. provider 原始錯誤需清洗後才可送回 client 或寫入 log。
4. 先用 fixture／mock 驗證契約，再使用 sandbox key 做最小真實連線。
5. MiniMax 分段沿用已測的純函式，但發音正規化必須以中立規則重寫。

## Runtime 已建立的連線

- LiveKit worker 以 explicit dispatch 指定 `LIVEKIT_AGENT_NAME`，嚴格核對 participant 與 job metadata。
- Worker 只用 `VOICE_INTERNAL_TOKEN` 回連 Core，載入 server-side Conversation Snapshot。
- Soniox 固定 `stt-rt-v4`、中英文 hints、language identification、speaker diarization 與 800ms endpoint。
- OpenAI model 必須由 `OPENAI_MODEL` 明確指定；課程範例固定使用 `gpt-4.1-mini`。
- MiniMax 使用官方國際版 `https://api.minimax.io`，依模型選 HTTP SSE 或 WebSocket，回傳 24kHz mono PCM，並以有界 retry／timeout 與 HTTP 節流處理。
- Silero VAD 使用 Coach 通用參數：安靜 1.2s、padding 0.3s、最短語音 0.3s、threshold 0.65；插話最短 1.0s。
- 逐字稿以 event ID 冪等回寫；結束後由 DB 時間計算秒數，不信任 Worker 自報。

## TTS 文字邊界

`voice_agent.tts.text_pipeline` 已包含：

- 簡體轉台灣正體、兒化與常見中國技術用語轉換。
- 思考標籤、模型捏造的使用者台詞、破折號與省略號清理。
- 電話、安心專線、金額、百分比、年份、台北 101、藥量與品牌念法。
- `長`、`還`、`調`、`誰`、`鋪` 等 MiniMax 多音字提示。
- PersonaVersion 專屬 `pronunciationFixes`。
- 與 Coach Tracy 相同的 324 個保守簡體字形；只送 TTS，不得寫回逐字稿。

本機安裝與驗證：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r apps/voice-agent/requirements.lock
.venv/bin/python -m pip install --no-deps -e apps/voice-agent
PYTHONPATH=apps/voice-agent/src .venv/bin/python -m unittest discover -s apps/voice-agent/tests -v
```

根目錄 `.env` 會在本機啟動時自動讀取，已存在的部署環境變數不會被覆寫。開發模式啟動：

```bash
.venv/bin/flying-eagle-voice-agent start
```

CI 與課堂正式安裝使用 `requirements.lock` 固定完整 transitive dependencies；更新 `pyproject.toml` 後必須在乾淨 Python 3.12 環境重新解析、測試並同步鎖檔。`websockets==15.0.1` 是目前已完成 MiniMax WebSocket 回歸驗證的版本，不隨意浮動。

完整連線差異請看 `docs/VOICE_PARITY_AUDIT.md`。

`OpenCC 1.4.1` 使用 Apache-2.0 授權。課程版使用 `s2twp` 做台灣正體與詞彙轉換，並以台灣用語回歸測試與 324 個 MiniMax 保守字形逐字比對鎖定既有輸出。
