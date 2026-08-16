import { describe, expect, it, vi } from "vitest";

import { createConversationProvider } from "./create-conversation-provider.js";

const personaId = "11111111-1111-4111-8111-111111111111";

describe("createConversationProvider", () => {
  it("只傳 personaId 與 Supabase access token", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({
        conversationId: "conversation-1",
        personaDisplayName: "Limon 的 AI 分身",
        personaDescription: "陪你把問題想清楚。",
      }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }));
    const provider = createConversationProvider({
      apiUrl: "https://api.course.example",
      getAccessToken: vi.fn(async () => "supabase-access-token"),
      fetchImpl,
    });

    const created = await provider(personaId);

    expect(created.conversationId).toBe("conversation-1");
    const [, request] = fetchImpl.mock.calls[0]!;
    expect(request?.headers).toEqual({
      authorization: "Bearer supabase-access-token",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(request?.body))).toEqual({ personaId });
    expect(request?.signal).toBeInstanceOf(AbortSignal);
  });

  it("沒有登入 Session 時不呼叫 API", async () => {
    const fetchImpl = vi.fn();
    const provider = createConversationProvider({
      apiUrl: "https://api.course.example",
      getAccessToken: vi.fn(async () => null),
      fetchImpl,
    });

    await expect(provider(personaId)).rejects.toThrow("請先登入");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
