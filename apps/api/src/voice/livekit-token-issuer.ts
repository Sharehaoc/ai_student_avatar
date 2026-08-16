import {
  VoiceTokenResponseSchema,
  type VoiceTokenResponse,
} from "@flying-eagle/contracts";
import {
  AccessToken,
  RoomAgentDispatch,
  RoomConfiguration,
} from "livekit-server-sdk";

import type {
  ConversationVoiceContext,
  VoiceTokenIssuer,
} from "../app.js";


export interface LiveKitTokenIssuerOptions {
  url: string;
  apiKey: string;
  apiSecret: string;
  agentName: string;
  ttlSeconds?: number;
  idFactory?: () => string;
}

function required(value: string, name: string): string {
  const cleaned = value.trim();
  if (!cleaned) throw new Error(`${name} 不得為空`);
  return cleaned;
}

function roomSafe(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-");
  return safe.slice(0, 96);
}

export class LiveKitTokenIssuer implements VoiceTokenIssuer {
  readonly #url: string;
  readonly #apiKey: string;
  readonly #apiSecret: string;
  readonly #agentName: string;
  readonly #ttlSeconds: number;
  readonly #idFactory: () => string;

  constructor(options: LiveKitTokenIssuerOptions) {
    const url = new URL(options.url);
    if (url.protocol !== "wss:") {
      throw new Error("LIVEKIT_URL 必須使用 wss://");
    }
    this.#url = url.toString().replace(/\/$/, "");
    this.#apiKey = required(options.apiKey, "LIVEKIT_API_KEY");
    this.#apiSecret = required(options.apiSecret, "LIVEKIT_API_SECRET");
    this.#agentName = required(options.agentName, "LIVEKIT_AGENT_NAME");
    this.#ttlSeconds = options.ttlSeconds ?? 300;
    if (!Number.isInteger(this.#ttlSeconds) || this.#ttlSeconds < 30 || this.#ttlSeconds > 600) {
      throw new Error("LiveKit Token TTL 必須介於 30 到 600 秒");
    }
    this.#idFactory = options.idFactory ?? (() => crypto.randomUUID());
  }

  async issue(context: ConversationVoiceContext): Promise<VoiceTokenResponse> {
    const uniqueId = roomSafe(this.#idFactory());
    const roomName = roomSafe(`eagle-${context.conversationId}-${uniqueId}`);
    const participantIdentity = roomSafe(`visitor-${context.visitorUserId}-${uniqueId}`);
    const metadata = JSON.stringify({
      tenant_id: context.tenantId,
      conversation_id: context.conversationId,
      visitor_user_id: context.visitorUserId,
      persona_version_id: context.personaVersionId,
    });

    const token = new AccessToken(this.#apiKey, this.#apiSecret, {
      identity: participantIdentity,
      metadata,
      ttl: this.#ttlSeconds,
    });
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    token.roomConfig = new RoomConfiguration({
      name: roomName,
      agents: [
        new RoomAgentDispatch({
          agentName: this.#agentName,
          metadata,
        }),
      ],
    });

    return VoiceTokenResponseSchema.parse({
      token: await token.toJwt(),
      url: this.#url,
      roomName,
      conversationId: context.conversationId,
    });
  }
}
