# 個人 AI 分身：三積木組裝說明書

這份說明書給完全不會寫程式的學生使用。你不需要修改三個原始積木；只要下載、組裝、填入自己的設定，最後把組裝結果放進自己的 GitHub repository。

## 你會拿到的三個 GitHub 專案

| 專案 | 像什麼 | 負責內容 | 不可放入 |
|---|---|---|---|
| `flying-eagle-web-kit` | 電話外殼 | 登入、通話按鈕、靜音、掛斷、逐字稿與主人後臺介面 | MiniMax、Soniox、OpenAI、LiveKit Secret |
| `flying-eagle-core-kit` | 門禁與檔案櫃 | Supabase Auth、Persona、Conversation、LiveKit 入場券、資料契約 | 瀏覽器可讀的 Service Role 或資料庫密碼 |
| `flying-eagle-voice-kit` | 聽覺、腦與嘴巴 | Soniox STT、OpenAI LLM、MiniMax TTS、台灣用語、斷句與破音字 | 前端 UI、學生密碼 |

三包必須使用相同課程版本。組裝工具會自動檢查，不相同就停止，避免接錯積木。

正式發課採用「每位學員一套獨立系統」：組裝後的 Web、Core、Voice、Supabase 與 LiveKit／Soniox／OpenAI／MiniMax Key 都不與其他學員共用。三包 GitHub 積木只提供 `.env.example`，老師提供的專屬 Key 由 Codex 寫入學員本機的 `.env`。

## 推薦操作方式：環境設定交給 Codex

你不需要理解或手動填寫整份 `.env`。完成三個積木的組裝後，請在組裝結果的根目錄開啟 Codex，讓 Codex 依序代辦：

1. Codex 執行 `cp .env.example .env`，建立只留在本機的環境變數檔案。
2. 你把老師分配給你的 LiveKit、Soniox、OpenAI、MiniMax 專屬 Key 與 MiniMax Voice ID 交給 Codex；不要把這些值貼到課程群組、作業截圖或 GitHub。
3. Codex 將外部服務設定寫入 `.env`，並產生至少 32 字元的 `VOICE_INTERNAL_TOKEN`；同一個值只供 Core API 與 Voice Agent 內部使用。
4. Codex 執行 `pnpm local:setup`，啟動並初始化本機 Supabase。
5. 系統自動把 Supabase URL、Publishable Key、Database URL、Storage Secret 與 Persona UUID 寫入 `.env`，建立本機 OWNER／VISITOR 帳號，並把 Voice ID 匯入 Persona 草稿。
6. Codex 啟動 Web、Core 與 Voice，執行自動測試，再完成一次登入、聲音試聽與語音對話驗收。

> `MINIMAX_VOICE_ID` 只能放在後端 `.env`，不得改成 `VITE_` 前端變數。學生不需要在管理後臺輸入 Voice ID；後臺「聲音試聽」只負責確認目前設定的聲音能否正常播放。

## 1. 建立課程工作資料夾

在終端機執行：

```bash
mkdir course-workspace
cd course-workspace
```

## 2. 分別下載三個 GitHub 專案

下載老師正式發布的三個積木：

```bash
git clone https://github.com/simon5168s5/flying-eagle-web-kit.git flying-eagle-web-kit
git clone https://github.com/simon5168s5/flying-eagle-core-kit.git flying-eagle-core-kit
git clone https://github.com/simon5168s5/flying-eagle-voice-kit.git flying-eagle-voice-kit
```

完成後，三個資料夾必須在同一層：

```text
course-workspace/
├── flying-eagle-web-kit/
├── flying-eagle-core-kit/
└── flying-eagle-voice-kit/
```

## 3. 一鍵組裝自己的專案

```bash
python3 flying-eagle-core-kit/assemble.py assemble \
  --web flying-eagle-web-kit \
  --core flying-eagle-core-kit \
  --voice flying-eagle-voice-kit \
  --output student-ai-avatar
```

看到 `組裝完成`，而且 `student-ai-avatar/ASSEMBLY_RECEIPT.md` 存在，代表三包版本與檔案接頭檢查通過。

