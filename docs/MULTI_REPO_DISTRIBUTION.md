# 三個 GitHub 積木的發佈架構

## 決策

老師端保留目前 monorepo 作為唯一母版；學生拿到的三個 GitHub repository 由母版自動匯出，不直接人工維護三份重複程式。

每位學員組裝後部署自己的完整 runtime 與 Supabase，老師並分別提供獨立 Provider Key。積木、匯出目錄與學員 GitHub 只能含 `.env.example`，不帶任何 `.env`、`.local/`或 `tmp/` 內容。

| 層級 | Repository | 責任 | 誰修改 |
|---|---|---|---|
| 老師端母版 | `飛鷹課程_AI分身` | 契約、三個 App、測試、文件與版本來源 | 課程維護者 |
| 學生積木 1 | `flying-eagle-web-kit` | 瀏覽器 UI、登入 Session、LiveKit Client | 課程發版產生；學生原則上不直接改 |
| 學生積木 2 | `flying-eagle-core-kit` | Auth、資料、Persona、Conversation、Token、組裝工具 | 課程發版產生；學生原則上不直接改 |
| 學生積木 3 | `flying-eagle-voice-kit` | Python Voice Runtime 與 STT／LLM／TTS | 課程發版產生；學生原則上不直接改 |
| 學生作品 | 學生自訂名稱 | 三包組裝後的完整專案與學生個人設定 | 學生與 Codex |

正式 GitHub repositories：

- `https://github.com/simon5168s5/flying-eagle-web-kit`
- `https://github.com/simon5168s5/flying-eagle-core-kit`
- `https://github.com/simon5168s5/flying-eagle-voice-kit`

## 為什麼不使用 Git submodule

Git submodule 會讓學生面對巢狀 Git、指定 commit、遺漏更新與 push 權限等額外概念。對零程式基礎課程，成本大於收益。

組裝工具採用「驗證 manifest → 複製允許內容 → 產生收據」：

1. 驗證三包身份與課程版本相同。
2. 只按 manifest 的 mount 清單組裝。
3. 永遠排除 `.git`、`.env`、`node_modules`、`.venv`、`exports` 與 `output`。
4. 輸出資料夾若已有檔案就停止，不覆蓋學生作品。
5. 組裝完成後由學生只在新作品根目錄執行一次 `git init`。

## 老師發版流程

正式匯出只接受乾淨且已 Commit 的母版：

```bash
python3 course/tools/course_kits.py export \
  --source . \
  --output /absolute/path/to/course-kit-release
```

產生：

```text
course-kit-release/
├── flying-eagle-web-kit/
├── flying-eagle-core-kit/
└── flying-eagle-voice-kit/
```

接著才分別在三個輸出資料夾初始化 Git、推到老師的三個 GitHub repositories，並為三包打相同版本 Tag。`--allow-dirty` 只供自動測試，不可用於正式發課。

## 發版驗證

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest course.tests.test_course_kits
```

每次正式發版都必須從三個 GitHub repositories 重新 clone 到全新臨時資料夾，再執行 assemble、TypeScript 與 Python 測試。遠端可見性由課程維護者在 GitHub 管理；積木內容不因 Public 或 Private 而放寬機密排除規則。
