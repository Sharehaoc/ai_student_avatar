import postgres from "postgres";

interface AdminUser {
  id: string;
  email?: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少必要環境變數：${name}`);
  return value;
}

async function supabaseAdminRequest<T>(
  supabaseUrl: string,
  secretKey: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(new URL(path, supabaseUrl), {
    ...init,
    signal: init.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)])
      : AbortSignal.timeout(15_000),
    headers: {
      apikey: secretKey,
      authorization: `Bearer ${secretKey}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Supabase Auth 初始化失敗（HTTP ${response.status}）。`);
  }
  return await response.json() as T;
}

async function ensureOwner(options: {
  supabaseUrl: string;
  secretKey: string;
  email: string;
  password: string;
}): Promise<AdminUser> {
  const users = await supabaseAdminRequest<{ users: AdminUser[] }>(
    options.supabaseUrl,
    options.secretKey,
    "/auth/v1/admin/users?page=1&per_page=1000",
  );
  const existing = users.users.find((candidate) => candidate.email === options.email);
  const body = JSON.stringify({
    email: options.email,
    password: options.password,
    email_confirm: true,
    user_metadata: { display_name: "分身管理者" },
  });
  if (existing) {
    return await supabaseAdminRequest<AdminUser>(
      options.supabaseUrl,
      options.secretKey,
      `/auth/v1/admin/users/${existing.id}`,
      { method: "PUT", body },
    );
  }
  return await supabaseAdminRequest<AdminUser>(
    options.supabaseUrl,
    options.secretKey,
    "/auth/v1/admin/users",
    { method: "POST", body },
  );
}

async function main(): Promise<void> {
  const supabaseUrl = required("SUPABASE_URL");
  const supabaseSecretKey = required("SUPABASE_SECRET_KEY");
  const databaseUrl = required("DATABASE_URL");
  const ownerEmail = required("OWNER_EMAIL");
  const ownerPassword = required("OWNER_PASSWORD");
  const minimaxVoiceId = required("MINIMAX_VOICE_ID");
  const minimaxVoiceModel = required("MINIMAX_VOICE_MODEL");

  const owner = await ensureOwner({
    supabaseUrl,
    secretKey: supabaseSecretKey,
    email: ownerEmail,
    password: ownerPassword,
  });
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 15 });
  try {
    const personaId = await sql.begin(async (transaction) => {
      await transaction`
        insert into public.profiles (user_id, display_name, email, last_seen_at)
        values (${owner.id}::uuid, '分身管理者', ${ownerEmail}, now())
        on conflict (user_id) do update
        set display_name = excluded.display_name,
            email = excluded.email,
            updated_at = now()
      `;
      const tenants = await transaction<Array<{ id: string }>>`
        insert into public.tenants (slug, display_name)
        values (${`student-${owner.id.slice(0, 8)}`}, '學員 AI 分身')
        on conflict (slug) do update set display_name = excluded.display_name
        returning id::text
      `;
      const tenantId = tenants[0]!.id;
      await transaction`
        insert into public.tenant_memberships (tenant_id, user_id, role)
        values (${tenantId}::uuid, ${owner.id}::uuid, 'OWNER')
        on conflict (tenant_id, user_id) do update set role = excluded.role
      `;
      const personas = await transaction<Array<{ id: string }>>`
        insert into public.personas (tenant_id, display_name, description)
        values (
          ${tenantId}::uuid,
          '你的 AI 分身',
          '陪使用者釐清問題，整理下一個可執行的步驟。'
        )
        on conflict (tenant_id) do update set updated_at = now()
        returning id::text
      `;
      const personaId = personas[0]!.id;
      await transaction`
        insert into public.persona_drafts (
          persona_id, tenant_id, system_prompt, opening_message,
          voice_snapshot, pronunciation_fixes, updated_by_user_id
        ) values (
          ${personaId}::uuid,
          ${tenantId}::uuid,
          '你是由學生本人建立的 AI 分身。請使用自然的台灣繁體中文，不確定時直接說明。',
          '嗨，我在這裡。你今天最想先釐清哪一件事？',
          ${transaction.json({
            provider: "minimax",
            voiceId: minimaxVoiceId,
            model: minimaxVoiceModel,
          })},
          '{}'::jsonb,
          ${owner.id}::uuid
        )
        on conflict (persona_id) do update
        set voice_snapshot = excluded.voice_snapshot,
            updated_by_user_id = excluded.updated_by_user_id,
            updated_at = now()
      `;
      await transaction`
        insert into public.usage_policies (
          tenant_id,
          voice_enabled,
          included_seconds,
          tenant_concurrency_limit
        ) values (${tenantId}::uuid, true, 3600, 1)
        on conflict (tenant_id) do nothing
      `;
      const published = await transaction<Array<{ persona_id: string }>>`
        select persona_id::text
        from public.publish_persona_draft(${owner.id}::uuid)
      `;
      if (published[0]?.persona_id !== personaId) {
        throw new Error("Persona 草稿發布失敗。");
      }
      return personaId;
    });
    if (process.env.GITHUB_OUTPUT) {
      process.stdout.write(`persona_id=${personaId}\n`);
      await import("node:fs/promises").then(({ appendFile }) =>
        appendFile(process.env.GITHUB_OUTPUT!, `persona_id=${personaId}\n`, "utf8"),
      );
    } else {
      process.stdout.write("正式 OWNER 與 Persona 已初始化。\n");
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "正式 OWNER 初始化失敗。";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
