import { describe, expect, it, vi } from "vitest";

import type {
  ConversationStatusResponse,
  CreateConversationResponse,
  OwnerPersonaDraftInput,
  OwnerStudioResponse,
  PublishPersonaResponse,
  StudioConversationDetail,
  UsageLimitResult,
  VoiceRuntimeContext,
  VoiceRuntimeStateResult,
  VoiceTokenResponse,
} from "@flying-eagle/contracts";

import {
  createApi,
  type ApiDependencies,
  type ConversationVoiceContext,
} from "./app.js";

const testPersonaId = "11111111-1111-4111-8111-111111111111";
const testConversationId = "22222222-2222-4222-8222-222222222222";
const testPersonaVersionId = "33333333-3333-4333-8333-333333333333";
const missingConversationId = "44444444-4444-4444-8444-444444444444";

const allowed: UsageLimitResult = {
  allowed: true,
  code: "ALLOWED",
  remainingSeconds: 1_800,
  activeSessions: 0,
  concurrencyLimit: 1,
  retryAfterSeconds: null,
};

const context: ConversationVoiceContext = {
  conversationId: "conversation-1",
  tenantId: "tenant-1",
  visitorUserId: "user-1",
  personaVersionId: "persona-version-1",
  status: "PENDING",
};

const tokenResponse: VoiceTokenResponse = {
  token: "signed-livekit-token",
  url: "wss://course.livekit.cloud",
  roomName: "eagle-conversation-1-random",
  conversationId: "conversation-1",
};

const runtimeContext: VoiceRuntimeContext = {
  conversationId: "conversation-1",
  tenantId: "tenant-1",
  visitorUserId: "user-1",
  personaVersionId: "persona-version-1",
  systemPrompt: "你是學生定義的 AI 分身。",
  openingMessage: "嗨，今天想聊什麼？",
  voice: {
    provider: "minimax",
    voiceId: "voice-clone-1",
    model: "speech-02-turbo",
  },
  pronunciationFixes: { "飛鷹": "飛英" },
  maxDurationSeconds: 1_800,
};

const activeState: VoiceRuntimeStateResult = {
  conversationId: "conversation-1",
  status: "ACTIVE",
  durationSeconds: 0,
};

const createdConversation: CreateConversationResponse = {
  conversationId: "conversation-1",
  personaDisplayName: "Limon 的 AI 分身",
  personaDescription: "陪你把問題想清楚。",
};

const endedConversation: ConversationStatusResponse = {
  conversationId: "conversation-1",
  status: "ENDED",
  durationSeconds: 72,
};

const ownerDraft: OwnerPersonaDraftInput = {
  displayName: "Limon 的 AI 分身",
  description: "陪你釐清下一步。",
  systemPrompt: "請使用台灣繁體中文回覆。",
  openingMessage: "嗨，今天想先聊什麼？",
};

const ownerVoice = {
  voice: {
    provider: "minimax" as const,
    voiceId: "voice-clone-1",
    model: "speech-2.6-hd",
  },
  pronunciationFixes: { "飛鷹": "飛英" },
};

const ownerStudio: OwnerStudioResponse = {
  persona: {
    id: "persona-1",
    tenantId: "tenant-1",
    ...ownerDraft,
    ...ownerVoice,
    avatarUrl: null,
    published: true,
    activeVersion: 3,
    updatedAt: "2026-08-14T10:00:00+08:00",
  },
  personaVersions: [{
    id: "persona-version-3",
    version: 3,
    systemPrompt: ownerDraft.systemPrompt,
    openingMessage: ownerDraft.openingMessage,
    voice: ownerVoice.voice,
    pronunciationFixes: ownerVoice.pronunciationFixes,
    createdAt: "2026-08-14T09:00:00+08:00",
    active: true,
  }],
  visitors: [],
  conversations: [],
};

const publishedPersona: PublishPersonaResponse = {
  personaId: "persona-1",
  version: 4,
  publishedAt: "2026-08-14T10:05:00+08:00",
};

const conversationDetail: StudioConversationDetail = {
  conversation: {
    id: "conversation-1",
    visitorId: "visitor-1",
    visitorDisplayName: "訪客",
    title: "語音對話",
    startedAt: "2026-08-14T10:00:00+08:00",
    durationSeconds: 72,
    status: "ENDED",
    personaVersion: 3,
    summary: null,
  },
  messages: [],
};

