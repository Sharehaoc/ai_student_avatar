import { describe, expect, it, vi } from "vitest";

import {
  PostgresVoicePreviewLimiter,
  HttpVoicePreviewClient,
} from "./voice-preview.js";
import type postgres from "postgres";


describe("PostgresVoicePreviewLimiter", () => {
  it("將資料庫原子限流結果轉成 API 使用的格式", async () => {
    const sql = vi.fn(async () => [{
      allowed: false,
      retry_after_seconds: 37,
    }]) as unknown as postgres.Sql;
    const limiter = new PostgresVoicePreviewLimiter(sql, 5, 60);

    await expect(limiter.consume("owner-1")).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 37,
    });
    expect(sql).toHaveBeenCalledOnce();
  });
});

describe("HttpVoicePreviewClient", () => {
  it("只信任內部 WAV 回應，不將供應商錯誤內容送到瀏覽器", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(
      new Uint8Array([82, 73, 70, 70]),
      { headers: { "content-type": "audio/wav" } },
    ));
    try {
      const result = await new HttpVoicePreviewClient({
        url: "http://127.0.0.1:8082/preview",
        internalToken: "internal-token",
      }).synthesize({
        text: "你好",
        voice: { provider: "minimax", voiceId: "voice-1", model: "model-1" },
        pronunciationFixes: {},
      });
      expect(result.audio).toEqual(new Uint8Array([82, 73, 70, 70]));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
