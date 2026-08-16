import { describe, expect, it } from "vitest";

import {
  VoiceRuntimeContextSchema,
  VoiceRuntimeMessageRequestSchema,
  VoiceRuntimeStateRequestSchema,
} from "./index.js";


describe("VoiceRuntimeContext", () => {
  it("只讓 Worker 收到當次 Conversation 已固定的人格與聲音快照", () => {
    const context = VoiceRuntimeContextSchema.parse({
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
    });

    expect(context.voice.voiceId).toBe("voice-clone-1");
    expect(context.pronunciationFixes).toEqual({ "飛鷹": "飛英" });
  });

  it("拒絕課程佔位 Voice ID，避免對話到 TTS 才靜默失敗", () => {
    expect(VoiceRuntimeContextSchema.safeParse({
      conversationId: "conversation-1",
      tenantId: "tenant-1",
      visitorUserId: "user-1",
      personaVersionId: "persona-version-1",
      systemPrompt: "你是學生定義的 AI 分身。",
      openingMessage: "嗨，今天想聊什麼？",
      voice: {
        provider: "minimax",
        voiceId: "student-voice-clone",
        model: "speech-2.6-hd",
      },
      pronunciationFixes: {},
      maxDurationSeconds: 1_800,
    }).success).toBe(false);
  });
});

describe("VoiceRuntimeMessageRequest", () => {
  it("只接受最終訊息必要欄位，Conversation 與 sequence 由 Core 決定", () => {
    const request = VoiceRuntimeMessageRequestSchema.parse({
      eventId: "event-1",
      turnId: "turn-1",
      role: "USER",
      text: "我想談團隊授權。",
      occurredAt: "2026-08-13T10:01:00+08:00",
    });

    expect(request.role).toBe("USER");
    expect(VoiceRuntimeMessageRequestSchema.safeParse({
      ...request,
      conversationId: "attacker-selected-conversation",
      sequence: 999,
    }).success).toBe(false);
  });
});

describe("VoiceRuntimeStateRequest", () => {
  it("只允許 Worker 回報可審計的三種 runtime 狀態", () => {
    expect(VoiceRuntimeStateRequestSchema.parse({ state: "ACTIVE" }))
      .toEqual({ state: "ACTIVE" });
    expect(VoiceRuntimeStateRequestSchema.safeParse({ state: "CONNECTING" }).success)
      .toBe(false);
  });
});
