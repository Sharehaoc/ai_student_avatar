import { describe, expect, it } from "vitest";

import { UsageLimitResultSchema } from "./index.js";

describe("UsageLimitResult", () => {
  it("同時回報拒絕原因、餘額、併發水位與建議重試時間", () => {
    const result = UsageLimitResultSchema.parse({
      allowed: false,
      code: "TENANT_CONCURRENCY_LIMIT",
      remainingSeconds: 1_800,
      activeSessions: 1,
      concurrencyLimit: 1,
      retryAfterSeconds: 10
    });

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(10);
  });

  it("拒絕 allowed=true 但 code 卻是超限的矛盾資料", () => {
    expect(UsageLimitResultSchema.safeParse({
      allowed: true,
      code: "TENANT_CONCURRENCY_LIMIT",
      remainingSeconds: 1_800,
      activeSessions: 1,
      concurrencyLimit: 1,
      retryAfterSeconds: null
    }).success).toBe(false);
  });
});