如果顯示「輸出資料夾必須是空的」，請換一個全新的資料夾名稱。工具刻意不覆蓋你已經做過的作業。

## 4. 進入組裝結果並建立本機設定

```bash
cd student-ai-avatar
cp .env.example .env
```

建議由 Codex 代為執行這兩行。若 `.env` 已經存在，先請 Codex 唯讀檢查，不要直接覆蓋。

`.env` 像家門鑰匙，只留在自己的電腦或部署平台，不能貼到聊天、作業截圖或 GitHub。`.env.example` 只列欄位名稱，可以上傳。

先不要自行填寫 Supabase URL、Key、資料庫連線字串或 Persona UUID；下一步的一鍵初始化會從你的本機 Supabase 安全取得並寫入。

## 5. 安裝、啟動本機服務與建立帳號

執行 `pnpm local:setup` 前，先把老師提供的專屬服務設定交給 Codex。Codex 會填入 `.env`，包含 MiniMax Voice ID，並產生 `VOICE_INTERNAL_TOKEN`；學生不需要自行逐欄填寫。

```bash
pnpm install
pnpm exec supabase --version
pnpm local:setup
```

完成後會產生 `.local/student-credentials.json`，內含兩組只在你電腦使用的登入資料：

| 帳號 | 用途 |
|---|---|
| `owner` | 學員本人，管理人格、聲音、頭像、訪客與對話 |
| `visitor` | 測試一般訪客，只能進入前臺，不能讀取後臺 |

`.local/` 與 `.env` 都已被 Git 排除，不可貼到聊天或上傳 GitHub。本機 Supabase Studio 位於 `http://127.0.0.1:54323`。

前臺來訪者可以用電子信箱、密碼與確認密碼直接註冊；課程產品不發送 Email 驗證信。註冊後仍只有 VISITOR 權限，不會因此取得 OWNER 後臺權限。

再執行 `pnpm local:status` 查看 `Ports`。如果 Docker Desktop 顯示 `0.0.0.0`／`[::]`，代表同一區域網路可能連入；請勿在公共網路使用，保持防火牆開啟，練習結束後執行 `pnpm local:stop`。本機 Supabase 沒有 TLS、正式 rate limit 或正式憑證，不能直接對外服務。

## 6. 確認專屬服務設定並驗證

Codex 應已在執行 `pnpm local:setup` 前，將以下設定寫入你自己電腦上的 `.env`：

1. LiveKit URL、API Key 與 API Secret。
2. Soniox API Key。
3. OpenAI API Key；模型固定使用 `gpt-4.1-mini`。
4. MiniMax API Key；`MINIMAX_GROUP_ID` 保留為空白相容欄位。
5. 老師提供的 MiniMax Voice ID。

Codex 同時要產生至少 32 字元的 `VOICE_INTERNAL_TOKEN`，供 Core API 與 Voice Agent 互相驗證。學生不需要自己逐欄研究或手動填寫整份 `.env`。

`pnpm local:setup` 會將 `.env` 內的 `MINIMAX_VOICE_ID` 匯入 Persona 草稿。服務啟動後，登入 `/studio/voice` 播放試聽；確認聲音正確後，再發布 Persona。若老師日後更換 Voice ID，請 Codex 更新 `.env`、執行 `pnpm local:bootstrap` 重新匯入，再試聽並重新發布。

不可向同學複製自己的 Key，也不可用別人的 Supabase URL 或資料庫連線字串；這些值必須全部指向你自己的系統。

```bash
pnpm test
pnpm typecheck
python3 -m venv .venv
.venv/bin/python -m pip install -r apps/voice-agent/requirements.lock
.venv/bin/python -m pip install --no-deps -e apps/voice-agent
PYTHONPATH=apps/voice-agent/src .venv/bin/python -m unittest discover -s apps/voice-agent/tests -p 'test_*.py'
```

只有全部測試通過，才進入下一步。這像組好模型後先做通電測試，不要還沒確認就直接送上雲端。

## 7. 啟動 Web、Core 與 Voice Runtime

開三個終端視窗，都保持在 `student-ai-avatar` 根目錄。第一個執行 Web：

```bash
pnpm --filter @flying-eagle/web dev
```

