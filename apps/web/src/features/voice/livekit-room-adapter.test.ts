import { describe, expect, it, vi } from "vitest";

import {
  BrowserLiveKitRoomAdapter,
  parsePipelineEvent,
  parsePipelineErrorEvent,
  type BrowserVoiceEvent,
  type LiveKitRoomPort,
} from "./livekit-room-adapter.js";
import type { VoiceAudioAnalysisPort, VoiceSpeaker } from "./browser-audio-analysis.js";


class FakeRoom implements LiveKitRoomPort {
  readonly handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  readonly localParticipant = {
    setMicrophoneEnabled: vi.fn(async (): Promise<unknown> => undefined),
  };
  connect = vi.fn(async () => undefined);
  disconnect = vi.fn(async () => undefined);
  startAudio = vi.fn(async () => undefined);

  on(event: string, handler: (...args: unknown[]) => void): this {
    const handlers = this.handlers.get(event) ?? new Set();
    handlers.add(handler);
    this.handlers.set(event, handlers);
    return this;
  }

  off(event: string, handler: (...args: unknown[]) => void): this {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    this.handlers.get(event)?.forEach((handler) => handler(...args));
  }
}

describe("BrowserLiveKitRoomAdapter", () => {
  it("只接受 Voice Agent 固定 topic 的安全管線錯誤事件", () => {
    const payload = new TextEncoder().encode(JSON.stringify({
      version: 1,
      type: "PIPELINE_ERROR",
      stage: "TTS",
      code: "TTS_FAILED",
    }));

    expect(parsePipelineErrorEvent(payload, "flying-eagle.pipeline")).toEqual({
      type: "PIPELINE_ERROR",
      stage: "TTS",
      code: "TTS_FAILED",
    });
    expect(parsePipelineErrorEvent(payload, "attacker-topic")).toBeNull();
    expect(parsePipelineErrorEvent(new TextEncoder().encode(JSON.stringify({
      version: 1,
      type: "PIPELINE_ERROR",
      stage: "TTS",
      code: "provider raw secret",
    })), "flying-eagle.pipeline")).toBeNull();

    expect(parsePipelineEvent(new TextEncoder().encode(JSON.stringify({
      version: 1,
      type: "PIPELINE_STATUS",
      stage: "TTS",
      status: "success",
    })), "flying-eagle.pipeline")).toEqual({
      type: "PIPELINE_STATUS",
      stage: "TTS",
      status: "success",
    });
  });

  it("收到 Agent state 後解除 readiness，並轉送字幕與 speaking 狀態", async () => {
    const room = new FakeRoom();
    const events: BrowserVoiceEvent[] = [];
    const adapter = new BrowserLiveKitRoomAdapter({
      room,
      eventNames: {
        participantAttributesChanged: "attributes",
        transcriptionReceived: "transcription",
        activeSpeakersChanged: "speakers",
        trackSubscribed: "track-subscribed",
        trackUnsubscribed: "track-unsubscribed",
        disconnected: "disconnected",
        connectionStateChanged: "connection",
      },
      subscribe: (event) => events.push(event),
    });

    await adapter.connect("wss://course.livekit.cloud", "token");
    const readiness = adapter.waitForAgentReady(200);
    room.emit("attributes", { "lk.agent.state": "listening" }, {
      identity: "agent-1",
      kind: "agent",
      attributes: { "lk.agent.state": "listening" },
    });
    await readiness;
    room.emit("transcription", [{ id: "segment-1", text: "你好", final: true }], {
      identity: "agent-1",
    });
    room.emit("speakers", [{ identity: "agent-1" }]);

    expect(events).toContainEqual({ type: "AGENT_STATE", state: "listening" });
    expect(events).toContainEqual({
      type: "TRANSCRIPT",
      segmentId: "segment-1",
      participantIdentity: "agent-1",
      speaker: "AGENT",
      text: "你好",
      final: true,
    });
    expect(events).toContainEqual({
      type: "ACTIVE_SPEAKERS",
      participantIdentities: ["agent-1"],
    });
  });

  it("麥克風只透過 LocalParticipant 控制，掛斷時移除監聽", async () => {
    const room = new FakeRoom();
    const adapter = new BrowserLiveKitRoomAdapter({
      room,
      eventNames: {
        participantAttributesChanged: "attributes",
        transcriptionReceived: "transcription",
        activeSpeakersChanged: "speakers",
        trackSubscribed: "track-subscribed",
        trackUnsubscribed: "track-unsubscribed",
        disconnected: "disconnected",
        connectionStateChanged: "connection",
      },
    });

    await adapter.connect("wss://course.livekit.cloud", "token");
    await adapter.publishMicrophone();
    await adapter.setMicrophoneMuted(true);
    await adapter.disconnect();

    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenNthCalledWith(
      1,
      true,
      expect.objectContaining({ echoCancellation: true }),
    );
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenNthCalledWith(2, false);
    expect(room.disconnect).toHaveBeenCalledTimes(1);
    expect([...room.handlers.values()].every((handlers) => handlers.size === 0)).toBe(true);
  });

  it("由 LiveKit 真實音量持續更新目前說話者，停止說話時歸零", async () => {
    const room = new FakeRoom();
    const events: BrowserVoiceEvent[] = [];
    let nextFrame: ((time: number) => void) | undefined;
    const requestAnimationFrame = vi.fn((callback: (time: number) => void) => {
      nextFrame = callback;
      return 1;
    });
    const cancelAnimationFrame = vi.fn();
    const adapter = new BrowserLiveKitRoomAdapter({
      room,
      eventNames: { activeSpeakersChanged: "speakers" },
      requestAnimationFrame,
      cancelAnimationFrame,
      subscribe: (event) => events.push(event),
    });
    const agent = { identity: "agent-1", kind: "agent", audioLevel: 0.24 };

    await adapter.connect("wss://course.livekit.cloud", "token");
    room.emit("speakers", [agent]);
    nextFrame?.(16);
    const firstLevel = events.findLast((event) => (
      event.type === "AUDIO_LEVEL" && event.speaker === "AGENT"
    ));
    expect(firstLevel).toMatchObject({ type: "AUDIO_LEVEL", speaker: "AGENT" });
    expect(firstLevel?.type === "AUDIO_LEVEL" && firstLevel.level).toBeGreaterThan(0);

    agent.audioLevel = 0.81;
    nextFrame?.(32);
    const secondLevel = events.findLast((event) => (
      event.type === "AUDIO_LEVEL" && event.speaker === "AGENT"
    ));
    expect(
      secondLevel?.type === "AUDIO_LEVEL" && secondLevel.level,
    ).toBeGreaterThan(firstLevel?.type === "AUDIO_LEVEL" ? firstLevel.level : 0);

    room.emit("speakers", []);
    expect(events.slice(-2)).toEqual([
      { type: "AUDIO_LEVEL", speaker: "AGENT", level: 0 },
      { type: "AUDIO_LEVEL", speaker: "USER", level: 0 },
    ]);
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it("麥克風發布後改由實際音軌分析器驅動使用者波形", async () => {
    const room = new FakeRoom();
    const events: BrowserVoiceEvent[] = [];
    const attached = new Set<VoiceSpeaker>();
    const audioAnalysis: VoiceAudioAnalysisPort = {
      attach: vi.fn((speaker) => {
        attached.add(speaker);
        return true;
      }),
      detach: vi.fn((speaker) => attached.delete(speaker)),
      hasSource: vi.fn((speaker) => attached.has(speaker)),
      readLevel: vi.fn((speaker, fallback) => speaker === "USER" ? 0.72 : fallback),
      resume: vi.fn(async () => undefined),
      close: vi.fn(async () => attached.clear()),
    };
    let nextFrame: ((time: number) => void) | undefined;
    const requestAnimationFrame = vi.fn((callback: (time: number) => void) => {
      nextFrame = callback;
      return 1;
    });
    const mediaStreamTrack = {} as MediaStreamTrack;
    room.localParticipant.setMicrophoneEnabled.mockResolvedValue({
      track: { mediaStreamTrack },
    });
    const adapter = new BrowserLiveKitRoomAdapter({
      room,
      audioAnalysis,
      requestAnimationFrame,
      cancelAnimationFrame: vi.fn(),
      subscribe: (event) => events.push(event),
    });

    await adapter.connect("wss://course.livekit.cloud", "token");
    await adapter.publishMicrophone();
    nextFrame?.(16);

    expect(audioAnalysis.attach).toHaveBeenCalledWith("USER", mediaStreamTrack);
    const userLevel = events.findLast((event) => (
      event.type === "AUDIO_LEVEL" && event.speaker === "USER"
    ));
    expect(userLevel?.type === "AUDIO_LEVEL" && userLevel.level).toBeGreaterThan(0);
  });
});
