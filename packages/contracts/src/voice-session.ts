import { z } from "zod";

import { EntityIdSchema, UuidSchema } from "./primitives.js";

export const VoiceSessionRequestSchema = z.object({
  conversationId: UuidSchema,
}).strict();

export const VoiceTokenResponseSchema = z.object({
  token: z.string().trim().min(1),
  url: z.string().url().refine((url) => url.startsWith("wss://"), {
    message: "LiveKit URL 必須使用 wss://",
  }),
  roomName: z.string().trim().min(1).max(255),
  conversationId: EntityIdSchema,
}).strict();

export type VoiceSessionRequest = z.infer<typeof VoiceSessionRequestSchema>;
export type VoiceTokenResponse = z.infer<typeof VoiceTokenResponseSchema>;
