import { z } from "zod";

export const EntityIdSchema = z.string().trim().min(1).max(128);
export const UuidSchema = z.uuid();
export const TimestampSchema = z.iso.datetime({ offset: true });

export const VoiceSnapshotSchema = z.object({
  provider: z.literal("minimax"),
  voiceId: z.string().trim().min(1).max(256),
  model: z.string().trim().min(1).max(128),
}).strict();

const BLOCKED_VOICE_IDS = new Set([
  "placeholder",
  "replace-me",
  "student-voice-clone",
  "your-voice-id",
]);

export function isUsableVoiceId(voiceId: string): boolean {
  return !BLOCKED_VOICE_IDS.has(voiceId.trim().toLowerCase());
}

export const RuntimeVoiceSnapshotSchema = VoiceSnapshotSchema.refine(
  (voice) => isUsableVoiceId(voice.voiceId),
  { message: "Voice ID 尚未設定" },
);

export type VoiceSnapshot = z.infer<typeof VoiceSnapshotSchema>;
