import { describe, expect, it, vi } from "vitest";

import { waitForConversationSaved } from "./wait-for-conversation-saved.js";


describe("waitForConversationSaved", () => {
  it("等待 Worker 把對話轉成終止狀態後才回報完成", async () => {
    const getStatus = vi.fn()
      .mockResolvedValueOnce({
        conversationId: "conversation-1",
        status: "ACTIVE",
        durationSeconds: 70,
      })
      .mockResolvedValueOnce({
        conversationId: "conversation-1",
        status: "ENDED",
        durationSeconds: 72,
      });
    let elapsed = 0;

    await expect(waitForConversationSaved("conversation-1", getStatus, {
      timeoutMs: 1_000,
      intervalMs: 100,
      now: () => elapsed,
      sleep: async (milliseconds) => {
        elapsed += milliseconds;
      },
    })).resolves.toMatchObject({ status: "ENDED", durationSeconds: 72 });
    expect(getStatus).toHaveBeenCalledTimes(2);
  });

  it("超過等待上限時明確失敗，不假裝已保存", async () => {
    let elapsed = 0;
    const getStatus = vi.fn(async () => ({
      conversationId: "conversation-1",
      status: "ACTIVE" as const,
      durationSeconds: 70,
    }));

    await expect(waitForConversationSaved("conversation-1", getStatus, {
      timeoutMs: 200,
      intervalMs: 100,
      now: () => elapsed,
      sleep: async (milliseconds) => {
        elapsed += milliseconds;
      },
    })).rejects.toThrow("CONVERSATION_FINALIZATION_TIMEOUT");
  });

  it("狀態 API 短暫失敗時會在時限內重試", async () => {
    const getStatus = vi.fn()
      .mockRejectedValueOnce(new Error("temporary network error"))
      .mockResolvedValueOnce({
        conversationId: "conversation-1",
        status: "ENDED",
        durationSeconds: 72,
      });
    let elapsed = 0;

    await expect(waitForConversationSaved("conversation-1", getStatus, {
      timeoutMs: 1_000,
      intervalMs: 100,
      now: () => elapsed,
      sleep: async (milliseconds) => {
        elapsed += milliseconds;
      },
    })).resolves.toMatchObject({ status: "ENDED" });
    expect(getStatus).toHaveBeenCalledTimes(2);
  });
});
