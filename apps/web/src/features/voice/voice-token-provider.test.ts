import { describe, expect, it, vi } from "vitest";

import { createVoiceTokenProvider } from "./voice-token-provider.js";

const conversationId = "22222222-2222-4222-8222-222222222222";

describe("createVoiceTokenProvider", () => {
  it("只把 Supabase access token 與 conversationId 送到 Core API", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Response(JSON.stringify({
        token: "signed-livekit-token",
        url: "wss://course.livekit.cloud",
        roomName: "eagle-conversation-1-random",
        conversationId,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    const provider = createVoiceTokenProvider({
      apiUrl: "https://api.course.example",
      getAccessToken: vi.fn(async () => "supabase-access-token"),
      fetchImpl,
    });

    const response = await provider({ conversationId });

    expect(response.roomName).toContain("conversation-1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, request] = fetchImpl.mock.calls[0]!;
    expect(request?.headers).toEqual({
      authorization: "Bearer supabase-access-token",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(request?.body))).toEqual({
      conversationId,
    });
    expect(request?.signal).toBeInstanceOf(AbortSignal);
  });

  it("沒有登入 Session 時不呼叫 API", async () => {
    const fetchImpl = vi.fn();
    const provider = createVoiceTokenProvider({
      apiUrl: "https://api.course.example",
      getAccessToken: vi.fn(async () => null),
      fetchImpl,
    });

    await expect(provider({ conversationId })).rejects.toThrow(
      "請先登入",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
