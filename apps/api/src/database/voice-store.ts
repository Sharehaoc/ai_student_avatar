import {
  ConversationStatusResponseSchema,
  CreateConversationResponseSchema,
  UsageLimitResultSchema,
  type CreateConversationResponse,
  type ConversationStatusResponse,
  type UsageLimitResult,
} from "@flying-eagle/contracts";
import type postgres from "postgres";

import type {
  ConversationRepository,
  ConversationVoiceContext,
  VoiceAdmission,
} from "../app.js";


interface ConversationRow {
  conversation_id: string;
  tenant_id: string;
  visitor_user_id: string;
  persona_version_id: string;
  status: "PENDING" | "CONNECTING";
}

interface AdmissionRow {
  allowed: boolean;
  code: UsageLimitResult["code"];
  remaining_seconds: number | null;
  active_sessions: number;
  concurrency_limit: number;
  retry_after_seconds: number | null;
}

interface CreatedConversationRow {
  conversation_id: string;
  persona_display_name: string;
  persona_description: string;
}

interface ConversationStatusRow {
  conversation_id: string;
  status: ConversationStatusResponse["status"];
  duration_seconds: number;
}

interface ActivityRow {
  recorded: boolean;
}

export class PostgresConversationRepository implements ConversationRepository {
  readonly #sql: postgres.Sql;

  constructor(sql: postgres.Sql) {
    this.#sql = sql;
  }

