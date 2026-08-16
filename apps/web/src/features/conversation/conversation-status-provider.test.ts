import { describe, expect, it, vi } from "vitest";

import { createConversationStatusProvider } from "./conversation-status-provider.js";


describe("createConversationStatusProvider", () => {
  it("以登入憑證查詢本人對話的保存狀態", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      conversationId: "conversation-1",
      status: "ENDED",
      durationSeconds: 72,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const provider = createConversationStatusProvider({
      apiUrl: "https://api.course.example",
      getAccessToken: vi.fn(async () => "supabase-access-token"),
      fetchImpl,
    });

    await expect(provider("conversation-1")).resolves.toEqual({
      conversationId: "conversation-1",
      status: "ENDED",
      durationSeconds: 72,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.course.example/conversations/conversation-1/status",
      expect.objectContaining({
        headers: { authorization: "Bearer supabase-access-token" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("沒有登入憑證時不呼叫 API", async () => {
    const fetchImpl = vi.fn();
    const provider = createConversationStatusProvider({
      apiUrl: "https://api.course.example",
      getAccessToken: vi.fn(async () => null),
      fetchImpl,
    });

    await expect(provider("conversation-1")).rejects.toThrow("請先登入");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
