import {
  ConversationStatusResponseSchema,
  EntityIdSchema,
  type ConversationStatusResponse,
} from "@flying-eagle/contracts";

import { withRequestTimeout } from "../../lib/request-timeout.js";


export type ConversationStatusProvider = (
  conversationId: string,
) => Promise<ConversationStatusResponse>;

export interface ConversationStatusProviderOptions {
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

export function createConversationStatusProvider({
  apiUrl,
  getAccessToken,
  fetchImpl = fetch,
}: ConversationStatusProviderOptions): ConversationStatusProvider {
  const normalizedApiUrl = normalizeApiUrl(apiUrl);
  return async (conversationId) => {
    const validConversationId = EntityIdSchema.parse(conversationId);
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error("請先登入，再查詢對話狀態");

    const response = await fetchImpl(
      `${normalizedApiUrl}/conversations/${encodeURIComponent(validConversationId)}/status`,
      withRequestTimeout({ headers: { authorization: `Bearer ${accessToken}` } }),
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as {
        error?: { code?: string };
      } | null;
      throw new Error(
        `CONVERSATION_STATUS_FAILED:${payload?.error?.code ?? `HTTP_${response.status}`}`,
      );
    }
    return ConversationStatusResponseSchema.parse(await response.json());
  };
}
