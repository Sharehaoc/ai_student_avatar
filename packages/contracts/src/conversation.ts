import { z } from "zod";

import {
  EntityIdSchema,
  TimestampSchema,
  UuidSchema,
  VoiceSnapshotSchema,
} from "./primitives.js";
import { PronunciationFixesSchema } from "./persona.js";

export const CreateConversationRequestSchema = z.object({
  personaId: UuidSchema,
}).strict();

export const CreateConversationResponseSchema = z.object({
  conversationId: EntityIdSchema,
  personaDisplayName: z.string().trim().min(1).max(80),
  personaDescription: z.string().trim().min(1).max(1_000),
}).strict();

export const ConversationStatusSchema = z.enum([
  "PENDING",
  "CONNECTING",
  "ACTIVE",
  "ENDED",
  "FAILED",
]);

export const ConversationStatusResponseSchema = z.object({
  conversationId: EntityIdSchema,
  status: ConversationStatusSchema,
  durationSeconds: z.number().int().nonnegative(),
}).strict();

export const ConversationSummarySchema = z.object({
  oneLine: z.string().trim().min(1).max(500),
  topics: z.array(z.string().trim().min(1).max(100)).max(20),
  actionItems: z.array(z.string().trim().min(1).max(500)).max(20),
  provider: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(200),
  generatedAt: TimestampSchema,
}).strict();

export const PromptSnapshotSchema = z.object({
  personaVersionId: EntityIdSchema,
  systemPrompt: z.string().trim().min(1).max(30_000),
  openingMessage: z.string().trim().min(1).max(1_000),
  pronunciationFixes: PronunciationFixesSchema.default({}),
}).strict();

export const ConversationRecordSchema = z.object({
  id: EntityIdSchema,
  tenantId: EntityIdSchema,
  visitorUserId: EntityIdSchema,
  personaId: EntityIdSchema,
  personaVersionId: EntityIdSchema,
  status: ConversationStatusSchema,
  startedAt: TimestampSchema,
  connectedAt: TimestampSchema.nullable(),
  endedAt: TimestampSchema.nullable(),
  durationSeconds: z.number().int().nonnegative(),
  promptSnapshot: PromptSnapshotSchema,
  voiceSnapshot: VoiceSnapshotSchema,
  summary: ConversationSummarySchema.nullable(),
  createdAt: TimestampSchema,
}).strict().superRefine((conversation, context) => {
  if (conversation.personaVersionId !== conversation.promptSnapshot.personaVersionId) {
    context.addIssue({
      code: "custom",
      path: ["promptSnapshot", "personaVersionId"],
      message: "Prompt Snapshot 必須與對話的 Persona Version 一致",
    });
  }
});

export type ConversationRecord = z.infer<typeof ConversationRecordSchema>;
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;
export type PromptSnapshot = z.infer<typeof PromptSnapshotSchema>;
export type CreateConversationRequest = z.infer<typeof CreateConversationRequestSchema>;
export type CreateConversationResponse = z.infer<typeof CreateConversationResponseSchema>;
export type ConversationStatus = z.infer<typeof ConversationStatusSchema>;
export type ConversationStatusResponse = z.infer<typeof ConversationStatusResponseSchema>;
