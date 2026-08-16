import { describe, expect, it } from "vitest";

import { withRequestTimeout } from "./request-timeout.js";

describe("withRequestTimeout", () => {
  it("每個請求都有逾時 signal，並保留呼叫端原本的取消能力", () => {
    const controller = new AbortController();
    const request = withRequestTimeout({ signal: controller.signal }, 10_000);

    expect(request.signal).toBeInstanceOf(AbortSignal);
    expect(request.signal?.aborted).toBe(false);
    controller.abort();
    expect(request.signal?.aborted).toBe(true);
  });
});
