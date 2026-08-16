# 為什麼需要 Supabase Auth 與 Conversation

## 簡短答案

如果只是要讓喇叭發出 AI 聲音，兩者都不是必要條件；但課程產品要求「訪客登入、每人只能看自己的內容、主人能看後臺、保存當次人格版本、限制語音成本」，那就必須有可靠身份與 Conversation 邊界。

| 能力 | 沒有 Auth／Conversation | 完成後 |
|---|---|---|
| 確認誰在撥號 | 只知道瀏覽器送來一個 ID，任何人可冒用 | Supabase JWT 的 `sub` 是經簽章驗證的使用者身份 |
| 保護 LiveKit Token | 知道 API 網址的人可能消耗語音費用 | 只有 Conversation 擁有者通過額度檢查後拿到短效 Token |
| 保留人格版本 | 修改 System Prompt 後舊通話無法還原 | Conversation 保存 Prompt、Voice、Pronunciation Snapshot |
| 後臺逐字稿 | 只靠 Conversation ID，猜到 ID 可能越權 | API 同時限制 user、tenant、role 與 conversation |
| 通話成本 | 難以計算誰用了幾秒 | Admission 與 Conversation 記錄 tenant、訪客、時間與狀態 |

白話比喻：LiveKit 是電話線；Supabase Auth 是門禁卡；Conversation 是每通電話的案件資料夾。電話線可以單獨測試，但要正式讓訪客使用，就不能沒有門禁卡與案件編號。

## 本專案的責任切分

- Web Kit：只用 Supabase Publishable Key 做登入與取得 access token。
- Core Kit：驗證 JWT；所有 Persona／Conversation 業務資料與 LiveKit Token 都由 API 處理。
- Voice Kit：不接收瀏覽器自訂 prompt／voice，只依 server-derived Conversation identity 載入快照。

Supabase 官方目前建議新專案使用 Publishable／Secret API keys 與 asymmetric JWT signing keys。Core API 經 `/.well-known/jwks.json` 驗證 ES256／RS256 簽章，不自行實作 JWT 演算法，也不需要取得 Supabase 私鑰。

## 目前完成與未完成

| 項目 | 狀態 |
|---|---|
| Supabase JWT/JWKS 後端驗證 | 已完成單元測試與本機 Auth 真實登入 |
| 最小資料表、快照、RLS deny-by-default | 六個 Migration 已在全新本機 Supabase 套用驗證 |
| 已發布 Persona → Conversation Snapshot | 已完成 API、資料庫查詢與本機 DB 整合測試 |
| Conversation ownership → admission → LiveKit Token | 已完成 API 與單元測試 |
| 前端 Supabase 登入與通話畫面 | 已完成本機 Auth 與 OWNER／VISITOR 真實瀏覽器驗證；真實語音麥克風 E2E 待驗 |
| Persona／Conversation 主人後臺 CRUD | 草稿、發布、頭像、訪客、對話與逐字稿查詢已完成 |
| Voice Agent 載入快照與逐字稿回寫 | Core 內部 API、Worker client、冪等寫入與狀態轉移已接上；真實 provider E2E 待驗 |
| 通話秒數與額度 | DB 結束函式原子計算並避免重複計費；migration 已套用，真實通話待驗 |
| 真實跨使用者隔離 | OWNER／VISITOR 以真實本機 JWT 與 DB 驗證通過；正式雲端仍需 staging 重驗 |

註冊流程的正式課程決策是「電子信箱＋密碼＋確認密碼」，不發送 Email 驗證信。這是為了降低每位學員獨立系統的課程複雜度；Auth、JWT、OWNER／VISITOR 授權與 RLS 仍然保留。

Voice Worker 與 Core 之間使用獨立的 `VOICE_INTERNAL_TOKEN`，不共用瀏覽器 JWT，也不把完整 Prompt 塞進 LiveKit metadata。LiveKit metadata 僅攜帶 server-derived ID；Worker 進房後再從 Core 讀取當次 Conversation Snapshot。
