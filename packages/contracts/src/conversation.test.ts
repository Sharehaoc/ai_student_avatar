import { describe, expect, it } from "vitest";

import {
  ConversationRecordSchema,
  ConversationStatusResponseSchema,
  CreateConversationRequestSchema,
  CreateConversationResponseSchema,
} from "./index.js";

describe("ConversationRecord", () => {
  it("訪客建立通話時只能指定公開 Persona ID", () => {
    const personaId = "11111111-1111-4111-8111-111111111111";
    expect(CreateConversationRequestSchema.parse({ personaId }))
      .toEqual({ personaId });
    expect(() => CreateConversationRequestSchema.parse({
      personaId,
      voiceId: "attacker-voice",
    })).toThrow();
    expect(CreateConversationRequestSchema.safeParse({
      personaId: "not-a-uuid",
    }).success).toBe(false);

    expect(CreateConversationResponseSchema.parse({
      conversationId: "conversation-1",
      personaDisplayName: "Limon 的 AI 分身",
      personaDescription: "陪你把問題想清楚。",
    }).conversationId).toBe("conversation-1");
  });

  it("在對話建立時固定當次 Persona Prompt 與 Voice Snapshot", () => {
    const conversation = ConversationRecordSchema.parse({
      id: "conversation-1",
      tenantId: "student-1",
      visitorUserId: "visitor-1",
      personaId: "persona-1",
      personaVersionId: "persona-version-3",
      status: "PENDING",
      startedAt: "2026-08-13T10:00:00+08:00",
      connectedAt: null,
      endedAt: null,
      durationSeconds: 0,
      promptSnapshot: {
        personaVersionId: "persona-version-3",
        systemPrompt: "你是學生定義的 AI 分身。",
        openingMessage: "嗨，今天想聊什麼？",
        pronunciationFixes: {
          "飛鷹": "飛英"
        }
      },
      voiceSnapshot: {
        provider: "minimax",
        voiceId: "voice-clone-1",
        model: "speech-2.6-hd"
      },
      summary: null,
      createdAt: "2026-08-13T10:00:00+08:00"
    });

    expect(conversation.promptSnapshot.systemPrompt).toContain("AI 分身");
    expect(conversation.promptSnapshot.pronunciationFixes).toEqual({ "飛鷹": "飛英" });
    expect(conversation.voiceSnapshot.voiceId).toBe("voice-clone-1");
  });

  it("保存確認狀態不會夾帶使用者或 Persona 資料", () => {
    expect(ConversationStatusResponseSchema.parse({
      conversationId: "conversation-1",
      status: "ENDED",
      durationSeconds: 72,
    })).toEqual({
      conversationId: "conversation-1",
      status: "ENDED",
      durationSeconds: 72,
    });

    expect(() => ConversationStatusResponseSchema.parse({
      conversationId: "conversation-1",
      status: "ENDED",
      durationSeconds: 72,
      visitorUserId: "user-1",
    })).toThrow();
  });
});
