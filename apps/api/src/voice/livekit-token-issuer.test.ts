import { decodeJwt } from "jose";
import { describe, expect, it } from "vitest";

import { LiveKitTokenIssuer } from "./livekit-token-issuer.js";


describe("LiveKitTokenIssuer", () => {
  it("未提供自訂 ID 產生器時仍可簽發 Token", async () => {
    const issuer = new LiveKitTokenIssuer({
      url: "wss://course.livekit.cloud",
      apiKey: "test-api-key",
      apiSecret: "test-api-secret-at-least-32-bytes",
      agentName: "flying-eagle-voice-agent",
    });

    await expect(issuer.issue({
      conversationId: "conversation-1",
      tenantId: "tenant-1",
      visitorUserId: "user-1",
      personaVersionId: "persona-version-1",
      status: "PENDING",
    })).resolves.toMatchObject({
      url: "wss://course.livekit.cloud",
      conversationId: "conversation-1",
    });
  });

  it("每次使用唯一房名並只放 server-derived metadata", async () => {
    let index = 0;
    const issuer = new LiveKitTokenIssuer({
      url: "wss://course.livekit.cloud",
      apiKey: "test-api-key",
      apiSecret: "test-api-secret-at-least-32-bytes",
      agentName: "flying-eagle-voice-agent",
      idFactory: () => `unique-${++index}`,
    });
    const context = {
      conversationId: "conversation-1",
      tenantId: "tenant-1",
      visitorUserId: "user-1",
      personaVersionId: "persona-version-1",
      status: "PENDING" as const,
    };

    const first = await issuer.issue(context);
    const second = await issuer.issue(context);
    const claims = decodeJwt(first.token);

    expect(first.roomName).not.toBe(second.roomName);
    expect(first.roomName).toContain("conversation-1");
    expect(first.url).toBe("wss://course.livekit.cloud");
    expect(claims.sub).toContain("user-1");
    expect(JSON.parse(String(claims.metadata))).toEqual({
      tenant_id: "tenant-1",
      conversation_id: "conversation-1",
      visitor_user_id: "user-1",
      persona_version_id: "persona-version-1",
    });
  });
});
