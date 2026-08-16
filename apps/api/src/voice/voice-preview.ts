import type {
  VoicePreviewClient,
  VoicePreviewInput,
  VoicePreviewLimiter,
  VoicePreviewResult,
} from "../app.js";
import type postgres from "postgres";


const MAX_PREVIEW_AUDIO_BYTES = 5 * 1024 * 1024;

export class PostgresVoicePreviewLimiter implements VoicePreviewLimiter {
  readonly #sql: postgres.Sql;
  readonly #limit: number;
  readonly #windowSeconds: number;

  constructor(sql: postgres.Sql, limit: number, windowSeconds = 60) {
    this.#sql = sql;
    this.#limit = limit;
    this.#windowSeconds = windowSeconds;
  }

  async consume(userId: string): Promise<{
    allowed: boolean;
    retryAfterSeconds: number | null;
  }> {
    const [result] = await this.#sql<Array<{
      allowed: boolean;
      retry_after_seconds: number | null;
    }>>`
      select allowed, retry_after_seconds
      from public.consume_voice_preview_rate_limit(
        ${userId},
        ${this.#limit},
        ${this.#windowSeconds}
      )
    `;
    if (!result) throw new Error("VOICE_PREVIEW_RATE_LIMIT_UNAVAILABLE");
    return {
      allowed: result.allowed,
      retryAfterSeconds: result.retry_after_seconds,
    };
  }
}

export class HttpVoicePreviewClient implements VoicePreviewClient {
  readonly #url: string;
  readonly #internalToken: string;

  constructor(options: { url: string; internalToken: string }) {
    this.#url = options.url;
    this.#internalToken = options.internalToken;
  }

  async synthesize(input: VoicePreviewInput): Promise<VoicePreviewResult> {
    const response = await fetch(this.#url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-voice-internal-token": this.#internalToken,
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(40_000),
    });
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (
      !response.ok
      || contentType !== "audio/wav"
      || (contentLength > 0 && contentLength > MAX_PREVIEW_AUDIO_BYTES)
    ) {
      throw new Error("VOICE_PREVIEW_UPSTREAM_FAILED");
    }
    const audio = new Uint8Array(await response.arrayBuffer());
    if (audio.byteLength === 0 || audio.byteLength > MAX_PREVIEW_AUDIO_BYTES) {
      throw new Error("VOICE_PREVIEW_UPSTREAM_FAILED");
    }
    return { audio, contentType: "audio/wav" };
  }
}
