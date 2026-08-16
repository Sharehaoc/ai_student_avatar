import { z } from "zod";

import { EntityIdSchema, TimestampSchema } from "./primitives.js";

export const TranscriptEventSchema = z.object({
  eventId: EntityIdSchema,
  conversationId: EntityIdSchema,
  turnId: EntityIdSchema,
  sequence: z.number().int().nonnegative(),
  role: z.enum(["USER", "ASSISTANT"]),
  text: z.string().trim().min(1).max(10_000),
  final: z.boolean(),
  occurredAt: TimestampSchema,
}).strict();

export const ConversationMessageSchema = z.object({
  id: EntityIdSchema,
  tenantId: EntityIdSchema,
  conversationId: EntityIdSchema,
  turnId: EntityIdSchema,
  sequence: z.number().int().nonnegative(),
  role: z.enum(["USER", "ASSISTANT"]),
  content: z.string().trim().min(1).max(10_000),
  createdAt: TimestampSchema,
}).strict();

export type TranscriptEvent = z.infer<typeof TranscriptEventSchema>;
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;