第二個執行 Core：

```bash
pnpm --filter @flying-eagle/api dev
```

第三個執行 Voice：

```bash
.venv/bin/flying-eagle-voice-agent start
```

Core 與 Voice 都會自動往上層尋找根目錄 `.env`，但不會覆寫部署平台已設定的 Secret；Vite 也已設定讀取相同根目錄的公開 `VITE_` 欄位。OWNER 後臺網址是 `http://127.0.0.1:5173/studio`。登入後先完成 Persona，並到「聲音試聽」確認目前 Voice ID 可以正常播放，再發布第一版，前臺才可建立正式對話。

後臺會顯示曾登入前臺的訪客（即使對話數為 0）、已發布的人格版本、對話摘要與逐字稿。「複製到草稿」不會立即更換公開版本；「刪除紀錄」會連同逐字稿永久刪除，畫面會再次詢問確認。

## 8. 建立自己的 GitHub repository

1. 登入 GitHub。
2. 建立新的空白 repository，例如 `my-ai-avatar`。
3. 不要勾選 GitHub 自動建立 README、`.gitignore` 或 License，因為組裝結果已經有自己的檔案。
4. 複製 GitHub 顯示的 repository 網址。

## 9. 只在組裝結果建立 Git

三個老師積木保留各自的 Git 歷史；你的作業 Git 只能建立在 `student-ai-avatar`：

```bash
git init
git add .
git commit -m "建立：組裝個人 AI 分身課程積木"
git branch -M main
git remote add origin <你自己的 GitHub repository 網址>
git push -u origin main
```

組裝工具不會複製三個來源專案的 `.git`，因此你的 repository 不會出現巢狀 Git 或 submodule。

## 10. 上傳前安全檢查

```bash
git status
git ls-files | rg '(^|/)\.env($|\.)'
git diff --cached
```

預期結果：

- `.env` 不應出現在 `git status` 的待提交檔案。
- 第二行最多只看見 `.env.example`。
- Diff 不應出現 API Key、密碼、Token、Voice ID 真值。

若不確定，先停止 `git push`，請 Codex 檢查；不要先把 Secret 推上 GitHub 再刪，因為 Git 歷史仍可能保留。

## 常見問題

| 畫面或錯誤 | 代表什麼 | 處理方式 |
|---|---|---|
| `三個積木的課程版本不同` | 其中一包不是同一批教材 | 三包都切到老師指定的相同 Tag 後重組 |
| `不是有效的課程積木` | 路徑選錯或下載不完整 | 確認該資料夾內有 `KIT_MANIFEST.json` |
| `輸出資料夾必須是空的` | 工具偵測到既有作業 | 使用新的輸出名稱，不要刪除舊作業 |
| 登入成功但拿不到語音 Token | Auth 通過，但 Conversation 歸屬或額度沒通過 | 查看 Core API log 的拒絕 code |
| 後臺顯示不是管理者 | 登入的是 `visitor` 示範帳號 | 登出後改用 `.local/student-credentials.json` 的 `owner` 帳號 |
| 有逐字稿但沒聲音 | STT／LLM 正常，MiniMax 或 TTS 播放鏈異常 | 查看 Voice Agent 的 TTS health 與 timeout log |
| 能進房但 AI 沒進來 | LiveKit agent dispatch 名稱或部署不一致 | 比對 Core 與 Voice Kit 的 `LIVEKIT_AGENT_NAME` |

## 完成標準

- 三個積木版本一致且成功組裝。
- 所有本機測試通過。
- `.env` 未進入 Git。
- 訪客只能讀取自己的 Conversation。
- AI 主人只能管理自己 Tenant 的 Persona 與 Conversation。
- 後臺可查看登入帳號、版本紀錄、摘要與逐字稿，且刪除前會再次確認。
- 一次真實測試通話能登入、連線、說話、收到台灣正體逐字稿、聽到語音、靜音、掛斷並在後臺看到紀錄。
- 另一個超過本套上限的同時通話請求會被拒絕，掛斷後名額會正常釋放。
- Git 不包含 `.env`、`.local/`、`tmp/`、學員密碼或任何真實 Key。
