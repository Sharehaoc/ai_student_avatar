import {
  VoiceRuntimeContextSchema,
  VoiceRuntimeMessageResultSchema,
  VoiceRuntimeStateResultSchema,
  type VoiceRuntimeContext,
  type VoiceRuntimeMessageRequest,
  type VoiceRuntimeMessageResult,
  type VoiceRuntimeState,
  type VoiceRuntimeStateResult,
} from "@flying-eagle/contracts";
import type postgres from "postgres";

import type { VoiceRuntimeRepository } from "../app.js";


interface RuntimeContextRow {
  conversation_id: string;
  tenant_id: string;
  visitor_user_id: string;
  persona_version_id: string;
  prompt_snapshot: unknown;
  voice_snapshot: unknown;
  max_duration_seconds: number;
}

interface MessageSequenceRow {
  sequence: number;
}

interface RuntimeStateRow {
  conversation_id: string;
  status: VoiceRuntimeState;
  duration_seconds: number;
}

export class PostgresVoiceRuntimeRepository implements VoiceRuntimeRepository {
  readonly #sql: postgres.Sql;

  constructor(sql: postgres.Sql) {
    this.#sql = sql;
  }

  async findContext(conversationId: string): Promise<VoiceRuntimeContext | null> {
    const rows = await this.#sql<RuntimeContextRow[]>`
      select
        c.id::text as conversation_id,
        c.tenant_id::text,
        c.visitor_user_id::text,
        c.persona_version_id::text,
        c.prompt_snapshot,
        c.voice_snapshot,
        greatest(p.included_seconds - p.used_seconds, 0)::integer as max_duration_seconds
      from public.conversations c
      join public.usage_policies p on p.tenant_id = c.tenant_id
      where c.id = ${conversationId}::uuid
        and c.status in ('CONNECTING', 'ACTIVE')
        and p.voice_enabled
        and p.used_seconds < p.included_seconds
      limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    const prompt = row.prompt_snapshot as Record<string, unknown>;
    return VoiceRuntimeContextSchema.parse({
      conversationId: row.conversation_id,
      tenantId: row.tenant_id,
      visitorUserId: row.visitor_user_id,
      personaVersionId: row.persona_version_id,
      systemPrompt: prompt.systemPrompt,
      openingMessage: prompt.openingMessage,
      pronunciationFixes: prompt.pronunciationFixes ?? {},
      voice: row.voice_snapshot,
      maxDurationSeconds: row.max_duration_seconds,
    });
  }

  async appendMessage(
    conversationId: string,
    message: VoiceRuntimeMessageRequest,
  ): Promise<VoiceRuntimeMessageResult | null> {
    const rows = await this.#sql<MessageSequenceRow[]>`
      select public.append_voice_message(
        ${message.eventId}::text,
        ${conversationId}::uuid,
        ${message.turnId}::text,
        ${message.role}::public.message_role,
        ${message.text}::text,
        ${message.occurredAt}::timestamptz
      ) as sequence
    `;
    const row = rows[0];
    if (!row || row.sequence === null) return null;
    return VoiceRuntimeMessageResultSchema.parse(row);
  }

  async transitionState(
    conversationId: string,
    state: VoiceRuntimeState,
  ): Promise<VoiceRuntimeStateResult | null> {
    const rows = state === "ACTIVE"
      ? await this.#sql<RuntimeStateRow[]>`
          select
            conversation_id::text,
            status::text,
            duration_seconds
          from public.activate_voice_session(${conversationId}::uuid)
        `
      : await this.#sql<RuntimeStateRow[]>`
          select
            conversation_id::text,
            status::text,
            duration_seconds
          from public.finalize_voice_session(
            ${conversationId}::uuid,
            ${state === "FAILED"}::boolean
          )
        `;
    const row = rows[0];
    return row ? VoiceRuntimeStateResultSchema.parse({
      conversationId: row.conversation_id,
      status: row.status,
      durationSeconds: row.duration_seconds,
    }) : null;
  }
}
