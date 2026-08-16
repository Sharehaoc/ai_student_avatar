import { describe, expect, it } from "vitest";

import { TranscriptEventSchema } from "./index.js";

describe("TranscriptEvent", () => {
  it("用 Conversation、Turn 與 Sequence 將字幕事件固定到唯一位置", () => {
    const event = TranscriptEventSchema.parse({
      eventId: "event-1",
      conversationId: "conversation-1",
      turnId: "turn-2",
      sequence: 2,
      role: "USER",
      text: "我想談團隊授權。",
      final: true,
      occurredAt: "2026-08-13T10:01:00+08:00"
    });

    expect(event.final).toBe(true);
    expect(event.sequence).toBe(2);
  });
});
