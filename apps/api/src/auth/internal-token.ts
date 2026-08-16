import { timingSafeEqual } from "node:crypto";


export const VOICE_INTERNAL_TOKEN_MIN_LENGTH = 32;

export function validateVoiceInternalToken(token: string): string {
  const normalized = token.trim();
  if (normalized.length < VOICE_INTERNAL_TOKEN_MIN_LENGTH) {
    throw new Error(
      `VOICE_INTERNAL_TOKEN 長度至少需要 ${VOICE_INTERNAL_TOKEN_MIN_LENGTH} 個字元`,
    );
  }
  return normalized;
}

export function matchesVoiceInternalToken(
  providedToken: string | null,
  expectedToken: string,
): boolean {
  if (!providedToken) return false;
  const provided = Buffer.from(providedToken, "utf8");
  const expected = Buffer.from(expectedToken, "utf8");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
