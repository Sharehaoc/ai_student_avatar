import { z } from "zod";

import { ConversationSummarySchema } from "./conversation.js";
import {
  PronunciationFixesSchema,
} from "./persona.js";
import {
  EntityIdSchema,
  TimestampSchema,
  UuidSchema,
  VoiceSnapshotSchema,
} from "./primitives.js";


export const OwnerPersonaDraftInputSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(1_000),
  systemPrompt: z.string().trim().min(1).max(30_000),
  openingMessage: z.string().trim().min(1).max(1_000),
}).strict();

export const OwnerStudioPersonaSchema = OwnerPersonaDraftInputSchema.extend({
  voice: VoiceSnapshotSchema,
  pronunciationFixes: PronunciationFixesSchema.default({}),
  id: EntityIdSchema,
  tenantId: EntityIdSchema,
  avatarUrl: z.url().nullable(),
  published: z.boolean(),
  activeVersion: z.number().int().positive().nullable(),
  updatedAt: TimestampSchema,
}).strict();

export const StudioVisitorSchema = z.object({
  id: EntityIdSchema,
  displayName: z.string().trim().min(1).max(100),
  email: z.email().nullable(),
  createdAt: TimestampSchema,
  lastUsedAt: TimestampSchema,
  conversationCount: z.number().int().nonnegative(),
}).strict();

export const StudioPersonaVersionSchema = z.object({
  id: EntityIdSchema,
  version: z.number().int().positive(),
  systemPrompt: z.string().trim().min(1).max(30_000),
  openingMessage: z.string().trim().min(1).max(1_000),
  voice: VoiceSnapshotSchema,
  pronunciationFixes: PronunciationFixesSchema.default({}),
  createdAt: TimestampSchema,
  active: z.boolean(),
}).strict();

export const StudioConversationStatusSchema = z.enum([
  "PENDING",
  "CONNECTING",
  "ACTIVE",
  "ENDED",
  "FAILED",
]);

export const StudioConversationSummarySchema = z.object({
  id: EntityIdSchema,
  visitorId: EntityIdSchema,
  visitorDisplayName: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  startedAt: TimestampSchema,
  durationSeconds: z.number().int().nonnegative(),
  status: StudioConversationStatusSchema,
  personaVersion: z.number().int().positive(),
  summary: ConversationSummarySchema.nullable(),
}).strict();

export const StudioMessageSchema = z.object({
  id: EntityIdSchema,
  role: z.enum(["USER", "ASSISTANT"]),
  content: z.string().min(1).max(10_000),
  sequence: z.number().int().nonnegative(),
  createdAt: TimestampSchema,
}).strict();

export const StudioConversationDetailSchema = z.object({
  conversation: StudioConversationSummarySchema,
  messages: z.array(StudioMessageSchema),
}).strict();

export const OwnerStudioResponseSchema = z.object({
  persona: OwnerStudioPersonaSchema,
  personaVersions: z.array(StudioPersonaVersionSchema),
  visitors: z.array(StudioVisitorSchema),
  conversations: z.array(StudioConversationSummarySchema),
}).strict();

export const PublishPersonaResponseSchema = z.object({
  personaId: EntityIdSchema,
  version: z.number().int().positive(),
  publishedAt: TimestampSchema,
}).strict();

export const AvatarUploadResponseSchema = z.object({
  avatarUrl: z.url(),
}).strict();

export const VoicePreviewRequestSchema = z.object({
  text: z.string().trim().min(1).max(500),
}).strict();

export const PublicPersonaResponseSchema = z.object({
  id: EntityIdSchema,
  displayName: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(1_000),
  avatarUrl: z.url().nullable(),
}).strict();

export const VisitorActivityRequestSchema = z.object({
  personaId: UuidSchema,
}).strict();

export const VisitorActivityResponseSchema = z.object({
  recorded: z.literal(true),
}).strict();

export const DeleteConversationResponseSchema = z.object({
  conversationId: EntityIdSchema,
  deleted: z.literal(true),
}).strict();

export type OwnerPersonaDraftInput = z.infer<typeof OwnerPersonaDraftInputSchema>;
export type OwnerStudioPersona = z.infer<typeof OwnerStudioPersonaSchema>;
export type OwnerStudioResponse = z.infer<typeof OwnerStudioResponseSchema>;
export type StudioVisitor = z.infer<typeof StudioVisitorSchema>;
export type StudioPersonaVersion = z.infer<typeof StudioPersonaVersionSchema>;
export type StudioConversationSummary = z.infer<typeof StudioConversationSummarySchema>;
export type StudioConversationDetail = z.infer<typeof StudioConversationDetailSchema>;
export type PublishPersonaResponse = z.infer<typeof PublishPersonaResponseSchema>;
export type AvatarUploadResponse = z.infer<typeof AvatarUploadResponseSchema>;
export type VoicePreviewRequest = z.infer<typeof VoicePreviewRequestSchema>;
export type PublicPersonaResponse = z.infer<typeof PublicPersonaResponseSchema>;
export type VisitorActivityRequest = z.infer<typeof VisitorActivityRequestSchema>;
export type VisitorActivityResponse = z.infer<typeof VisitorActivityResponseSchema>;
export type DeleteConversationResponse = z.infer<typeof DeleteConversationResponseSchema>;
