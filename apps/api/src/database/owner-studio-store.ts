import {
  OwnerStudioResponseSchema,
  PronunciationFixesSchema,
  PublishPersonaResponseSchema,
  PublicPersonaResponseSchema,
  RuntimeVoiceSnapshotSchema,
  StudioConversationDetailSchema,
  type OwnerPersonaDraftInput,
  type OwnerStudioPersona,
  type OwnerStudioResponse,
  type PublishPersonaResponse,
  type PublicPersonaResponse,
  type StudioConversationDetail,
} from "@flying-eagle/contracts";
import type postgres from "postgres";

import type {
  OwnedPersonaIdentity,
  OwnerStudioRepository,
  VoicePreviewContext,
} from "../app.js";


interface PersonaRow {
  persona_id: string;
  tenant_id: string;
  display_name: string;
  description: string;
  avatar_path: string | null;
  is_published: boolean;
  active_version: number | null;
  system_prompt: string;
  opening_message: string;
  voice_snapshot: unknown;
  pronunciation_fixes: unknown;
  updated_at: Date;
}

interface VisitorRow {
  visitor_id: string;
  display_name: string;
  email: string | null;
  created_at: Date;
  last_used_at: Date;
  conversation_count: number;
}

interface ConversationRow {
  conversation_id: string;
  visitor_id: string;
  visitor_display_name: string;
  title: string;
  started_at: Date;
  duration_seconds: number;
  status: "PENDING" | "CONNECTING" | "ACTIVE" | "ENDED" | "FAILED";
  persona_version: number;
  summary: unknown;
}

interface PersonaVersionRow {
  persona_version_id: string;
  version: number;
  system_prompt: string;
  opening_message: string;
  voice_snapshot: unknown;
  pronunciation_fixes: unknown;
  created_at: Date;
  active: boolean;
}

interface MessageRow {
  message_id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  sequence: number;
  created_at: Date;
}

interface OwnedPersonaRow {
  persona_id: string;
  tenant_id: string;
}

interface PublishRow {
  persona_id: string;
  version: number;
  published_at: Date;
}

function iso(value: Date): string {
  return value.toISOString();
}

export class PostgresOwnerStudioRepository implements OwnerStudioRepository {
  readonly #sql: postgres.Sql;
  readonly #avatarPublicBaseUrl: string;

