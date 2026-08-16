import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import { readWebEnvironment } from "./config.js";
import { createConversationProvider } from "./features/conversation/create-conversation-provider.js";
import { createConversationStatusProvider } from "./features/conversation/conversation-status-provider.js";
import { createVoiceTokenProvider } from "./features/voice/voice-token-provider.js";
import { createCourseSupabaseSession } from "./lib/supabase-session.js";
import { createStudentStudioApi } from "./features/studio/studio-api.js";
import "./styles.css";


const root = createRoot(document.getElementById("root")!);

try {
  const environment = readWebEnvironment(import.meta.env);
  const auth = createCourseSupabaseSession(
    environment.supabaseUrl,
    environment.supabasePublishableKey,
  );
  const conversation = createConversationProvider({
    apiUrl: environment.apiUrl,
    getAccessToken: auth.getAccessToken,
  });
  const token = createVoiceTokenProvider({
    apiUrl: environment.apiUrl,
    getAccessToken: auth.getAccessToken,
  });
  const conversationStatus = createConversationStatusProvider({
    apiUrl: environment.apiUrl,
    getAccessToken: auth.getAccessToken,
  });
  const studioApi = createStudentStudioApi({
    apiUrl: environment.apiUrl,
    getAccessToken: auth.getAccessToken,
  });

  root.render(
    <StrictMode>
      <App
        auth={auth}
        personaId={environment.personaId}
        personaAvatarUrl={environment.personaAvatarUrl}
        createConversation={conversation}
        getConversationStatus={conversationStatus}
        tokenProvider={token}
        studioApi={studioApi}
      />
    </StrictMode>,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : "設定格式錯誤";
  root.render(
    <main className="shell shell-centered">
      <section className="login-panel" role="alert">
        <p className="product-mark">學員 AI 分身</p>
        <h1>專案尚未完成設定</h1>
        <p className="supporting-copy">{message}</p>
        <p className="supporting-copy">請回到組裝說明書檢查 `.env` 的公開前端欄位。</p>
      </section>
    </main>,
  );
}
