import { describe, expect, it } from "vitest";

import { PersonaSchema, PersonaVersionSchema } from "./index.js";

describe("Persona 版本", () => {
  it("將可變的 System Prompt 放在不可變的版本紀錄", () => {
    const persona = PersonaSchema.parse({
      id: "persona-1",
      tenantId: "student-1",
      displayName: "Limon AI 教練",
      description: "協助來訪者拆解問題。",
      activeVersionId: "persona-version-2",
      published: true,
      createdAt: "2026-08-13T10:00:00+08:00",
      updatedAt: "2026-08-13T10:05:00+08:00"
    });
    const version = PersonaVersionSchema.parse({
      id: "persona-version-2",
      tenantId: "student-1",
      personaId: persona.id,
      version: 2,
      systemPrompt: "你是 Limon AI 教練，回覆要清楚且具體。",
      openingMessage: "嗨，今天想先處理哪件事？",
      voice: {
        provider: "minimax",
        voiceId: "voice-clone-1",
        model: "speech-2.6-hd"
      },
      createdByUserId: "student-1",
      createdAt: "2026-08-13T10:05:00+08:00"
    });

    expect(version.personaId).toBe(persona.id);
    expect(version.version).toBe(2);
  });

  it("拒絕空白 System Prompt", () => {
    const result = PersonaVersionSchema.safeParse({
      id: "persona-version-2",
      tenantId: "student-1",
      personaId: "persona-1",
      version: 2,
      systemPrompt: "   ",
      openingMessage: "嗨",
      voice: {
        provider: "minimax",
        voiceId: "voice-clone-1",
        model: "speech-2.6-hd"
      },
      createdByUserId: "student-1",
      createdAt: "2026-08-13T10:05:00+08:00"
    });

    expect(result.success).toBe(false);
  });

  it("將每個 Voice ID 的發音修正表固定在 Persona Version", () => {
    const version = PersonaVersionSchema.parse({
      id: "persona-version-3",
      tenantId: "student-1",
      personaId: "persona-1",
      version: 3,
      systemPrompt: "你是學生定義的 AI 分身。",
      openingMessage: "嗨",
      voice: {
        provider: "minimax",
        voiceId: "voice-clone-1",
        model: "speech-2.6-hd"
      },
      pronunciationFixes: {
        "飛鷹": "飛英"
      },
      createdByUserId: "student-1",
      createdAt: "2026-08-13T10:05:00+08:00"
    });

    expect(version.pronunciationFixes).toEqual({ "飛鷹": "飛英" });
  });
});
