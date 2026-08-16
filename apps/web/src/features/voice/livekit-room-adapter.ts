import {
  ParticipantKind,
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type TranscriptionSegment,
} from "livekit-client";

import type { LiveKitRoomAdapter } from "./livekit-voice-session.js";
import { normalizeVoiceLevel, smoothAudioLevel } from "./audio-level.js";
import {
  BrowserVoiceAudioAnalysis,
  type VoiceAudioAnalysisPort,
  type VoiceSpeaker,
} from "./browser-audio-analysis.js";


export type AgentState = "initializing" | "listening" | "thinking" | "speaking" | "unknown";

export type BrowserVoiceEvent =
  | { type: "CONNECTION_STATE"; state: string }
  | { type: "DISCONNECTED"; reason: string | null }
  | { type: "AGENT_STATE"; state: AgentState }
  | {
      type: "TRANSCRIPT";
      segmentId: string;
      participantIdentity: string | null;
      speaker: "AGENT" | "USER";
      text: string;
      final: boolean;
    }
  | {
      type: "PIPELINE_STATUS";
      stage: "STT" | "LLM" | "TTS";
      status: "success";
    }
  | { type: "ACTIVE_SPEAKERS"; participantIdentities: string[] }
  | { type: "AUDIO_LEVEL"; speaker: "AGENT" | "USER"; level: number }
  | {
      type: "PIPELINE_ERROR";
      stage: "STT" | "LLM" | "TTS";
      code: "STT_FAILED" | "LLM_FAILED" | "TTS_FAILED";
    }
  | { type: "PLAYBACK_STATE"; state: "playing" | "waiting" | "ended" | "error" };

interface ParticipantPort {
  identity: string;
  audioLevel?: number;
  kind?: unknown;
  isAgent?: boolean;
  attributes?: Readonly<Record<string, string>>;
}

interface RemoteTrackPort {
  kind?: unknown;
  mediaStreamTrack?: MediaStreamTrack;
  attach?: () => HTMLMediaElement;
  detach?: () => HTMLMediaElement[];
}

interface LocalTrackPublicationPort {
  track?: RemoteTrackPort;
}

export interface LiveKitRoomPort {
  readonly localParticipant: {
    setMicrophoneEnabled(
      enabled: boolean,
      options?: { echoCancellation?: boolean; noiseSuppression?: boolean; autoGainControl?: boolean },
    ): Promise<unknown>;
  };
  readonly remoteParticipants?: ReadonlyMap<string, ParticipantPort>;
  connect(url: string, token: string): Promise<void>;
  disconnect(): Promise<void>;
  startAudio(): Promise<void>;
  on(event: string, handler: (...args: unknown[]) => void): this;
  off(event: string, handler: (...args: unknown[]) => void): this;
}

export interface LiveKitEventNames {
  participantConnected: string;
  participantAttributesChanged: string;
  transcriptionReceived: string;
  activeSpeakersChanged: string;
  trackSubscribed: string;
  trackUnsubscribed: string;
  disconnected: string;
  connectionStateChanged: string;
  dataReceived: string;
}

export interface BrowserLiveKitRoomAdapterOptions {
  room?: LiveKitRoomPort;
  eventNames?: Partial<LiveKitEventNames>;
  subscribe?: (event: BrowserVoiceEvent) => void;
  audioContainer?: HTMLElement;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame?: (handle: number) => void;
  audioAnalysis?: VoiceAudioAnalysisPort;
}

interface ReadinessWaiter {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const DEFAULT_EVENT_NAMES: LiveKitEventNames = {
  participantConnected: RoomEvent.ParticipantConnected,
  participantAttributesChanged: RoomEvent.ParticipantAttributesChanged,
  transcriptionReceived: RoomEvent.TranscriptionReceived,
  activeSpeakersChanged: RoomEvent.ActiveSpeakersChanged,
  trackSubscribed: RoomEvent.TrackSubscribed,
  trackUnsubscribed: RoomEvent.TrackUnsubscribed,
  disconnected: RoomEvent.Disconnected,
  connectionStateChanged: RoomEvent.ConnectionStateChanged,
  dataReceived: RoomEvent.DataReceived,
};

const PIPELINE_EVENT_TOPIC = "flying-eagle.pipeline";
const PIPELINE_CODES = {
  STT: "STT_FAILED",
  LLM: "LLM_FAILED",
  TTS: "TTS_FAILED",
} as const;

export function parsePipelineEvent(
  payload: Uint8Array,
  topic: unknown,
): Extract<BrowserVoiceEvent, { type: "PIPELINE_ERROR" | "PIPELINE_STATUS" }> | null {
  if (topic !== PIPELINE_EVENT_TOPIC || payload.byteLength === 0 || payload.byteLength > 1_024) {
    return null;
  }
  try {
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payload)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const event = parsed as Record<string, unknown>;
    if (event.version !== 1 || !["STT", "LLM", "TTS"].includes(String(event.stage))) {
      return null;
    }
    const stage = event.stage as keyof typeof PIPELINE_CODES;
    if (event.type === "PIPELINE_ERROR") {
      if (
        Object.keys(event).sort().join(",") !== "code,stage,type,version"
        || event.code !== PIPELINE_CODES[stage]
      ) return null;
      return { type: "PIPELINE_ERROR", stage, code: PIPELINE_CODES[stage] };
    }
    if (
      event.type === "PIPELINE_STATUS"
      && Object.keys(event).sort().join(",") === "stage,status,type,version"
      && event.status === "success"
    ) {
      return { type: "PIPELINE_STATUS", stage, status: "success" };
    }
    return null;
  } catch {
    return null;
  }
}