  constructor(sql: postgres.Sql, supabaseUrl: string) {
    this.#sql = sql;
    this.#avatarPublicBaseUrl = new URL(
      "/storage/v1/object/public/persona-avatars/",
      supabaseUrl,
    ).toString();
  }

  #avatarUrl(path: string | null): string | null {
    if (!path) return null;
    return `${this.#avatarPublicBaseUrl}${path.split("/").map(encodeURIComponent).join("/")}`;
  }

  async getStudio(userId: string): Promise<OwnerStudioResponse | null> {
    const personas = await this.#sql<PersonaRow[]>`
      select
        p.id::text as persona_id,
        p.tenant_id::text,
        p.display_name,
        p.description,
        p.avatar_path,
        p.is_published,
        pv.version as active_version,
        d.system_prompt,
        d.opening_message,
        d.voice_snapshot,
        d.pronunciation_fixes,
        p.updated_at
      from public.personas p
      join public.tenant_memberships tm
        on tm.tenant_id = p.tenant_id
       and tm.user_id = ${userId}::uuid
       and tm.role = 'OWNER'
      join public.persona_drafts d
        on d.persona_id = p.id
       and d.tenant_id = p.tenant_id
      left join public.persona_versions pv
        on pv.id = p.active_version_id
       and pv.persona_id = p.id
       and pv.tenant_id = p.tenant_id
      order by p.created_at
      limit 1
    `;
    const persona = personas[0];
    if (!persona) return null;

    const [personaVersions, visitors, conversations] = await Promise.all([
      this.#sql<PersonaVersionRow[]>`
        select
          pv.id::text as persona_version_id,
          pv.version,
          pv.system_prompt,
          pv.opening_message,
          pv.voice_snapshot,
          pv.pronunciation_fixes,
          pv.created_at,
          (pv.id = p.active_version_id) as active
        from public.persona_versions pv
        join public.personas p
          on p.id = pv.persona_id
         and p.tenant_id = pv.tenant_id
        where pv.persona_id = ${persona.persona_id}::uuid
          and pv.tenant_id = ${persona.tenant_id}::uuid
        order by pv.version desc
      `,
      this.#sql<VisitorRow[]>`
        select
          tm.user_id::text as visitor_id,
          coalesce(nullif(pr.display_name, ''), '訪客') as display_name,
          pr.email,
          coalesce(pr.created_at, tm.created_at) as created_at,
          coalesce(greatest(pr.last_seen_at, max(c.started_at)), pr.created_at, tm.created_at) as last_used_at,
          count(c.id)::integer as conversation_count
        from public.tenant_memberships tm
        left join public.profiles pr on pr.user_id = tm.user_id
        left join public.conversations c
          on c.tenant_id = tm.tenant_id
         and c.visitor_user_id = tm.user_id
        where tm.tenant_id = ${persona.tenant_id}::uuid
          and tm.role = 'VISITOR'
        group by tm.user_id, tm.created_at, pr.display_name, pr.email,
                 pr.created_at, pr.last_seen_at
        order by last_used_at desc
      `,
      this.#sql<ConversationRow[]>`
        select
          c.id::text as conversation_id,
          c.visitor_user_id::text as visitor_id,
          coalesce(nullif(pr.display_name, ''), '訪客') as visitor_display_name,
          coalesce(
            left(nullif(c.summary->>'oneLine', ''), 200),
            (
              select left(m.content, 200)
              from public.messages m
              where m.conversation_id = c.id
                and m.role = 'USER'
              order by m.sequence
              limit 1
            ),
            '語音對話'
          ) as title,
          c.started_at,
          c.duration_seconds,
          c.status::text,
          pv.version as persona_version,
          c.summary
        from public.conversations c
        join public.persona_versions pv
          on pv.id = c.persona_version_id
         and pv.persona_id = c.persona_id
         and pv.tenant_id = c.tenant_id
        left join public.profiles pr on pr.user_id = c.visitor_user_id
        where c.tenant_id = ${persona.tenant_id}::uuid
        order by c.started_at desc
        limit 500
      `,
    ]);

    return OwnerStudioResponseSchema.parse({
      persona: {
        id: persona.persona_id,
        tenantId: persona.tenant_id,
        displayName: persona.display_name,
        description: persona.description,
        systemPrompt: persona.system_prompt,
        openingMessage: persona.opening_message,
        voice: persona.voice_snapshot,
        pronunciationFixes: persona.pronunciation_fixes,
        avatarUrl: this.#avatarUrl(persona.avatar_path),
        published: persona.is_published,
        activeVersion: persona.active_version,
        updatedAt: iso(persona.updated_at),
      },
      personaVersions: personaVersions.map((version) => ({
        id: version.persona_version_id,
        version: version.version,
        systemPrompt: version.system_prompt,
        openingMessage: version.opening_message,
        voice: version.voice_snapshot,
        pronunciationFixes: version.pronunciation_fixes,
        createdAt: iso(version.created_at),
        active: version.active,
      })),
      visitors: visitors.map((visitor) => ({
        id: visitor.visitor_id,
        displayName: visitor.display_name,
        email: visitor.email,
        createdAt: iso(visitor.created_at),
        lastUsedAt: iso(visitor.last_used_at),
        conversationCount: visitor.conversation_count,
      })),
      conversations: conversations.map((conversation) => ({
        id: conversation.conversation_id,
        visitorId: conversation.visitor_id,
        visitorDisplayName: conversation.visitor_display_name,
        title: conversation.title,
        startedAt: iso(conversation.started_at),
        durationSeconds: conversation.duration_seconds,
        status: conversation.status,
        personaVersion: conversation.persona_version,
        summary: conversation.summary,
      })),
    });
  }

  async saveDraft(
    userId: string,
    input: OwnerPersonaDraftInput,
  ): Promise<OwnerStudioPersona | null> {
    const rows = await this.#sql<OwnedPersonaRow[]>`
      with owned as (
        select p.id, p.tenant_id
        from public.personas p
        join public.tenant_memberships tm
          on tm.tenant_id = p.tenant_id
         and tm.user_id = ${userId}::uuid
         and tm.role = 'OWNER'
        limit 1
      ), updated_persona as (
        update public.personas p
        set display_name = ${input.displayName},
            description = ${input.description},
            updated_at = now()
        from owned
        where p.id = owned.id
          and p.tenant_id = owned.tenant_id
        returning p.id, p.tenant_id
      ), updated_draft as (
        update public.persona_drafts d
        set system_prompt = ${input.systemPrompt},
            opening_message = ${input.openingMessage},
            updated_by_user_id = ${userId}::uuid,
            updated_at = now()
        from updated_persona
        where d.persona_id = updated_persona.id
          and d.tenant_id = updated_persona.tenant_id
        returning d.persona_id, d.tenant_id
      )
      select persona_id::text, tenant_id::text
      from updated_draft
    `;
    if (!rows[0]) return null;
    return (await this.getStudio(userId))?.persona ?? null;
  }

  async publishDraft(userId: string): Promise<PublishPersonaResponse | null> {
    const rows = await this.#sql<PublishRow[]>`
      select persona_id::text, version, published_at
      from public.publish_persona_draft(${userId}::uuid)
    `;
    const row = rows[0];
    return row ? PublishPersonaResponseSchema.parse({
      personaId: row.persona_id,
      version: row.version,
      publishedAt: iso(row.published_at),
    }) : null;
  }

  async restoreVersion(
    userId: string,
    personaVersionId: string,
  ): Promise<OwnerStudioPersona | null> {
    const rows = await this.#sql<OwnedPersonaRow[]>`
      with owned_version as (
        select
          pv.persona_id,
          pv.tenant_id,
          pv.system_prompt,
          pv.opening_message,
          pv.voice_snapshot,
          pv.pronunciation_fixes
        from public.persona_versions pv
        join public.tenant_memberships tm
          on tm.tenant_id = pv.tenant_id
         and tm.user_id = ${userId}::uuid
         and tm.role = 'OWNER'
        where pv.id = ${personaVersionId}::uuid
        limit 1
      ), restored as (
        insert into public.persona_drafts (
          persona_id,
          tenant_id,
          system_prompt,
          opening_message,
          voice_snapshot,
          pronunciation_fixes,
          updated_by_user_id,
          updated_at
        )
        select
          owned_version.persona_id,
          owned_version.tenant_id,
          owned_version.system_prompt,
          owned_version.opening_message,
          owned_version.voice_snapshot,
          owned_version.pronunciation_fixes,
          ${userId}::uuid,
          now()
        from owned_version
        on conflict (persona_id) do update
        set system_prompt = excluded.system_prompt,
            opening_message = excluded.opening_message,
            voice_snapshot = excluded.voice_snapshot,
            pronunciation_fixes = excluded.pronunciation_fixes,
            updated_by_user_id = excluded.updated_by_user_id,
            updated_at = excluded.updated_at
        returning persona_id, tenant_id
      )
      select persona_id::text, tenant_id::text
      from restored
    `;
    if (!rows[0]) return null;
    return (await this.getStudio(userId))?.persona ?? null;
  }

  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<StudioConversationDetail | null> {
    const conversations = await this.#sql<ConversationRow[]>`
      select
        c.id::text as conversation_id,
        c.visitor_user_id::text as visitor_id,
        coalesce(nullif(pr.display_name, ''), '訪客') as visitor_display_name,
        coalesce(
          left(nullif(c.summary->>'oneLine', ''), 200),
          (
            select left(m.content, 200)
            from public.messages m
            where m.conversation_id = c.id
              and m.role = 'USER'
            order by m.sequence
            limit 1
          ),
          '語音對話'
        ) as title,
        c.started_at,
        c.duration_seconds,
        c.status::text,
        pv.version as persona_version,
        c.summary
      from public.conversations c
      join public.tenant_memberships tm
        on tm.tenant_id = c.tenant_id
       and tm.user_id = ${userId}::uuid
       and tm.role = 'OWNER'
      join public.persona_versions pv
        on pv.id = c.persona_version_id
       and pv.persona_id = c.persona_id
       and pv.tenant_id = c.tenant_id
      left join public.profiles pr on pr.user_id = c.visitor_user_id
      where c.id = ${conversationId}::uuid
      limit 1
    `;
    const conversation = conversations[0];
    if (!conversation) return null;
    const messages = await this.#sql<MessageRow[]>`
      select
        m.id::text as message_id,
        m.role::text,
        m.content,
        m.sequence,
        m.created_at
      from public.messages m
      where m.conversation_id = ${conversationId}::uuid
      order by m.sequence
    `;
    return StudioConversationDetailSchema.parse({
      conversation: {
        id: conversation.conversation_id,
        visitorId: conversation.visitor_id,
        visitorDisplayName: conversation.visitor_display_name,
        title: conversation.title,
        startedAt: iso(conversation.started_at),
        durationSeconds: conversation.duration_seconds,
        status: conversation.status,
        personaVersion: conversation.persona_version,
        summary: conversation.summary,
      },
      messages: messages.map((message) => ({
        id: message.message_id,
        role: message.role,
        content: message.content,
        sequence: message.sequence,
        createdAt: iso(message.created_at),
      })),
    });
  }

  async deleteConversation(userId: string, conversationId: string): Promise<boolean> {
    const rows = await this.#sql<Array<{ conversation_id: string }>>`
      delete from public.conversations c
      using public.tenant_memberships tm
      where c.id = ${conversationId}::uuid
        and tm.tenant_id = c.tenant_id
        and tm.user_id = ${userId}::uuid
        and tm.role = 'OWNER'
      returning c.id::text as conversation_id
    `;
    return Boolean(rows[0]);
  }

  async findOwnedPersona(userId: string): Promise<OwnedPersonaIdentity | null> {
    const rows = await this.#sql<OwnedPersonaRow[]>`
      select p.id::text as persona_id, p.tenant_id::text
      from public.personas p
      join public.tenant_memberships tm
        on tm.tenant_id = p.tenant_id
       and tm.user_id = ${userId}::uuid
       and tm.role = 'OWNER'
      order by p.created_at
      limit 1
    `;
    const row = rows[0];
    return row ? { personaId: row.persona_id, tenantId: row.tenant_id } : null;
  }

  async findVoicePreviewContext(userId: string): Promise<VoicePreviewContext | null> {
    const rows = await this.#sql<Array<{
      voice_snapshot: unknown;
      pronunciation_fixes: unknown;
    }>>`
      select d.voice_snapshot, d.pronunciation_fixes
      from public.persona_drafts d
      join public.tenant_memberships tm
        on tm.tenant_id = d.tenant_id
       and tm.user_id = ${userId}::uuid
       and tm.role = 'OWNER'
      order by d.updated_at
      limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      voice: RuntimeVoiceSnapshotSchema.parse(row.voice_snapshot),
      pronunciationFixes: PronunciationFixesSchema.parse(row.pronunciation_fixes),
    };
  }

  async updateAvatarPath(userId: string, avatarPath: string): Promise<boolean> {
    const rows = await this.#sql<OwnedPersonaRow[]>`
      update public.personas p
      set avatar_path = ${avatarPath}, updated_at = now()
      from public.tenant_memberships tm
      where tm.tenant_id = p.tenant_id
        and tm.user_id = ${userId}::uuid
        and tm.role = 'OWNER'
      returning p.id::text as persona_id, p.tenant_id::text
    `;
    return Boolean(rows[0]);
  }

  async findPublicPersona(personaId: string): Promise<PublicPersonaResponse | null> {
    const rows = await this.#sql<Array<{
      persona_id: string;
      display_name: string;
      description: string;
      avatar_path: string | null;
    }>>`
      select
        p.id::text as persona_id,
        p.display_name,
        p.description,
        p.avatar_path
      from public.personas p
      where p.id = ${personaId}::uuid
        and p.is_published
        and p.active_version_id is not null
      limit 1
    `;
    const row = rows[0];
    return row ? PublicPersonaResponseSchema.parse({
      id: row.persona_id,
      displayName: row.display_name,
      description: row.description,
      avatarUrl: this.#avatarUrl(row.avatar_path),
    }) : null;
  }
}
