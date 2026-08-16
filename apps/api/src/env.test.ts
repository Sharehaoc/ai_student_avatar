import { describe, expect, it } from "vitest";

import { readApiEnvironment } from "./env.js";


const baseEnvironment: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgres://course:secret@database.example/course",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SECRET_KEY: "server-secret-key",
  WEB_ORIGIN: "https://student.example",
  LIVEKIT_URL: "wss://project.livekit.cloud",
  LIVEKIT_API_KEY: "api-key",
  LIVEKIT_API_SECRET: "api-secret",
  LIVEKIT_AGENT_NAME: "flying-eagle-voice-agent",
  VOICE_INTERNAL_TOKEN: "internal-token-that-is-long-enough",
};

describe("readApiEnvironment", () => {
  it("本機預設只監聽 loopback，部署時可明確覆寫", () => {
    expect(readApiEnvironment(baseEnvironment).host).toBe("127.0.0.1");
    expect(readApiEnvironment({ ...baseEnvironment, API_HOST: "0.0.0.0" }).host)
      .toBe("0.0.0.0");
  });

  it("總電源關閉時不會猜測正式容量數字", () => {
    const parsed = readApiEnvironment({ ...baseEnvironment, VOICE_POWER_ON: "false" });

    expect(parsed.voicePowerOn).toBe(false);
  });

  it("總電源開啟時強制提供量測後的全域容量與進線速率", () => {
    expect(() => readApiEnvironment({
      ...baseEnvironment,
      VOICE_POWER_ON: "true",
    })).toThrow("VOICE_GLOBAL_CONCURRENCY_LIMIT");

    const parsed = readApiEnvironment({
      ...baseEnvironment,
      VOICE_POWER_ON: "true",
      VOICE_GLOBAL_CONCURRENCY_LIMIT: "20",
      VOICE_SETUP_RATE_LIMIT: "8",
    });
    expect(parsed.voiceGlobalConcurrencyLimit).toBe(20);
    expect(parsed.voiceSetupRateLimit).toBe(8);
  });

  it("內部 Worker 專線強制使用長度足夠的獨立憑證", () => {
    expect(() => readApiEnvironment({
      ...baseEnvironment,
      VOICE_INTERNAL_TOKEN: "short",
    })).toThrow("VOICE_INTERNAL_TOKEN");

    expect(readApiEnvironment(baseEnvironment).voiceInternalToken)
      .toBe("internal-token-that-is-long-enough");
  });
});