  async createForUser(
    personaId: string,
    userId: string,
    profile: { email: string | null; displayName: string | null } = {
      email: null,
      displayName: null,
    },
  ): Promise<CreateConversationResponse | null> {
    if (!await this.recordActivity(personaId, userId, profile)) return null;
    const rows = await this.#sql<CreatedConversationRow[]>`
      with selected_persona as (
        select
          p.id,
          p.tenant_id,
          p.display_name,
          p.description,
          pv.id as persona_version_id,
          pv.system_prompt,
          pv.opening_message,
          pv.voice_snapshot,
          pv.pronunciation_fixes
        from public.personas p
        join public.persona_versions pv
          on pv.id = p.active_version_id
          and pv.persona_id = p.id
          and pv.tenant_id = p.tenant_id
        join public.usage_policies policy
          on policy.tenant_id = p.tenant_id
          and policy.voice_enabled
        where p.id = ${personaId}::uuid
          and p.is_published
        limit 1
      ), inserted as (
        insert into public.conversations (
          tenant_id,
          visitor_user_id,
          persona_id,
          persona_version_id,
          prompt_snapshot,
          voice_snapshot
        )
        select
          selected.tenant_id,
          ${userId}::uuid,
          selected.id,
          selected.persona_version_id,
          jsonb_build_object(
            'personaVersionId', selected.persona_version_id::text,
            'systemPrompt', selected.system_prompt,
            'openingMessage', selected.opening_message,
            'pronunciationFixes', selected.pronunciation_fixes
          ),
          selected.voice_snapshot
        from selected_persona selected
        returning id, persona_id
      )
      select
        inserted.id::text as conversation_id,
        selected.display_name as persona_display_name,
        selected.description as persona_description
      from inserted
      join selected_persona selected on selected.id = inserted.persona_id
    `;
    const row = rows[0];
    return row ? CreateConversationResponseSchema.parse({
      conversationId: row.conversation_id,
      personaDisplayName: row.persona_display_name,
      personaDescription: row.persona_description,
    }) : null;
  }

  async recordActivity(
    personaId: string,
    userId: string,
    profile: { email: string | null; displayName: string | null },
  ): Promise<boolean> {
    const fallbackDisplayName = profile.displayName
      ?? profile.email?.split("@")[0]
      ?? "訪客";
    const rows = await this.#sql<ActivityRow[]>`
      with selected_persona as (
        select p.tenant_id
        from public.personas p
        where p.id = ${personaId}::uuid
          and p.is_published
          and p.active_version_id is not null
        limit 1
      ), upserted_profile as (
        insert into public.profiles (
          user_id,
          display_name,
          email,
          last_seen_at,
          updated_at
        )
        select
          ${userId}::uuid,
          ${fallbackDisplayName},
          ${profile.email},
          now(),
          now()
        from selected_persona
        on conflict (user_id) do update
        set display_name = excluded.display_name,
            email = excluded.email,
            last_seen_at = excluded.last_seen_at,
            updated_at = excluded.updated_at
        returning user_id
      ), inserted_membership as (
        insert into public.tenant_memberships (tenant_id, user_id, role)
        select selected_persona.tenant_id, ${userId}::uuid, 'VISITOR'
        from selected_persona
        on conflict (tenant_id, user_id) do nothing
        returning user_id
      )
      select exists(select 1 from selected_persona) as recorded
    `;
    return rows[0]?.recorded ?? false;
  }

  async findVoiceContextForUser(
    conversationId: string,
    userId: string,
  ): Promise<ConversationVoiceContext | null> {
    const rows = await this.#sql<ConversationRow[]>`
      select
        id::text as conversation_id,
        tenant_id::text,
        visitor_user_id::text,
        persona_version_id::text,
        status::text
      from public.conversations
      where id = ${conversationId}::uuid
        and visitor_user_id = ${userId}::uuid
        and status in ('PENDING', 'CONNECTING')
      limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      conversationId: row.conversation_id,
      tenantId: row.tenant_id,
      visitorUserId: row.visitor_user_id,
      personaVersionId: row.persona_version_id,
      status: row.status,
    };
  }

  async findStatusForUser(
    conversationId: string,
    userId: string,
  ): Promise<ConversationStatusResponse | null> {
    const rows = await this.#sql<ConversationStatusRow[]>`
      select
        id::text as conversation_id,
        status::text,
        duration_seconds
      from public.conversations
      where id = ${conversationId}::uuid
        and visitor_user_id = ${userId}::uuid
      limit 1
    `;
    const row = rows[0];
    return row ? ConversationStatusResponseSchema.parse({
      conversationId: row.conversation_id,
      status: row.status,
      durationSeconds: row.duration_seconds,
    }) : null;
  }
}

export interface PostgresVoiceAdmissionOptions {
  powerOn: boolean;
  globalConcurrencyLimit: number;
  setupRatePerMinute: number;
}

export class PostgresVoiceAdmission implements VoiceAdmission {
  readonly #sql: postgres.Sql;
  readonly #options: PostgresVoiceAdmissionOptions;

  constructor(sql: postgres.Sql, options: PostgresVoiceAdmissionOptions) {
    this.#sql = sql;
    if (options.powerOn) {
      if (!Number.isInteger(options.globalConcurrencyLimit) || options.globalConcurrencyLimit <= 0) {
        throw new Error("VOICE_GLOBAL_CONCURRENCY_LIMIT 必須是正整數");
      }
      if (!Number.isInteger(options.setupRatePerMinute) || options.setupRatePerMinute <= 0) {
        throw new Error("VOICE_SETUP_RATE_LIMIT 必須是正整數");
      }
    }
    this.#options = options;
  }

  async evaluate(context: ConversationVoiceContext): Promise<UsageLimitResult> {
    if (!this.#options.powerOn) {
      return {
        allowed: false,
        code: "VOICE_POWER_OFF",
        remainingSeconds: null,
        activeSessions: 0,
        concurrencyLimit: 1,
        retryAfterSeconds: null,
      };
    }

    const rows = await this.#sql<AdmissionRow[]>`
      select *
      from public.reserve_voice_admission(
        ${context.conversationId}::uuid,
        ${context.visitorUserId}::uuid,
        ${this.#options.globalConcurrencyLimit}::integer,
        ${this.#options.setupRatePerMinute}::integer
      )
    `;
    const row = rows[0];
    if (!row) throw new Error("Voice admission 沒有回傳結果");
    return UsageLimitResultSchema.parse({
      allowed: row.allowed,
      code: row.code,
      remainingSeconds: row.remaining_seconds,
      activeSessions: row.active_sessions,
      concurrencyLimit: row.concurrency_limit,
      retryAfterSeconds: row.retry_after_seconds,
    });
  }
}