export function parsePipelineErrorEvent(
  payload: Uint8Array,
  topic: unknown,
): Extract<BrowserVoiceEvent, { type: "PIPELINE_ERROR" }> | null {
  const event = parsePipelineEvent(payload, topic);
  return event?.type === "PIPELINE_ERROR" ? event : null;
}

const READY_AGENT_STATES = new Set(["listening", "thinking", "speaking"]);

function normalizeAgentState(value: unknown): AgentState {
  if (["initializing", "listening", "thinking", "speaking"].includes(String(value))) {
    return String(value) as AgentState;
  }
  return "unknown";
}

function isAgent(participant: ParticipantPort): boolean {
  return participant.isAgent === true
    || participant.kind === ParticipantKind.AGENT
    || String(participant.kind).toLowerCase() === "agent";
}

export class BrowserLiveKitRoomAdapter implements LiveKitRoomAdapter {
  readonly #room: LiveKitRoomPort;
  readonly #eventNames: LiveKitEventNames;
  readonly #subscribe: ((event: BrowserVoiceEvent) => void) | undefined;
  readonly #audioContainer: HTMLElement | undefined;
  readonly #requestAnimationFrame: ((callback: FrameRequestCallback) => number) | undefined;
  readonly #cancelAnimationFrame: ((handle: number) => void) | undefined;
  readonly #audioAnalysis: VoiceAudioAnalysisPort;
  readonly #handlers = new Map<string, (...args: unknown[]) => void>();
  readonly #audioElements = new Set<HTMLMediaElement>();
  readonly #readinessWaiters = new Set<ReadinessWaiter>();
  readonly #agentIdentities = new Set<string>();
  #activeSpeakers: ParticipantPort[] = [];
  #fallbackLevels: Record<VoiceSpeaker, number> = { AGENT: 0, USER: 0 };
  #displayedLevels: Record<VoiceSpeaker, number> = { AGENT: 0, USER: 0 };
  #animationFrame: number | null = null;
  #lastFrameTime: number | null = null;
  #agentReady = false;
  #wired = false;