function dependencies(overrides: Partial<ApiDependencies> = {}): ApiDependencies {
  return {
    auth: {
      verifyAuthorizationHeader: vi.fn(async () => ({ userId: "user-1" })),
    },
    conversations: {
      createForUser: vi.fn(async () => createdConversation),
      findVoiceContextForUser: vi.fn(async () => context),
      findStatusForUser: vi.fn(async () => endedConversation),
      recordActivity: vi.fn(async () => true),
    },
    admission: {
      evaluate: vi.fn(async () => allowed),
    },
    tokenIssuer: {
      issue: vi.fn(async () => tokenResponse),
    },
    voiceRuntime: {
      findContext: vi.fn(async () => runtimeContext),
      appendMessage: vi.fn(async () => ({ sequence: 0 })),
      transitionState: vi.fn(async () => activeState),
    },
    ownerStudio: {
      getStudio: vi.fn(async () => ownerStudio),
      saveDraft: vi.fn(async () => ownerStudio.persona),
      publishDraft: vi.fn(async () => publishedPersona),
      getConversation: vi.fn(async () => conversationDetail),
      findOwnedPersona: vi.fn(async () => ({
        personaId: "persona-1",
        tenantId: "tenant-1",
      })),
      updateAvatarPath: vi.fn(async () => true),
      restoreVersion: vi.fn(async () => ownerStudio.persona),
      deleteConversation: vi.fn(async () => true),
      findPublicPersona: vi.fn(async () => ({
        id: "persona-1",
        displayName: ownerDraft.displayName,
        description: ownerDraft.description,
        avatarUrl: null,
      })),
      findVoicePreviewContext: vi.fn(async () => ownerVoice),
    },
    avatarStorage: {
      upload: vi.fn(async () => ({
        path: "tenant-1/persona-1/avatar.webp",
        publicUrl: "http://127.0.0.1:54321/storage/v1/object/public/persona-avatars/tenant-1/persona-1/avatar.webp",
        stalePaths: [
          "tenant-1/persona-1/avatar.jpg",
          "tenant-1/persona-1/avatar.png",
        ],
      })),
      remove: vi.fn(async () => undefined),
    },
    voiceInternalToken: "internal-token-that-is-long-enough",
    voicePreview: {
      synthesize: vi.fn(async () => ({
        audio: new Uint8Array([82, 73, 70, 70]),
        contentType: "audio/wav" as const,
      })),
    },
    voicePreviewLimiter: {
      consume: vi.fn(async () => ({ allowed: true, retryAfterSeconds: null })),
    },
    ...overrides,
  };
}

function conversationRequest(
  body: unknown,
  authorization = "Bearer valid-user-jwt",
): Request {
  return new Request("http://localhost/conversations", {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /conversations", () => {
  it("過大 JSON 請求在解析前被拒絕", async () => {
    const deps = dependencies();
    const response = await createApi(deps).request(conversationRequest({
      personaId: testPersonaId,
      padding: "x".repeat(70 * 1024),
    }));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
    expect(deps.conversations.createForUser).not.toHaveBeenCalled();
  });

  it("由 JWT sub 建立當次快照，不接受瀏覽器自選 Voice", async () => {
    const deps = dependencies();
    const app = createApi(deps);

    const response = await app.request(conversationRequest({ personaId: testPersonaId }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(createdConversation);
    expect(deps.conversations.createForUser).toHaveBeenCalledWith(
      testPersonaId,
      "user-1",
      { email: null, displayName: null },
    );

    const tampered = await app.request(conversationRequest({
      personaId: testPersonaId,
      voiceId: "attacker-voice",
    }));
    expect(tampered.status).toBe(400);
  });

  it("未登入、未發布或 Persona 沒有啟用版本時不建立對話", async () => {
    const unauthorized = dependencies({
      auth: {
        verifyAuthorizationHeader: vi.fn(async () => {
          throw new Error("invalid token");
        }),
      },
    });
    const unauthorizedResponse = await createApi(unauthorized).request(
      conversationRequest({ personaId: testPersonaId }, "Bearer invalid"),
    );
    expect(unauthorizedResponse.status).toBe(401);
    expect(unauthorized.conversations.createForUser).not.toHaveBeenCalled();

    const missing = dependencies({
      conversations: {
        createForUser: vi.fn(async () => null),
        findVoiceContextForUser: vi.fn(async () => context),
        findStatusForUser: vi.fn(async () => endedConversation),
        recordActivity: vi.fn(async () => true),
      },
    });
    const missingResponse = await createApi(missing).request(
      conversationRequest({ personaId: testPersonaId }),
    );
    expect(missingResponse.status).toBe(404);
  });
});

describe("GET /personas/:personaId/public", () => {
  it("無效 UUID 回傳 400，不將 PostgreSQL 型別錯誤轉成 500", async () => {
    const deps = dependencies();
    const response = await createApi(deps).request(
      "http://localhost/personas/not-a-uuid/public",
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "INVALID_REQUEST" },
    });
    expect(deps.ownerStudio.findPublicPersona).not.toHaveBeenCalled();
  });
});

function authorizedRequest(path: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("authorization", "Bearer valid-user-jwt");
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }
  return new Request(`http://localhost${path}`, { ...init, headers });
}

