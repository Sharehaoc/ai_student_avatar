import type { ConversationStatusResponse } from "@flying-eagle/contracts";

import type { ConversationStatusProvider } from "./conversation-status-provider.js";


interface WaitForConversationSavedOptions {
  timeoutMs?: number;
  intervalMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, milliseconds);
});

export async function waitForConversationSaved(
  conversationId: string,
  getStatus: ConversationStatusProvider,
  {
    timeoutMs = 10_000,
    intervalMs = 300,
    now = Date.now,
    sleep = defaultSleep,
  }: WaitForConversationSavedOptions = {},
): Promise<ConversationStatusResponse> {
  const deadline = now() + timeoutMs;
  while (true) {
    try {
      const status = await getStatus(conversationId);
      if (status.status === "ENDED" || status.status === "FAILED") return status;
    } catch {
      // 網路短暫失敗時仍在截止時間內重試；逾時後才明確回報未確認。
    }
    const remainingMs = deadline - now();
    if (remainingMs <= 0) throw new Error("CONVERSATION_FINALIZATION_TIMEOUT");
    await sleep(Math.min(intervalMs, remainingMs));
  }
}