  constructor(options: BrowserLiveKitRoomAdapterOptions = {}) {
    this.#room = options.room ?? new Room({
      adaptiveStream: true,
      dynacast: true,
      stopLocalTrackOnUnpublish: true,
    }) as unknown as LiveKitRoomPort;
    this.#eventNames = { ...DEFAULT_EVENT_NAMES, ...options.eventNames };
    this.#subscribe = options.subscribe;
    this.#audioContainer = options.audioContainer;
    this.#requestAnimationFrame = options.requestAnimationFrame
      ?? (typeof window === "undefined" ? undefined : window.requestAnimationFrame.bind(window));
    this.#cancelAnimationFrame = options.cancelAnimationFrame
      ?? (typeof window === "undefined" ? undefined : window.cancelAnimationFrame.bind(window));
    this.#audioAnalysis = options.audioAnalysis ?? new BrowserVoiceAudioAnalysis();
  }

  async connect(url: string, token: string): Promise<void> {
    this.#agentReady = false;
    this.#wireEvents();
    await this.#room.connect(url, token);
    this.#room.remoteParticipants?.forEach((participant) => this.#observeAgent(participant));
  }

  async activateAudio(): Promise<void> {
    await this.#room.startAudio();
    await this.#audioAnalysis.resume();
  }

  async waitForAgentReady(timeoutMs: number): Promise<void> {
    if (this.#agentReady) return;
    await new Promise<void>((resolve, reject) => {
      const waiter: ReadinessWaiter = {
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.#readinessWaiters.delete(waiter);
          reject(new Error("等待 Voice Agent 就緒逾時"));
        }, timeoutMs),
      };
      this.#readinessWaiters.add(waiter);
    });
  }

  async publishMicrophone(): Promise<void> {
    const publication = await this.#room.localParticipant.setMicrophoneEnabled(true, {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
    const track = (publication as LocalTrackPublicationPort | undefined)?.track;
    if (track?.mediaStreamTrack) {
      this.#audioAnalysis.attach("USER", track.mediaStreamTrack);
      await this.#audioAnalysis.resume();
      this.#scheduleAudioLevelFrame();
    }
  }

  async setMicrophoneMuted(muted: boolean): Promise<void> {
    await this.#room.localParticipant.setMicrophoneEnabled(!muted);
  }

  async disconnect(): Promise<void> {
    this.#rejectReadinessWaiters(new Error("LiveKit Room 已斷線"));
    this.#detachAllAudio();
    this.#unwireEvents();
    this.#agentIdentities.clear();
    await this.#audioAnalysis.close();
    this.#replaceActiveSpeakers([]);
    this.#agentReady = false;
    await this.#room.disconnect();
  }

  #emit(event: BrowserVoiceEvent): void {
    this.#subscribe?.(event);
  }

  #markAgentReady(): void {
    if (this.#agentReady) return;
    this.#agentReady = true;
    for (const waiter of this.#readinessWaiters) {
      clearTimeout(waiter.timeout);
      waiter.resolve();
    }
    this.#readinessWaiters.clear();
  }

  #rejectReadinessWaiters(error: Error): void {
    for (const waiter of this.#readinessWaiters) {
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }
    this.#readinessWaiters.clear();
  }

  #observeAgent(participant: ParticipantPort, changed?: Record<string, string>): void {
    if (!isAgent(participant)) return;
    this.#agentIdentities.add(participant.identity);
    const state = normalizeAgentState(
      changed?.["lk.agent.state"] ?? participant.attributes?.["lk.agent.state"],
    );
    this.#emit({ type: "AGENT_STATE", state });
    if (READY_AGENT_STATES.has(state)) this.#markAgentReady();
  }

  #attachAudio(track: RemoteTrackPort, participant?: ParticipantPort): void {
    if (track.kind !== Track.Kind.Audio || !track.attach) return;
    const element = track.attach();
    element.autoplay = true;
    element.setAttribute("data-flying-eagle-voice-audio", "true");
    element.addEventListener("playing", () => {
      this.#emit({ type: "PLAYBACK_STATE", state: "playing" });
    });
    for (const eventName of ["waiting", "stalled"] as const) {
      element.addEventListener(eventName, () => {
        this.#emit({ type: "PLAYBACK_STATE", state: "waiting" });
      });
    }
    element.addEventListener("ended", () => {
      this.#emit({ type: "PLAYBACK_STATE", state: "ended" });
    });
    element.addEventListener("error", () => {
      this.#emit({ type: "PLAYBACK_STATE", state: "error" });
    });
    (this.#audioContainer ?? document.body).appendChild(element);
    this.#audioElements.add(element);
    if (track.mediaStreamTrack) {
      const speaker = participant && !isAgent(participant)
        && !this.#agentIdentities.has(participant.identity) ? "USER" : "AGENT";
      this.#audioAnalysis.attach(speaker, track.mediaStreamTrack);
      this.#scheduleAudioLevelFrame();
    }
  }

  #detachAudio(track: RemoteTrackPort, participant?: ParticipantPort): void {
    for (const element of track.detach?.() ?? []) {
      element.remove();
      this.#audioElements.delete(element);
    }
    if (track.mediaStreamTrack) {
      const speaker = participant && !isAgent(participant)
        && !this.#agentIdentities.has(participant.identity) ? "USER" : "AGENT";
      this.#audioAnalysis.detach(speaker, track.mediaStreamTrack);
    }
    if (!this.#hasAudioLevelSource()) this.#stopAudioLevelFramesAndReset();
  }

  #detachAllAudio(): void {
    for (const element of this.#audioElements) element.remove();
    this.#audioElements.clear();
  }

  #updateFallbackLevels(): void {
    const levels: Record<"AGENT" | "USER", number> = { AGENT: 0, USER: 0 };
    for (const participant of this.#activeSpeakers) {
      const speaker = isAgent(participant) || this.#agentIdentities.has(participant.identity)
        ? "AGENT"
        : "USER";
      levels[speaker] = Math.max(levels[speaker], normalizeVoiceLevel(participant.audioLevel));
    }
    this.#fallbackLevels = levels;
  }

  #hasAudioLevelSource(): boolean {
    return this.#activeSpeakers.length > 0
      || this.#audioAnalysis.hasSource("AGENT")
      || this.#audioAnalysis.hasSource("USER");
  }

  #emitAudioLevels(frameTime: number): void {
    const elapsedMs = this.#lastFrameTime === null
      ? 16
      : Math.max(frameTime - this.#lastFrameTime, 0);
    this.#lastFrameTime = frameTime;
    for (const speaker of ["AGENT", "USER"] as const) {
      const target = this.#audioAnalysis.readLevel(speaker, this.#fallbackLevels[speaker]);
      const level = smoothAudioLevel(this.#displayedLevels[speaker], target, elapsedMs);
      this.#displayedLevels[speaker] = level;
      this.#emit({ type: "AUDIO_LEVEL", speaker, level });
    }
  }

  #scheduleAudioLevelFrame(): void {
    if (!this.#requestAnimationFrame || this.#animationFrame !== null) return;
    this.#animationFrame = this.#requestAnimationFrame((frameTime) => {
      this.#animationFrame = null;
      if (!this.#hasAudioLevelSource()) return;
      this.#emitAudioLevels(frameTime);
      if (this.#hasAudioLevelSource()) this.#scheduleAudioLevelFrame();
    });
  }

  #resetAudioLevels(): void {
    this.#fallbackLevels = { AGENT: 0, USER: 0 };
    this.#displayedLevels = { AGENT: 0, USER: 0 };
    this.#lastFrameTime = null;
    this.#emit({ type: "AUDIO_LEVEL", speaker: "AGENT", level: 0 });
    this.#emit({ type: "AUDIO_LEVEL", speaker: "USER", level: 0 });
  }

  #stopAudioLevelFramesAndReset(): void {
    if (this.#animationFrame !== null) {
      this.#cancelAnimationFrame?.(this.#animationFrame);
      this.#animationFrame = null;
    }
    this.#resetAudioLevels();
  }

  #replaceActiveSpeakers(speakers: ParticipantPort[]): void {
    this.#activeSpeakers = speakers;
    this.#updateFallbackLevels();
    if (!this.#hasAudioLevelSource()) this.#stopAudioLevelFramesAndReset();
    else this.#scheduleAudioLevelFrame();
  }

  #wireEvents(): void {
    if (this.#wired) return;
    const handlers: Record<keyof LiveKitEventNames, (...args: unknown[]) => void> = {
      participantConnected: (participant) => this.#observeAgent(participant as ParticipantPort),
      participantAttributesChanged: (changed, participant) => {
        this.#observeAgent(
          participant as ParticipantPort,
          changed as Record<string, string>,
        );
      },
      transcriptionReceived: (segments, participant) => {
        const transcriptParticipant = participant as ParticipantPort | undefined;
        const participantIdentity = transcriptParticipant?.identity ?? null;
        for (const segment of segments as TranscriptionSegment[]) {
          const text = segment.text.trim();
          if (!text) continue;
          this.#emit({
            type: "TRANSCRIPT",
            segmentId: segment.id,
            participantIdentity,
            speaker: transcriptParticipant && (
              isAgent(transcriptParticipant)
              || this.#agentIdentities.has(transcriptParticipant.identity)
            ) ? "AGENT" : "USER",
            text,
            final: segment.final,
          });
        }
      },
      activeSpeakersChanged: (speakers) => {
        const activeSpeakers = speakers as ParticipantPort[];
        this.#emit({
          type: "ACTIVE_SPEAKERS",
          participantIdentities: activeSpeakers.map(({ identity }) => identity),
        });
        this.#replaceActiveSpeakers(activeSpeakers);
      },
      trackSubscribed: (track, _publication, participant) => this.#attachAudio(
        track as RemoteTrack,
        participant as ParticipantPort | undefined,
      ),
      trackUnsubscribed: (track, _publication, participant) => this.#detachAudio(
        track as RemoteTrack,
        participant as ParticipantPort | undefined,
      ),
      disconnected: (reason) => {
        this.#replaceActiveSpeakers([]);
        this.#emit({ type: "DISCONNECTED", reason: reason == null ? null : String(reason) });
        this.#rejectReadinessWaiters(new Error("LiveKit Room 在 Agent 就緒前斷線"));
      },
      connectionStateChanged: (state) => {
        this.#emit({ type: "CONNECTION_STATE", state: String(state) });
      },
      dataReceived: (payload, participant, _kind, topic) => {
        const sender = participant as ParticipantPort | undefined;
        if (!sender || (!isAgent(sender) && !this.#agentIdentities.has(sender.identity))) return;
        const event = parsePipelineEvent(payload as Uint8Array, topic);
        if (event) this.#emit(event);
      },
    };
    for (const name of Object.keys(handlers) as (keyof LiveKitEventNames)[]) {
      const eventName = this.#eventNames[name];
      const handler = handlers[name];
      this.#handlers.set(eventName, handler);
      this.#room.on(eventName, handler);
    }
    this.#wired = true;
  }

  #unwireEvents(): void {
    for (const [eventName, handler] of this.#handlers) {
      this.#room.off(eventName, handler);
    }
    this.#handlers.clear();
    this.#wired = false;
  }
}
