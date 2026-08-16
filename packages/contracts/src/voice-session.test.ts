import { describe, expect, it } from "vitest";

import { VoiceSessionRequestSchema, VoiceTokenResponseSchema } from "./index.js";

describe("VoiceSessionRequest", () => {
  it("瀏覽器只能指定已授權的 Conversation，不能自選 Tenant 或 Voice ID", () => {
    const conversationId = "22222222-2222-4222-8222-222222222222";
    expect(VoiceSessionRequestSchema.parse({ conversationId }))
      .toEqual({ conversationId });

    expect(VoiceSessionRequestSchema.safeParse({
      conversationId,
      tenantId: "another-student",
      voiceId: "another-voice"
    }).success).toBe(false);
    expect(VoiceSessionRequestSchema.safeParse({
      conversationId: "not-a-uuid",
    }).success).toBe(false);
  });
});

describe("VoiceTokenResponse", () => {
  it("只接受安全 WebSocket URL 與對應 Conversation", () => {
    const parsed = VoiceTokenResponseSchema.parse({
      token: "signed-token",
      url: "wss://course.livekit.cloud",
      roomName: "eagle-conversation-1-random",
      conversationId: "conversation-1",
    });

    expect(parsed.conversationId).toBe("conversation-1");
  });

  it("拒絕非加密 LiveKit URL", () => {
    expect(() => VoiceTokenResponseSchema.parse({
      token: "signed-token",
      url: "ws://course.livekit.cloud",
      roomName: "room-1",
      conversationId: "conversation-1",
    })).toThrow();
  });
});
