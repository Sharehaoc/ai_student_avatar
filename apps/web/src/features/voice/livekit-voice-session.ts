import {
  VoiceSessionRequestSchema,
  VoiceTokenResponseSchema,
  type VoiceTokenResponse,
} from "@flying-eagle/contracts";

export type VoiceSessionStatus =
  | "IDLE"
  | "CONNECTING"
  | "RECONNECTING"
  | "PREPARED"
  | "LISTENING"
  | "DISCONNECTING"
  | "ERROR";

export type VoiceTokenProvider = (request: {
  conversationId: string;
}) => Promise<VoiceTokenResponse>;

export interface LiveKitRoomAdapter {
  activateAudio?(): Promise<void>;
  connect(url: string, token: string): Promise<void>;
  waitForAgentReady?(timeoutMs: number): Promise<void>;
  publishMicrophone(): Promise<void>;
  setMicrophoneMuted(muted: boolean): Promise<void>;
  disconnect(): Promise<void>;
}

interface LiveKitVoiceSessionOptions {
  room: LiveKitRoomAdapter;
  tokenProvider: VoiceTokenProvider;
}

/**
 * 管理「單一瀏覽器、單一通話」的 LiveKit 連線生命週期。
 * 真實 livekit-client SDK 只能放在 LiveKitRoomAdapter 實作內。
 */
export class LiveKitVoiceSession {
  readonly #room: LiveKitRoomAdapter;
  readonly #tokenProvider: VoiceTokenProvider;

  #status: VoiceSessionStatus = "IDLE";
  #conversationId: string | null = null;
  #preparePromise: Promise<void> | null = null;
  #publishPromise: Promise<void> | null = null;
  #microphonePublished = false;
  #roomConnected = false;

  constructor({ room, tokenProvider }: LiveKitVoiceSessionOptions) {
    this.#room = room;
    this.#tokenProvider = tokenProvider;
  }

  get status(): VoiceSessionStatus {
    return this.#status;
  }

  async prepare(conversationId: string): Promise<void> {
    const request = VoiceSessionRequestSchema.parse({ conversationId });

    if (this.#conversationId === request.conversationId && this.#status !== "ERROR") {
      return;
    }
    if (this.#conversationId && this.#conversationId !== request.conversationId) {
      throw new Error("切換 Conversation 前必須先斷開現有 LiveKit Room");
    }
    if (this.#preparePromise) return this.#preparePromise;

    this.#preparePromise = (async () => {
      this.#status = "CONNECTING";
      try {
        const credentials = VoiceTokenResponseSchema.parse(
          await this.#tokenProvider(request),
        );
        if (credentials.conversationId !== request.conversationId) {
          throw new Error("LiveKit Token 的 Conversation 不一致");
        }
        await this.#room.connect(credentials.url, credentials.token);
        this.#roomConnected = true;
        await this.#room.waitForAgentReady?.(75_000);
        this.#conversationId = request.conversationId;
        this.#status = "PREPARED";
      } catch (error) {
        if (this.#roomConnected) {
          await this.#room.disconnect().catch(() => undefined);
          this.#roomConnected = false;
        }
        this.#status = "ERROR";
        throw error;
      } finally {
        this.#preparePromise = null;
      }
    })();

    return this.#preparePromise;
  }

  async start(conversationId: string): Promise<void> {
    if (this.#publishPromise) return this.#publishPromise;

    this.#publishPromise = (async () => {
      await this.#room.activateAudio?.();
      await this.prepare(conversationId);
      if (!this.#microphonePublished) {
        await this.#room.publishMicrophone();
        this.#microphonePublished = true;
      }
      this.#status = "LISTENING";
    })();

    try {
      await this.#publishPromise;
    } catch (error) {
      if (this.#roomConnected) {
        await this.#room.disconnect().catch(() => undefined);
      }
      this.#conversationId = null;
      this.#microphonePublished = false;
      this.#roomConnected = false;
      this.#preparePromise = null;
      this.#status = "ERROR";
      throw error;
    } finally {
      this.#publishPromise = null;
    }
  }

  async setMuted(muted: boolean): Promise<void> {
    if (!this.#microphonePublished) return;
    await this.#room.setMicrophoneMuted(muted);
  }

  async disconnect(): Promise<void> {
    if (this.#status === "IDLE") return;
    this.#status = "DISCONNECTING";
    try {
      await this.#room.disconnect();
    } finally {
      this.#conversationId = null;
      this.#microphonePublished = false;
      this.#roomConnected = false;
      this.#preparePromise = null;
      this.#publishPromise = null;
      this.#status = "IDLE";
    }
  }
}
