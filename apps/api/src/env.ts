export interface ApiEnvironment {
  host: string;
  port: number;
  databaseUrl: string;
  supabaseUrl: string;
  supabaseSecretKey: string;
  webOrigin: string;
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  livekitAgentName: string;
  voiceInternalToken: string;
  voicePowerOn: boolean;
  voiceGlobalConcurrencyLimit: number;
  voiceSetupRateLimit: number;
  voicePreviewUrl: string;
  voicePreviewRateLimit: number;
}

function internalToken(environment: NodeJS.ProcessEnv): string {
  const token = required(environment, "VOICE_INTERNAL_TOKEN");
  if (token.length < 32) {
    throw new Error("VOICE_INTERNAL_TOKEN 長度至少需要 32 個字元");
  }
  return token;
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`缺少必要環境變數：${name}`);
  return value;
}

function positiveInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  requiredWhenEnabled: boolean,
): number {
  const raw = environment[name]?.trim();
  if (!raw && !requiredWhenEnabled) return 1;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} 必須是正整數`);
  }
  return parsed;
}

export function readApiEnvironment(environment: NodeJS.ProcessEnv): ApiEnvironment {
  const voicePowerOn = environment.VOICE_POWER_ON === "true";
  const port = Number(environment.PORT ?? "8080");
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error("PORT 必須是有效連接埠");
  }
  const voicePreviewUrl = new URL(
    environment.VOICE_PREVIEW_URL?.trim() || "http://127.0.0.1:8082/preview",
  );
  if (
    voicePreviewUrl.protocol !== "https:"
    && !(voicePreviewUrl.protocol === "http:"
      && ["127.0.0.1", "localhost"].includes(voicePreviewUrl.hostname))
  ) {
    throw new Error("VOICE_PREVIEW_URL 在非本機環境必須使用 HTTPS");
  }
  return {
    host: environment.API_HOST?.trim() || "127.0.0.1",
    port,
    databaseUrl: required(environment, "DATABASE_URL"),
    supabaseUrl: required(environment, "SUPABASE_URL"),
    supabaseSecretKey: required(environment, "SUPABASE_SECRET_KEY"),
    webOrigin: required(environment, "WEB_ORIGIN"),
    livekitUrl: required(environment, "LIVEKIT_URL"),
    livekitApiKey: required(environment, "LIVEKIT_API_KEY"),
    livekitApiSecret: required(environment, "LIVEKIT_API_SECRET"),
    livekitAgentName: required(environment, "LIVEKIT_AGENT_NAME"),
    voiceInternalToken: internalToken(environment),
    voicePowerOn,
    voiceGlobalConcurrencyLimit: positiveInteger(
      environment,
      "VOICE_GLOBAL_CONCURRENCY_LIMIT",
      voicePowerOn,
    ),
    voiceSetupRateLimit: positiveInteger(
      environment,
      "VOICE_SETUP_RATE_LIMIT",
      voicePowerOn,
    ),
    voicePreviewUrl: voicePreviewUrl.toString(),
    voicePreviewRateLimit: positiveInteger(
      { ...environment, VOICE_PREVIEW_RATE_LIMIT: environment.VOICE_PREVIEW_RATE_LIMIT ?? "5" },
      "VOICE_PREVIEW_RATE_LIMIT",
      true,
    ),
  };
}
