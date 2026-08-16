import { describe, expect, it } from "vitest";

import {
  OwnerPersonaDraftInputSchema,
  OwnerStudioResponseSchema,
  PublicPersonaResponseSchema,
  DeleteConversationResponseSchema,
  VisitorActivityRequestSchema,
} from "./index.js";


const draftInput = {
  displayName: "Limon 的 AI 分身",
  description: "陪你釐清下一步。",
  systemPrompt: "請使用台灣繁體中文回覆。",
  openingMessage: "嗨，今天想先聊什麼？",
};

const serverManagedVoice = {
  voice: {
    provider: "minimax" as const,
    voiceId: "voice-clone-1",
    model: "speech-2.6-hd",
  },
  pronunciationFixes: { "飛鷹": "飛英" },
};

describe("學員管理後臺契約", () => {
  it("草稿只接受人格欄位，不接受瀏覽器指定聲音身份", () => {
    expect(OwnerPersonaDraftInputSchema.parse(draftInput)).toEqual(draftInput);
    expect(OwnerPersonaDraftInputSchema.safeParse({
      ...draftInput,
      tenantId: "attacker-tenant",
    }).success).toBe(false);
    expect(OwnerPersonaDraftInputSchema.safeParse({
      ...draftInput,
      ...serverManagedVoice,
    }).success).toBe(false);
  });

  it("總覽明確區分草稿、目前公開版本與真實訪客資料", () => {
    const result = OwnerStudioResponseSchema.parse({
      persona: {
        id: "persona-1",
        tenantId: "tenant-1",
        ...draftInput,
        ...serverManagedVoice,
        avatarUrl: null,
        published: true,
        activeVersion: 3,
        updatedAt: "2026-08-14T10:00:00+08:00",
      },
      personaVersions: [{
        id: "version-3",
        version: 3,
        systemPrompt: draftInput.systemPrompt,
        openingMessage: draftInput.openingMessage,
        voice: serverManagedVoice.voice,
        pronunciationFixes: serverManagedVoice.pronunciationFixes,
        createdAt: "2026-08-14T09:30:00+08:00",
        active: true,
      }],
      visitors: [{
        id: "visitor-1",
        displayName: "訪客",
        email: "visitor@example.com",
        createdAt: "2026-08-14T09:00:00+08:00",
        lastUsedAt: "2026-08-14T10:00:00+08:00",
        conversationCount: 2,
      }],
      conversations: [],
    });

    expect(result.persona.activeVersion).toBe(3);
    expect(result.visitors[0]?.conversationCount).toBe(2);
    expect(result.personaVersions[0]?.active).toBe(true);
  });

  it("公開通話頁只取得公開展示需要的資料", () => {
    const result = PublicPersonaResponseSchema.safeParse({
      id: "persona-1",
      displayName: "Limon 的 AI 分身",
      description: "陪你釐清下一步。",
      avatarUrl: null,
      systemPrompt: "不應外洩",
    });

    expect(result.success).toBe(false);
  });

  it("訪客登入活動只能指定公開 Persona，不接受自行指定 tenant 或 role", () => {
    const personaId = "11111111-1111-4111-8111-111111111111";
    expect(VisitorActivityRequestSchema.parse({ personaId }))
      .toEqual({ personaId });
    expect(VisitorActivityRequestSchema.safeParse({
      personaId,
      role: "OWNER",
    }).success).toBe(false);
    expect(VisitorActivityRequestSchema.safeParse({
      personaId: "not-a-uuid",
    }).success).toBe(false);
  });

  it("刪除對話回應固定回傳被刪除的 conversationId", () => {
    expect(DeleteConversationResponseSchema.parse({
      conversationId: "conversation-1",
      deleted: true,
    })).toEqual({ conversationId: "conversation-1", deleted: true });
  });
});
