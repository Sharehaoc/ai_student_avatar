# 課程開發路線圖

## 推薦順序

| 階段 | 學生可觀察成果 | 工程交付 | 驗證閘門 | 狀態 |
|---|---|---|---|---|
| 0. 架構骨架 | 看懂套件怎麼分工 | monorepo、contracts、文件、最小測試、TTS 文字 pipeline | typecheck + 單元測試 | 已完成 |
| 1. 登入與資料隔離 | 學生能登入，只看到自己的資料 | Supabase Auth、schema、RLS、repository | 跨使用者隔離測試 | 本機真實 Auth／DB 整合已驗證 |
| 2. 人格版本 | 建立、發布、切換 AI 人格 | Persona／PersonaVersion API 與 UI | 歷史對話快照不被新版本改寫 | 已完成並通過本機整合測試 |
| 3. 文字對話 | 不用語音也能完成一輪 AI 對話 | Conversation、Message、LLM adapter | 重試不重複寫入、限額可控 | 待做 |
| 4. LiveKit 最小語音 | 瀏覽器可進房、開關麥克風 | token API、Web adapter、Python worker | 未授權者無法拿 token；單 session 不重複啟動 | 程式與離線測試已完成；Cloud E2E 待驗 |
| 5. Soniox + MiniMax | 即時聽懂並用指定聲音回答 | STT/TTS adapters、分段、文字清洗、timeout、health | provider sandbox + 失敗降級測試 | 程式與離線測試已完成；provider sandbox 待驗 |
| 6. 記憶 MVP | 下一次對話能記住經確認的摘要 | summary、optional profile、refinement | 不跨 tenant、不把幻覺寫成事實 | 待做 |
| 7. 教師查閱 | 教師能在授權範圍看學生對話 | instructor roles、transcript API、audit log | 權限矩陣與隱私流程 | 待做 |
| 8. 獨立系統演練 | 每位學員的專屬系統可預期運作 | admission、metrics、runbook、獨立 Key | 單套真實 E2E、超額拒絕、掛斷存檔 | 程式保護已建；真實 provider E2E 待驗 |
| 9. 課程發佈 | 零程式學生可依步驟完成部署 | 教材、三個積木、獨立環境變數 | 新手可重複完成；無共享秘密外洩 | 積木工具已建；遠端 repository 與乾淨環境試教待做 |

## 每階段教學結構

1. 先展示學生看得到的結果。
2. 用一張資料流圖說明本階段只新增哪一塊。
3. 由學生填寫最少量設定，不要求手寫核心程式碼。
4. 執行自動檢查，錯誤訊息提供可操作修法。
5. 以安全清單收尾，避免學生為了「先跑起來」公開 secrets 或關閉 RLS。

## 正式發課模式

1. 每位學員組裝自己的 Web／Core／Voice 專案。
2. 每位學員使用自己的 Supabase Postgres／Auth／Storage。
3. 老師提供每位學員獨立的 LiveKit、Soniox、OpenAI 與 MiniMax Key。
4. GitHub 積木只包含 `.env.example`；學員在本機或部署平台填入真值。
5. 註冊使用 Email、密碼與確認密碼，不要求 Email 驗證。

此模式不建立 Course Token Gateway，也不把「30 位學員共用一套 runtime」當作測試前提。若未來變更為共用平台，必須以新架構另行設計與壓測。

## 第一版刻意不做

- Vector DB、knowledge graph、多代理記憶抽取。
- 付款、訂閱、發票、referral、appeal。
- HolyGrail2、Fal、Deepgram 與 Tracy 品牌功能。
- 未經實測就宣稱單套系統可承載多通語音。
- 把同一組 provider keys 或 service role key 共用給多位學員。
