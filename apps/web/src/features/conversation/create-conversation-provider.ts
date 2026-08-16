import {
  CreateConversationRequestSchema,
  CreateConversationResponseSchema,
  type CreateConversationResponse,
} from "@flying-eagle/contracts";

import { withRequestTimeout } from "../../lib/request-timeout.js";


export type CreateConversationProvider = (
  personaId: string,
) => Promise<CreateConversationResponse>;

export interface CreateConversationProviderOptions {
  apiUrl: string;
  getAccessToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

function normalizeApiUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  const localHttp = url.protocol === "http:"
    && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error("Core API 必須使用 HTTPS；只有本機 localhost 可使用 HTTP");
  }
  return url.toString().replace(/\/$/, "");
}

export function createConversationProvider({
  apiUrl,
  getAccessToken,
  fetchImpl = fetch,
}: CreateConversationProviderOptions): CreateConversationProvider {
  const normalizedApiUrl = normalizeApiUrl(apiUrl);
  return async (personaId) => {
    const request = CreateConversationRequestSchema.parse({ personaId });
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error("請先登入，再建立對話");

    const response = await fetchImpl(`${normalizedApiUrl}/conversations`, withRequestTimeout({
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
      throw new Error(
        `CREATE_CONVERSATION_FAILED:${payload?.error?.code ?? `HTTP_${response.status}`}`,
      );
    }
    return CreateConversationResponseSchema.parse(await response.json());
  };
}
