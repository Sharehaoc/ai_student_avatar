export const API_REQUEST_TIMEOUT_MS = 15_000;
export const VOICE_PREVIEW_REQUEST_TIMEOUT_MS = 50_000;

export function withRequestTimeout(
  init: RequestInit = {},
  timeoutMs = API_REQUEST_TIMEOUT_MS,
): RequestInit {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return {
    ...init,
    signal: init.signal
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal,
  };
}
