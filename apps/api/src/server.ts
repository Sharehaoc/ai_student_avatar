import { serve } from "@hono/node-server";
import postgres from "postgres";

import { createApi } from "./app.js";
import { SupabaseJwtVerifier } from "./auth/supabase-jwt-verifier.js";
import {
  PostgresConversationRepository,
  PostgresVoiceAdmission,
} from "./database/voice-store.js";
import { PostgresVoiceRuntimeRepository } from "./database/voice-runtime-store.js";
import { PostgresOwnerStudioRepository } from "./database/owner-studio-store.js";
import { readApiEnvironment } from "./env.js";
import { loadLocalEnvFile } from "./local-env.js";
import { LiveKitTokenIssuer } from "./voice/livekit-token-issuer.js";
import { SupabaseAvatarStorage } from "./storage/supabase-avatar-storage.js";
import {
  HttpVoicePreviewClient,
  PostgresVoicePreviewLimiter,
} from "./voice/voice-preview.js";


loadLocalEnvFile();
const environment = readApiEnvironment(process.env);
const sql = postgres(environment.databaseUrl, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

const app = createApi({
  auth: new SupabaseJwtVerifier({ supabaseUrl: environment.supabaseUrl }),
  conversations: new PostgresConversationRepository(sql),
  admission: new PostgresVoiceAdmission(sql, {
    powerOn: environment.voicePowerOn,
    globalConcurrencyLimit: environment.voiceGlobalConcurrencyLimit,
    setupRatePerMinute: environment.voiceSetupRateLimit,
  }),
  tokenIssuer: new LiveKitTokenIssuer({
    url: environment.livekitUrl,
    apiKey: environment.livekitApiKey,
    apiSecret: environment.livekitApiSecret,
    agentName: environment.livekitAgentName,
  }),
  voiceRuntime: new PostgresVoiceRuntimeRepository(sql),
  ownerStudio: new PostgresOwnerStudioRepository(sql, environment.supabaseUrl),
  avatarStorage: new SupabaseAvatarStorage({
    supabaseUrl: environment.supabaseUrl,
    secretKey: environment.supabaseSecretKey,
  }),
  voiceInternalToken: environment.voiceInternalToken,
  voicePreview: new HttpVoicePreviewClient({
    url: environment.voicePreviewUrl,
    internalToken: environment.voiceInternalToken,
  }),
  voicePreviewLimiter: new PostgresVoicePreviewLimiter(
    sql,
    environment.voicePreviewRateLimit,
  ),
  requestLogger: {
    write(entry) {
      const line = JSON.stringify(entry);
      if (entry.level === "error") {
        console.error(line);
      } else {
        console.info(line);
      }
    },
  },
  webOrigin: environment.webOrigin,
});

const server = serve({
  fetch: app.fetch,
  hostname: environment.host,
  port: environment.port,
});

async function shutdown(): Promise<void> {
  server.close();
  await sql.end({ timeout: 5 });
}

process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