describe("學員 OWNER 管理 API", () => {
  it("只讓已驗證且確實擁有 tenant 的使用者讀取後臺", async () => {
    const deps = dependencies();
    const response = await createApi(deps).request(authorizedRequest("/owner/studio"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(ownerStudio);
    expect(deps.ownerStudio.getStudio).toHaveBeenCalledWith("user-1");

    const visitor = dependencies({
      ownerStudio: {
        ...deps.ownerStudio,
        getStudio: vi.fn(async () => null),
      },
    });
    const visitorResponse = await createApi(visitor).request(
      authorizedRequest("/owner/studio"),
    );
    expect(visitorResponse.status).toBe(404);
  });

  it("儲存草稿時拒絕 tenantId 等越權欄位", async () => {
    const deps = dependencies();
    const app = createApi(deps);
    const response = await app.request(authorizedRequest("/owner/persona/draft", {
      method: "PUT",
      body: JSON.stringify(ownerDraft),
    }));

    expect(response.status).toBe(200);
    expect(deps.ownerStudio.saveDraft).toHaveBeenCalledWith("user-1", ownerDraft);

    const tampered = await app.request(authorizedRequest("/owner/persona/draft", {
      method: "PUT",
      body: JSON.stringify({ ...ownerDraft, tenantId: "other-tenant" }),
    }));
    expect(tampered.status).toBe(400);
  });

  it("發布時只從伺服器內的草稿建立新版本", async () => {
    const deps = dependencies();
    const response = await createApi(deps).request(authorizedRequest(
      "/owner/persona/publish",
      { method: "POST" },
    ));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(publishedPersona);
    expect(deps.ownerStudio.publishDraft).toHaveBeenCalledWith("user-1");
  });

  it("聲音試聽只接受文字，Voice ID 與發音修正由伺服器取得", async () => {
    const deps = dependencies();
    const app = createApi(deps);
    const response = await app.request(authorizedRequest(
      "/owner/persona/voice-preview",
      { method: "POST", body: JSON.stringify({ text: "你好，這是聲音試聽。" }) },
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("audio/wav");
    expect(deps.ownerStudio.findVoicePreviewContext).toHaveBeenCalledWith("user-1");
    expect(deps.voicePreview.synthesize).toHaveBeenCalledWith({
      text: "你好，這是聲音試聽。",
      ...ownerVoice,
    });

    const tampered = await app.request(authorizedRequest(
      "/owner/persona/voice-preview",
      {
        method: "POST",
        body: JSON.stringify({
          text: "你好",
          voiceId: "attacker-voice",
          pronunciationFixes: {},
        }),
      },
    ));
    expect(tampered.status).toBe(400);
  });

  it("聲音試聽有獨立次數限制，避免昂貴 TTS 端點被濫用", async () => {
    const deps = dependencies({
      voicePreviewLimiter: {
        consume: vi.fn(async () => ({ allowed: false, retryAfterSeconds: 37 })),
      },
    });
    const response = await createApi(deps).request(authorizedRequest(
      "/owner/persona/voice-preview",
      { method: "POST", body: JSON.stringify({ text: "你好" }) },
    ));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("37");
    expect(deps.voicePreview.synthesize).not.toHaveBeenCalled();
  });

  it("只能查詢屬於 OWNER tenant 的對話逐字稿", async () => {
    const deps = dependencies();
    const response = await createApi(deps).request(authorizedRequest(
      `/owner/conversations/${testConversationId}`,
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(conversationDetail);
    expect(deps.ownerStudio.getConversation).toHaveBeenCalledWith(
      "user-1",
      testConversationId,
    );
  });

  it("頭像只接受 5 MB 內的 JPEG、PNG 或 WebP", async () => {
    const deps = dependencies();
    const app = createApi(deps);
    const body = new FormData();
    body.set("avatar", new File([
      new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]),
    ], "avatar.webp", {
      type: "image/webp",
    }));
    const response = await app.request(authorizedRequest("/owner/persona/avatar", {
      method: "POST",
      body,
    }));
    expect(response.status).toBe(200);
    expect(deps.avatarStorage.upload).toHaveBeenCalled();
    expect(deps.avatarStorage.remove).toHaveBeenCalledWith([
      "tenant-1/persona-1/avatar.jpg",
      "tenant-1/persona-1/avatar.png",
    ]);

    const invalid = new FormData();
    invalid.set("avatar", new File(["<svg/>"], "avatar.svg", {
      type: "image/svg+xml",
    }));
    const invalidResponse = await app.request(authorizedRequest(
      "/owner/persona/avatar",
      { method: "POST", body: invalid },
    ));
    expect(invalidResponse.status).toBe(400);
  });

  it("頭像請求體超過上限時在解析 multipart 前拒絕", async () => {
    const deps = dependencies();
    const body = new FormData();
    body.set("avatar", new File([new Uint8Array([1])], "avatar.webp", {
      type: "image/webp",
    }));
    const response = await createApi(deps).request(authorizedRequest(
      "/owner/persona/avatar",
      {
        method: "POST",
        headers: { "content-length": "5500001" },
        body,
      },
    ));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
    expect(deps.avatarStorage.upload).not.toHaveBeenCalled();
  });

  it("頭像資料庫更新失敗時回收剛上傳的新物件", async () => {
    const deps = dependencies();
    deps.ownerStudio.updateAvatarPath = vi.fn(async () => false);
    const body = new FormData();
    body.set("avatar", new File([
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    ], "avatar.png", { type: "image/png" }));

    const response = await createApi(deps).request(authorizedRequest(
      "/owner/persona/avatar",
      { method: "POST", body },
    ));

    expect(response.status).toBe(404);
    expect(deps.avatarStorage.remove).toHaveBeenCalledWith([
      "tenant-1/persona-1/avatar.webp",
    ]);
  });

  it("訪客登入活動由 JWT 身份記錄，不接受 browser 自選角色", async () => {
    const deps = dependencies();
    const app = createApi(deps);
    const response = await app.request(authorizedRequest("/visitor/activity", {
      method: "POST",
      body: JSON.stringify({ personaId: testPersonaId }),
    }));
    expect(response.status).toBe(200);
    expect(deps.conversations.recordActivity).toHaveBeenCalledWith(
      testPersonaId,
      "user-1",
      { email: null, displayName: null },
    );

    const tampered = await app.request(authorizedRequest("/visitor/activity", {
      method: "POST",
      body: JSON.stringify({ personaId: testPersonaId, role: "OWNER" }),
    }));
    expect(tampered.status).toBe(400);
  });

  it("OWNER 可以把歷史版本複製回草稿，但不改寫歷史版本", async () => {
    const deps = dependencies();
    const response = await createApi(deps).request(authorizedRequest(
      `/owner/persona/versions/${testPersonaVersionId}/restore`,
      { method: "POST" },
    ));
    expect(response.status).toBe(200);
    expect(deps.ownerStudio.restoreVersion).toHaveBeenCalledWith(
      "user-1",
      testPersonaVersionId,
    );
  });

  it("OWNER 只能刪除自己 tenant 的對話", async () => {
    const deps = dependencies();
    const response = await createApi(deps).request(authorizedRequest(
      `/owner/conversations/${testConversationId}`,
      { method: "DELETE" },
    ));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      conversationId: testConversationId,
      deleted: true,
    });
    expect(deps.ownerStudio.deleteConversation).toHaveBeenCalledWith(
      "user-1",
      testConversationId,
    );
  });
});

describe("GET /conversations/:conversationId/status", () => {
  it("只用已驗證 userId 查詢保存狀態", async () => {
    const deps = dependencies();

    const response = await createApi(deps).request(new Request(
      `http://localhost/conversations/${testConversationId}/status`,
      { headers: { authorization: "Bearer valid-user-jwt" } },
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(endedConversation);
    expect(deps.conversations.findStatusForUser).toHaveBeenCalledWith(
      testConversationId,
      "user-1",
    );
  });

  it("未登入或對話不屬於本人時不洩漏保存狀態", async () => {
    const unauthorized = dependencies({
      auth: {
        verifyAuthorizationHeader: vi.fn(async () => {
          throw new Error("invalid token");
        }),
      },
    });
    const unauthorizedResponse = await createApi(unauthorized).request(
      `http://localhost/conversations/${testConversationId}/status`,
    );
    expect(unauthorizedResponse.status).toBe(401);
    expect(unauthorized.conversations.findStatusForUser).not.toHaveBeenCalled();

    const missing = dependencies({
      conversations: {
        createForUser: vi.fn(async () => createdConversation),
        findVoiceContextForUser: vi.fn(async () => context),
        findStatusForUser: vi.fn(async () => null),
        recordActivity: vi.fn(async () => true),
      },
    });
    const missingResponse = await createApi(missing).request(new Request(
      `http://localhost/conversations/${testConversationId}/status`,
      { headers: { authorization: "Bearer valid-user-jwt" } },
    ));
    expect(missingResponse.status).toBe(404);
  });
});

function tokenRequest(body: unknown, authorization = "Bearer valid-user-jwt"): Request {
  return new Request("http://localhost/voice/sessions/token", {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /voice/sessions/token", () => {
  it("未登入時不查 Conversation，也不簽發 LiveKit Token", async () => {
    const deps = dependencies({
      auth: {
        verifyAuthorizationHeader: vi.fn(async () => {
          throw new Error("invalid token");
        }),
      },
    });

    const response = await createApi(deps).request(
      tokenRequest({ conversationId: testConversationId }),
    );

    expect(response.status).toBe(401);
    expect(deps.conversations.findVoiceContextForUser).not.toHaveBeenCalled();
    expect(deps.tokenIssuer.issue).not.toHaveBeenCalled();
  });

  it("Browser 只能傳 conversationId，不能竄改 voiceId 或 tenantId", async () => {
    const deps = dependencies();

    const response = await createApi(deps).request(tokenRequest({
      conversationId: testConversationId,
      voiceId: "attacker-voice",
      tenantId: "other-tenant",
    }));

    expect(response.status).toBe(400);
    expect(deps.conversations.findVoiceContextForUser).not.toHaveBeenCalled();
    expect(deps.tokenIssuer.issue).not.toHaveBeenCalled();
  });

  it("只用已驗證 userId 查詢 Conversation 歸屬", async () => {
    const deps = dependencies({
      conversations: {
        createForUser: vi.fn(async () => createdConversation),
        findVoiceContextForUser: vi.fn(async () => null),
        findStatusForUser: vi.fn(async () => endedConversation),
        recordActivity: vi.fn(async () => true),
      },
    });

    const response = await createApi(deps).request(
      tokenRequest({ conversationId: testConversationId }),
    );

    expect(response.status).toBe(404);
    expect(deps.conversations.findVoiceContextForUser).toHaveBeenCalledWith(
      testConversationId,
      "user-1",
    );
    expect(deps.tokenIssuer.issue).not.toHaveBeenCalled();
  });

  it("Admission 拒絕時採 fail-closed，不簽發 Token", async () => {
    const denied: UsageLimitResult = {
      allowed: false,
      code: "TENANT_CONCURRENCY_LIMIT",
      remainingSeconds: 1_800,
      activeSessions: 1,
      concurrencyLimit: 1,
      retryAfterSeconds: 30,
    };
    const deps = dependencies({
      admission: {
        evaluate: vi.fn(async () => denied),
      },
    });

    const response = await createApi(deps).request(
      tokenRequest({ conversationId: testConversationId }),
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: denied });
    expect(deps.tokenIssuer.issue).not.toHaveBeenCalled();
  });

  it("通過 Auth、歸屬與 Admission 後才簽發短效 Token", async () => {
    const deps = dependencies();

    const response = await createApi(deps).request(
      tokenRequest({ conversationId: testConversationId }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(tokenResponse);
    expect(deps.tokenIssuer.issue).toHaveBeenCalledWith(context);
  });
});

describe("API request log", () => {
  it("每個請求留下可追蹤但不含 Authorization 或 request body 的結構化紀錄", async () => {
    const write = vi.fn();
    const response = await createApi(dependencies({
      requestLogger: { write },
    })).request(conversationRequest(
      { personaId: testPersonaId, secretField: "must-not-be-logged" },
      "Bearer must-not-be-logged",
    ));

    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(write).toHaveBeenCalledWith(expect.objectContaining({
      event: "http_request_completed",
      requestId: response.headers.get("x-request-id"),
      method: "POST",
      path: "/conversations",
      status: 400,
      level: "info",
    }));
    expect(JSON.stringify(write.mock.calls)).not.toContain("must-not-be-logged");
  });
});

function internalRequest(
  path: string,
  init: RequestInit = {},
  token = "internal-token-that-is-long-enough",
): Request {
  const headers = new Headers(init.headers);
  headers.set("x-voice-internal-token", token);
  if (init.body) headers.set("content-type", "application/json");
  return new Request(`http://localhost${path}`, { ...init, headers });
}

describe("Voice Worker internal API", () => {
  it("內部憑證錯誤時不存取任何 Conversation", async () => {
    const deps = dependencies();
    const response = await createApi(deps).request(internalRequest(
      `/internal/voice/sessions/${testConversationId}/context`,
      {},
      "wrong-token-with-same-minimum-length",
    ));

    expect(response.status).toBe(401);
    expect(deps.voiceRuntime.findContext).not.toHaveBeenCalled();
  });

  it("以 server-side Conversation Snapshot 供應 Worker，找不到時不洩漏資料", async () => {
    const deps = dependencies();
    const app = createApi(deps);
    const response = await app.request(internalRequest(
      `/internal/voice/sessions/${testConversationId}/context`,
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(runtimeContext);

    const missing = dependencies({
      voiceRuntime: {
        ...deps.voiceRuntime,
        findContext: vi.fn(async () => null),
      },
    });
    const missingResponse = await createApi(missing).request(internalRequest(
      `/internal/voice/sessions/${missingConversationId}/context`,
    ));
    expect(missingResponse.status).toBe(404);
    expect(await missingResponse.json()).toEqual({
      error: { code: "VOICE_SESSION_NOT_FOUND" },
    });
  });

  it("回寫逐字稿時由 URL 決定 Conversation，拒絕額外欄位", async () => {
    const deps = dependencies();
    const body = {
      eventId: "event-1",
      turnId: "turn-1",
      role: "USER",
      text: "我想談團隊授權。",
      occurredAt: "2026-08-13T10:01:00+08:00",
    };
    const app = createApi(deps);

    const response = await app.request(internalRequest(
      `/internal/voice/sessions/${testConversationId}/messages`,
      { method: "POST", body: JSON.stringify(body) },
    ));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ sequence: 0 });
    expect(deps.voiceRuntime.appendMessage).toHaveBeenCalledWith(testConversationId, body);

    const tampered = await app.request(internalRequest(
      `/internal/voice/sessions/${testConversationId}/messages`,
      { method: "POST", body: JSON.stringify({ ...body, sequence: 999 }) },
    ));
    expect(tampered.status).toBe(400);
  });

  it("只允許 ACTIVE／ENDED／FAILED 狀態轉移", async () => {
    const deps = dependencies();
    const app = createApi(deps);
    const response = await app.request(internalRequest(
      `/internal/voice/sessions/${testConversationId}/state`,
      { method: "POST", body: JSON.stringify({ state: "ACTIVE" }) },
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(activeState);
    expect(deps.voiceRuntime.transitionState).toHaveBeenCalledWith(
      testConversationId,
      "ACTIVE",
    );

    const invalid = await app.request(internalRequest(
      `/internal/voice/sessions/${testConversationId}/state`,
      { method: "POST", body: JSON.stringify({ state: "CONNECTING" }) },
    ));
    expect(invalid.status).toBe(400);
  });
});
