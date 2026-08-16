import { describe, expect, it, vi } from "vitest";

import { createStudentStudioApi } from "./studio-api.js";

const personaId = "11111111-1111-4111-8111-111111111111";

describe("Student Studio API", () => {
  it("OWNER 請求附帶目前 Supabase access token", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      personaId: "persona-1",
      version: 2,
      publishedAt: "2026-08-14T10:00:00+08:00",
    }), { status: 201, headers: { "content-type": "application/json" } }));
    const api = createStudentStudioApi({
      apiUrl: "https://api.example.com",
      getAccessToken: vi.fn(async () => "user-access-token"),
      fetcher,
    });

    const result = await api.publishDraft();

    expect(result.version).toBe(2);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.example.com/owner/persona/publish");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization"))
      .toBe("Bearer user-access-token");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("沒有登入 Token 時不送出 OWNER 請求", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const api = createStudentStudioApi({
      apiUrl: "https://api.example.com",
      getAccessToken: vi.fn(async () => null),
      fetcher,
    });

    await expect(api.getStudio()).rejects.toThrow("UNAUTHORIZED");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("公開 Persona 不附帶登入 Token，也不接受 Prompt 欄位", async () => {
    const api = createStudentStudioApi({
      apiUrl: "https://api.example.com",
      getAccessToken: vi.fn(async () => null),
      fetcher: vi.fn(async () => new Response(JSON.stringify({
        id: "persona-1",
        displayName: "學員分身",
        description: "公開介紹",
        avatarUrl: null,
        systemPrompt: "不應出現在公開回應",
      }), { status: 200, headers: { "content-type": "application/json" } })),
    });

    await expect(api.getPublicPersona("persona-1")).rejects.toThrow();
  });

  it("登入前臺時只回報 Persona ID，不接受前端指定身分", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      recorded: true,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const api = createStudentStudioApi({
      apiUrl: "https://api.example.com",
      getAccessToken: vi.fn(async () => "visitor-access-token"),
      fetcher,
    });

    await api.recordVisitorActivity(personaId);

    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.example.com/visitor/activity");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ personaId });
  });

  it("對話刪除使用 OWNER 專用路由", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      return new Response(JSON.stringify({ conversationId: "conversation-1", deleted: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const api = createStudentStudioApi({
      apiUrl: "https://api.example.com",
      getAccessToken: vi.fn(async () => "owner-access-token"),
      fetcher,
    });

    await api.deleteConversation("conversation-1");

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://api.example.com/owner/conversations/conversation-1",
    );
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe("DELETE");
  });

  it("聲音試聽只送文字並只接受 WAV", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(
      new Uint8Array([82, 73, 70, 70]),
      { status: 200, headers: { "content-type": "audio/wav" } },
    ));
    const api = createStudentStudioApi({
      apiUrl: "https://api.example.com",
      getAccessToken: vi.fn(async () => "owner-access-token"),
      fetcher,
    });

    const audio = await api.previewVoice("你好");

    expect(audio.type).toBe("audio/wav");
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ text: "你好" });
  });
});
