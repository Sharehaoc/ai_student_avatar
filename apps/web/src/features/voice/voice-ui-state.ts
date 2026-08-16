import type { BrowserVoiceEvent } from "./livekit-room-adapter.js";
import type { VoiceSessionStatus } from "./livekit-voice-session.js";


export interface TranscriptLine {
  segmentId: string;
  speaker: "AGENT" | "USER";
  text: string;
  final: boolean;
}

export type PipelineIndicatorState = "idle" | "active" | "success" | "error";
export type PipelineStatus = Record<"STT" | "AI" | "TTS", PipelineIndicatorState>;

export const INITIAL_PIPELINE_STATUS: PipelineStatus = {
  STT: "idle",
  AI: "idle",
  TTS: "idle",
};

function setStage(
  current: PipelineStatus,
  stage: keyof PipelineStatus,
  state: PipelineIndicatorState,
): PipelineStatus {
  if (current[stage] === "error" && state !== "error") return current;
  if (stage === "TTS" && current[stage] === "success" && state === "active") return current;
  return { ...current, [stage]: state };
}

export function reducePipelineStatus(
  current: PipelineStatus,
  event: BrowserVoiceEvent,
): PipelineStatus {
  if (event.type === "PIPELINE_ERROR") {
    return setStage(current, event.stage === "LLM" ? "AI" : event.stage, "error");
  }
  if (event.type === "PIPELINE_STATUS") {
    return setStage(current, event.stage === "LLM" ? "AI" : event.stage, event.status);
  }
  if (event.type === "AUDIO_LEVEL" && event.speaker === "USER" && event.level >= 0.02) {
    return setStage(current, "STT", "active");
  }
  if (event.type === "TRANSCRIPT" && event.speaker === "USER" && event.final) {
    return setStage(
      setStage(setStage(current, "STT", "success"), "AI", "active"),
      "TTS",
      "idle",
    );
  }
  if (event.type === "AGENT_STATE" && event.state === "thinking") {
    return setStage(setStage(current, "AI", "active"), "TTS", "idle");
  }
  if (event.type === "AGENT_STATE" && event.state === "speaking") {
    return setStage(setStage(current, "AI", "success"), "TTS", "active");
  }
  if (
    event.type === "AGENT_STATE"
    && event.state === "listening"
    && current.TTS === "active"
  ) {
    return setStage(current, "TTS", "success");
  }
  if (event.type === "PLAYBACK_STATE") {
    if (event.state === "playing") return setStage(current, "TTS", "success");
    if (event.state === "error") return setStage(current, "TTS", "error");
  }
  return current;
}

export function upsertTranscriptLine(
  lines: readonly TranscriptLine[],
  event: Extract<BrowserVoiceEvent, { type: "TRANSCRIPT" }>,
): TranscriptLine[] {
  const next = {
    segmentId: event.segmentId,
    speaker: event.speaker,
    text: event.text,
    final: event.final,
  };
  const existingIndex = lines.findIndex(({ segmentId }) => segmentId === event.segmentId);
  const updated = existingIndex < 0
    ? [...lines, next]
    : lines.map((line, index) => index === existingIndex ? next : line);
  return updated.slice(-200);
}

export function resolveConnectionStatus(
  status: VoiceSessionStatus,
  connectionState: string,
): VoiceSessionStatus {
  const normalizedState = connectionState.trim().toLowerCase();
  if (normalizedState === "reconnecting") {
    return status === "LISTENING" ? "RECONNECTING" : status;
  }
  if (normalizedState === "connected" && status === "RECONNECTING") {
    return "LISTENING";
  }
  return status;
}

export function shouldReportUnexpectedDisconnect(status: VoiceSessionStatus): boolean {
  return status !== "IDLE" && status !== "DISCONNECTING";
}

export function shouldConfirmBeforeSignOut(
  conversationId: string | null,
  sessionStatus: VoiceSessionStatus | undefined,
): boolean {
  return Boolean(conversationId) || (sessionStatus !== undefined && sessionStatus !== "IDLE");
}

export type SpeakingParticipant = "AGENT" | "USER" | null;

export function resolveDominantSpeaker(
  levels: Readonly<Record<"AGENT" | "USER", number>>,
  threshold = 0.02,
): SpeakingParticipant {
  const highest = levels.AGENT >= levels.USER ? "AGENT" : "USER";
  return levels[highest] >= threshold ? highest : null;
}

export function voiceStatusLabel(
  status: VoiceSessionStatus,
  agentState: string,
  speakingParticipant: SpeakingParticipant = null,
): string {
  if (status === "CONNECTING") return "正在安全連線";
  if (status === "RECONNECTING") return "正在重新連線";
  if (status === "PREPARED") return "AI 已就緒";
  if (status === "DISCONNECTING") return "正在結束通話";
  if (status === "ERROR") return "連線需要重試";
  if (status !== "LISTENING") return "等待開始";
  if (agentState === "speaking") return "AI 正在回覆";
  if (speakingParticipant === "USER") return "你正在說話";
  if (agentState === "thinking") return "AI 正在思考";
  return "正在聽你說";
}
