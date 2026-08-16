import { describe, expect, it, vi } from "vitest";

import {
  LiveKitVoiceSession,
  type LiveKitRoomAdapter,
  type VoiceTokenProvider,
} from "./livekit-voice-session.js";

const conversationId = "22222222-2222-4222-8222-222222222222";
const otherConversationId = "44444444-4444-4444-8444-444444444444";

describe("LiveKitVoiceSession", () => {
  it("併發開始通話時只連一個 Room 並發布一次麥克風", async () => {
    const room: LiveKitRoomAdapter = {
      connect: vi.fn(async () => undefined),
      publishMicrophone: vi.fn(async () => undefined),
      setMicrophoneMuted: vi.fn(async () => undefined),
      disconnect: vi.fn(async () => undefined),
    };
    const tokenProvider: VoiceTokenProvider = vi.fn(async () => ({
      token: "signed-livekit-token",
      url: "wss://example.livekit.cloud",
      roomName: "eagle-student-1-conversation-1",
      conversationId,
    }));
    const session = new LiveKitVoiceSession({ room, tokenProvider });

    await Promise.all([
      session.start(conversationId),
      session.start(conversationId),
    ]);

    expect(tokenProvider).toHaveBeenCalledTimes(1);
    expect(room.connect).toHaveBeenCalledTimes(1);
    expect(room.publishMicrophone).toHaveBeenCalledTimes(1);
    expect(session.status).toBe("LISTENING");
  });

  it("將靜音與掛斷交給 Room Adapter，掛斷後回到 IDLE", async () => {
    const room: LiveKitRoomAdapter = {
      connect: vi.fn(async () => undefined),
      publishMicrophone: vi.fn(async () => undefined),
      setMicrophoneMuted: vi.fn(async () => undefined),
      disconnect: vi.fn(async () => undefined),
    };
    const tokenProvider: VoiceTokenProvider = vi.fn(async () => ({
      token: "signed-livekit-token",
      url: "wss://example.livekit.cloud",
      roomName: "eagle-student-1-conversation-1",
      conversationId,
    }));
    const session = new LiveKitVoiceSession({ room, tokenProvider });

    await session.start(conversationId);
    await session.setMuted(true);
    await session.disconnect();

    expect(room.setMicrophoneMuted).toHaveBeenCalledWith(true);
    expect(room.disconnect).toHaveBeenCalledTimes(1);
    expect(session.status).toBe("IDLE");
  });

  it("拒絕 API 回傳不同 Conversation 的 Token", async () => {
    const room: LiveKitRoomAdapter = {
      connect: vi.fn(async () => undefined),
      publishMicrophone: vi.fn(async () => undefined),
      setMicrophoneMuted: vi.fn(async () => undefined),
      disconnect: vi.fn(async () => undefined),
    };
    const tokenProvider: VoiceTokenProvider = vi.fn(async () => ({
      token: "signed-livekit-token",
      url: "wss://example.livekit.cloud",
      roomName: "wrong-room",
      conversationId: otherConversationId,
    }));
    const session = new LiveKitVoiceSession({ room, tokenProvider });

    await expect(session.start(conversationId)).rejects.toThrow(
      "Conversation 不一致",
    );
    expect(room.connect).not.toHaveBeenCalled();
  });

  it("麥克風發布失敗會清掉半連線狀態，讓使用者可以重新開始", async () => {
    const room: LiveKitRoomAdapter = {
      connect: vi.fn(async () => undefined),
      publishMicrophone: vi
        .fn<() => Promise<void>>()
        .mockRejectedValueOnce(new Error("microphone unavailable"))
        .mockResolvedValueOnce(undefined),
      setMicrophoneMuted: vi.fn(async () => undefined),
      disconnect: vi.fn(async () => undefined),
    };
    const tokenProvider: VoiceTokenProvider = vi.fn(async () => ({
      token: "signed-livekit-token",
      url: "wss://example.livekit.cloud",
      roomName: "eagle-student-1-conversation-1",
      conversationId,
    }));
    const session = new LiveKitVoiceSession({ room, tokenProvider });

    await expect(session.start(conversationId)).rejects.toThrow(
      "microphone unavailable",
    );
    expect(session.status).toBe("ERROR");
    expect(room.disconnect).toHaveBeenCalledTimes(1);

    await session.start(conversationId);

    expect(tokenProvider).toHaveBeenCalledTimes(2);
    expect(room.connect).toHaveBeenCalledTimes(2);
    expect(room.publishMicrophone).toHaveBeenCalledTimes(2);
    expect(session.status).toBe("LISTENING");
  });
});
