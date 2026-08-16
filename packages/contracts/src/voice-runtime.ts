import { z } from "zod";

import { PronunciationFixesSchema } from "./persona.js";
import {
  EntityIdSchema,
  RuntimeVoiceSnapshotSchema,
  TimestampSchema,
} from "./primitives.js";


export const VoiceRuntimeContextSchema = z.object({
  conversationId: EntityIdSchema,
  tenantId: EntityIdSchema,
  visitorUserId: EntityIdSchema,
  personaVersionId: EntityIdSchema,
  systemPrompt: z.string().trim().min(1).max(30_000),
  openingMessage: z.string().trim().min(1).max(1_000),
  voice: RuntimeVoiceSnapshotSchema,
  pronunciationFixes: PronunciationFixesSchema.default({}),
  maxDurationSeconds: z.number().int().positive(),
}).strict();

export const VoiceRuntimeMessageRequestSchema = z.object({
  eventId: EntityIdSchema,
  turnId: EntityIdSchema,
  role: z.enum(["USER", "ASSISTANT"]),
  text: z.string().trim().min(1).max(10_000),
  occurredAt: TimestampSchema,
}).strict();

export const VoiceRuntimeMessageResultSchema = z.object({
  sequence: z.number().int().nonnegative(),
}).strict();

export const VoiceRuntimeStateRequestSchema = z.object({
  state: z.enum(["ACTIVE", "ENDED", "FAILED"]),
}).strict();

export const VoiceRuntimeStateResultSchema = z.object({
  conversationId: EntityIdSchema,
  status: z.enum(["ACTIVE", "ENDED", "FAILED"]),
  durationSeconds: z.number().int().nonnegative(),
}).strict();

export type VoiceRuntimeContext = z.infer<typeof VoiceRuntimeContextSchema>;
export type VoiceRuntimeMessageRequest = z.infer<typeof VoiceRuntimeMessageRequestSchema>;
export type VoiceRuntimeMessageResult = z.infer<typeof VoiceRuntimeMessageResultSchema>;
export type VoiceRuntimeState = z.infer<typeof VoiceRuntimeStateRequestSchema>["state"];
export type VoiceRuntimeStateResult = z.infer<typeof VoiceRuntimeStateResultSchema>;
