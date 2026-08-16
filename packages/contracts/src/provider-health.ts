import { z } from "zod";

import { TimestampSchema } from "./primitives.js";

export const ProviderHealthSchema = z.object({
  kind: z.enum(["STT", "LLM", "TTS", "LIVEKIT", "DATABASE"]),
  provider: z.string().trim().min(1).max(100),
  status: z.enum(["HEALTHY", "DEGRADED", "UNAVAILABLE", "UNKNOWN"]),
  checkedAt: TimestampSchema,
  latencyMs: z.number().nonnegative().nullable(),
  code: z.string().trim().min(1).max(100).nullable(),
}).strict();

export type ProviderHealth = z.infer<typeof ProviderHealthSchema>;
