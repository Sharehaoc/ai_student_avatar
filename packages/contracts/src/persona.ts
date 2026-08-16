import { z } from "zod";

import { EntityIdSchema, TimestampSchema, VoiceSnapshotSchema } from "./primitives.js";

export const PersonaSchema = z.object({
  id: EntityIdSchema,
  tenantId: EntityIdSchema,
  displayName: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(1_000),
  activeVersionId: EntityIdSchema.nullable(),
  published: z.boolean(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict();

export const PronunciationFixesSchema = z.record(
  z.string().trim().min(1).max(100),
  z.string().trim().min(1).max(100),
).refine((fixes) => Object.keys(fixes).length <= 100, {
  message: "每個 Persona Version 最多 100 組發音修正",
});

export const PersonaVersionSchema = z.object({
  id: EntityIdSchema,
  tenantId: EntityIdSchema,
  personaId: EntityIdSchema,
  version: z.number().int().positive(),
  systemPrompt: z.string().trim().min(1).max(30_000),
  openingMessage: z.string().trim().min(1).max(1_000),
  voice: VoiceSnapshotSchema,
  pronunciationFixes: PronunciationFixesSchema.default({}),
  createdByUserId: EntityIdSchema,
  createdAt: TimestampSchema,
}).strict();

export type Persona = z.infer<typeof PersonaSchema>;
export type PersonaVersion = z.infer<typeof PersonaVersionSchema>;
