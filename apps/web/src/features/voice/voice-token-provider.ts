import {
  VoiceSessionRequestSchema,
  VoiceTokenResponseSchema,
} from "@flying-eagle/contracts";

import type { VoiceTokenProvider } from "./livekit-voice-session.js";
import { withRequestTimeout } from "../../lib/request-timeout.js";


export interface VoiceTokenProviderOptions {
  apiUrl: string;
  getAccessToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

function validateApiUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error("Core API 必須使用 HTTPS；只有本機 localhost 可使用 HTTP");
  }
  return url.toString().replace(/\/$/, "");
}

export function createVoiceTokenProvider({
  apiUrl,
  getAccessToken,
  fetchImpl = fetch,
}: VoiceTokenProviderOptions): VoiceTokenProvider {
  const normalizedApiUrl = validateApiUrl(apiUrl);

  return async (rawRequest) => {
    const request = VoiceSessionRequestSchema.parse(rawRequest);
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error("請先登入，再開始語音通話");
    }

    const response = await fetchImpl(`${normalizedApiUrl}/voice/sessions/token`, withRequestTimeout({
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    }));
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as {
        error?: { code?: string };
      } | null;
      const code = payload?.error?.code ?? `HTTP_${response.status}`;
      throw new Error(`VOICE_TOKEN_REQUEST_FAILED:${code}`);
    }
    return VoiceTokenResponseSchema.parse(await response.json());
  };
}
