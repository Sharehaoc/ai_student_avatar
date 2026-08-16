import { z } from "zod";

const UsageLimitCodeSchema = z.enum([
  "ALLOWED",
  "VOICE_POWER_OFF",
  "TENANT_QUOTA_EXHAUSTED",
  "TENANT_CONCURRENCY_LIMIT",
  "GLOBAL_CONCURRENCY_LIMIT",
  "CALL_SETUP_RATE_LIMIT",
]);

export const UsageLimitResultSchema = z.object({
  allowed: z.boolean(),
  code: UsageLimitCodeSchema,
  remainingSeconds: z.number().int().nonnegative().nullable(),
  activeSessions: z.number().int().nonnegative(),
  concurrencyLimit: z.number().int().positive(),
  retryAfterSeconds: z.number().int().nonnegative().nullable(),
}).strict().superRefine((result, context) => {
  if (result.allowed !== (result.code === "ALLOWED")) {
    context.addIssue({
      code: "custom",
      path: ["code"],
      message: "allowed 與 code 必須一致",
    });
  }
});

export type UsageLimitResult = z.infer<typeof UsageLimitResultSchema>;
