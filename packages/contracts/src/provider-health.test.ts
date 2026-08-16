import { describe, expect, it } from "vitest";

import { ProviderHealthSchema } from "./index.js";

describe("ProviderHealth", () => {
  it("沒有近期成功證據時只能回報 UNKNOWN，不能猜 HEALTHY", () => {
    const health = ProviderHealthSchema.parse({
      kind: "TTS",
      provider: "minimax",
      status: "UNKNOWN",
      checkedAt: "2026-08-13T10:02:00+08:00",
      latencyMs: null,
      code: "NO_RECENT_PROBE"
    });

    expect(health.status).toBe("UNKNOWN");
  });
});
