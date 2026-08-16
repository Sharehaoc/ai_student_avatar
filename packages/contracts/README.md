# Contracts Package

| 項目 | 說明 |
|---|---|
| 責任 | 定義 Web/API 共享的 Conversation、Persona、Voice Session、Transcript、Health、Usage 與 Persona 發音修正 schema。 |
| 不負責 | 不呼叫 API、不連資料庫、不載入環境變數、不建立 provider client。 |
| Coach 來源 | User/Persona/Conversation/Message 模型與語音 route payload 的通用語意。 |
| 處理方式 | 使用 Zod 重新建模；沒有直接複製 Coach schema。 |
| 輸入／輸出 | 輸入：unknown JSON；輸出：validated typed data 或明確 validation error。 |
| 依賴 | 固定版本 Zod；無 app dependencies。 |
| 環境變數 | 無。 |
| 本機驗證 | `pnpm --filter @flying-eagle/contracts test`、`pnpm --filter @flying-eagle/contracts typecheck`。 |
| 已知限制 | 已加入 `pronunciationFixes`、Voice Runtime Context／Message／State；尚未加入通用 API error envelope 與 pagination。 |
| 可替換 provider | contracts 使用 provider-neutral 名稱；新增 provider 不應修改核心 conversation schema。 |

任何 breaking change 必須先更新測試與 `docs/MODULE_CONTRACTS.md`，再修改 consumers。
