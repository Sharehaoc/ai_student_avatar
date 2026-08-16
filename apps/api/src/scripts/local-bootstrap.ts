import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

import { loadLocalEnvFile } from "../local-env.js";


interface LocalStatus {
  API_URL: string;
  DB_URL: string;
  PUBLISHABLE_KEY: string;
  SECRET_KEY: string;
}

interface LocalCredentials {
  owner: { email: string; password: string };
  visitor: { email: string; password: string };
}

interface AdminUser {
  id: string;
  email?: string;
}

const projectRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const localDirectory = join(projectRoot, ".local");
const credentialsPath = join(localDirectory, "student-credentials.json");

function readStatus(): LocalStatus {
  const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const savedWorkdirPath = join(localDirectory, "supabase-workdir");
  const savedWorkdir = existsSync(savedWorkdirPath)
    ? readFileSync(savedWorkdirPath, "utf8").trim()
    : "";
  const supabaseWorkdir = process.env.SUPABASE_WORKDIR?.trim() || savedWorkdir;
  const workdirArguments = supabaseWorkdir
    ? ["--workdir", supabaseWorkdir]
    : [];
  const result = spawnSync(executable, [
    "exec",
    "supabase",
    ...workdirArguments,
    "status",
    "-o",
    "json",
  ], {
    cwd: projectRoot,
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error("讀不到本機 Supabase，請先執行 pnpm local:start。");
  }
  const parsed = JSON.parse(result.stdout) as Partial<LocalStatus>;
  for (const key of ["API_URL", "DB_URL", "PUBLISHABLE_KEY", "SECRET_KEY"] as const) {
    if (!parsed[key]) throw new Error(`本機 Supabase 缺少 ${key}。`);
  }
  return parsed as LocalStatus;
}

function generatedPassword(): string {
  return `Local-${randomBytes(18).toString("base64url")}9aA`;
}

function readOrCreateCredentials(): LocalCredentials {
  mkdirSync(localDirectory, { recursive: true });
  if (process.env.SUPABASE_WORKDIR) {
    writeFileSync(
      join(localDirectory, "supabase-workdir"),
      `${process.env.SUPABASE_WORKDIR}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  }
  if (existsSync(credentialsPath)) {
    return JSON.parse(readFileSync(credentialsPath, "utf8")) as LocalCredentials;
  }
  const credentials: LocalCredentials = {
    owner: { email: "owner@student.local", password: generatedPassword() },
    visitor: { email: "visitor@student.local", password: generatedPassword() },
  };
  writeFileSync(credentialsPath, `${JSON.stringify(credentials, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(credentialsPath, 0o600);
  return credentials;
}

async function adminRequest<T>(
  status: LocalStatus,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(new URL(path, status.API_URL), {
    ...init,
    signal: init.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)])
      : AbortSignal.timeout(15_000),
    headers: {
      apikey: status.SECRET_KEY,
      authorization: `Bearer ${status.SECRET_KEY}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`本機 Auth 初始化失敗（HTTP ${response.status}）。`);
  }
  return await response.json() as T;
}

async function ensureUser(
  status: LocalStatus,
  account: { email: string; password: string },
  displayName: string,
): Promise<AdminUser> {
  const result = await adminRequest<{ users: AdminUser[] }>(
    status,
    "/auth/v1/admin/users?page=1&per_page=1000",
  );
  let user = result.users.find((candidate) => candidate.email === account.email);
  const body = JSON.stringify({
    email: account.email,
    password: account.password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (user) {
    user = await adminRequest<AdminUser>(status, `/auth/v1/admin/users/${user.id}`, {
      method: "PUT",
      body,
    });
  } else {
    user = await adminRequest<AdminUser>(status, "/auth/v1/admin/users", {
      method: "POST",
      body,
    });
  }
  return user;
}

function updateEnvFile(values: Record<string, string>): void {
  const envPath = join(projectRoot, ".env");
  const lines = existsSync(envPath) ? readFileSync(envPath, "utf8").split(/\r?\n/) : [];
  const remaining = new Map(Object.entries(values));
  const updated = lines.map((line) => {
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line);
    if (!match || !remaining.has(match[1]!)) return line;
    const key = match[1]!;
    const value = remaining.get(key)!;
    remaining.delete(key);
    return `${key}=${value}`;
  });
  if (updated.length && updated.at(-1) !== "") updated.push("");
  for (const [key, value] of remaining) updated.push(`${key}=${value}`);
  writeFileSync(envPath, `${updated.join("\n").replace(/\n+$/, "")}\n`, "utf8");
}

async function main(): Promise<void> {
  loadLocalEnvFile(projectRoot);
  const status = readStatus();
  const configuredVoiceId = process.env.MINIMAX_VOICE_ID?.trim() ?? "";
  const configuredVoiceModel = process.env.MINIMAX_VOICE_MODEL?.trim()
    || "speech-02-turbo";
  const credentials = readOrCreateCredentials();
  const [owner, visitor] = await Promise.all([
    ensureUser(status, credentials.owner, "分身管理者"),
    ensureUser(status, credentials.visitor, "示範訪客"),
  ]);
  const sql = postgres(status.DB_URL, { max: 1, connect_timeout: 10 });
  try {
    await sql.begin(async (transaction) => {
      await transaction`
        insert into public.profiles (user_id, display_name, email, last_seen_at)
        values
          (${owner.id}::uuid, '分身管理者', ${credentials.owner.email}, now()),
          (${visitor.id}::uuid, '示範訪客', ${credentials.visitor.email}, now())
        on conflict (user_id) do update
        set display_name = excluded.display_name,
            email = excluded.email,
            last_seen_at = excluded.last_seen_at,
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
        values
          (${tenantId}::uuid, ${owner.id}::uuid, 'OWNER'),
          (${tenantId}::uuid, ${visitor.id}::uuid, 'VISITOR')
        on conflict (tenant_id, user_id) do update set role = excluded.role
      `;
      const personas = await transaction<Array<{ id: string }>>`
        insert into public.personas (tenant_id, display_name, description)
        values (
          ${tenantId}::uuid,
          '你的 AI 分身',
          '陪使用者釐清問題，整理下一個可執行的步驟。'
        )
        on conflict (tenant_id) do update set tenant_id = excluded.tenant_id
        returning id::text
      `;
      const personaId = personas[0]!.id;
      await transaction`
        insert into public.persona_drafts (
          persona_id,
          tenant_id,
          system_prompt,
          opening_message,
          voice_snapshot,
          pronunciation_fixes,
          updated_by_user_id
        ) values (
          ${personaId}::uuid,
          ${tenantId}::uuid,
          '你是由學生本人建立的 AI 分身。請使用自然的台灣繁體中文，不確定時直接說明。',
          '嗨，我在這裡。你今天最想先釐清哪一件事？',
          ${transaction.json({
            provider: "minimax",
            voiceId: configuredVoiceId || "student-voice-clone",
            model: configuredVoiceModel,
          })},
          '{}'::jsonb,
          ${owner.id}::uuid
        )
        on conflict (persona_id) do update
        set voice_snapshot = case
              when ${Boolean(configuredVoiceId)}
                then excluded.voice_snapshot
              else persona_drafts.voice_snapshot
            end,
            updated_at = case
              when ${Boolean(configuredVoiceId)} then now()
              else persona_drafts.updated_at
            end
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
      updateEnvFile({
        VITE_API_URL: "http://127.0.0.1:8080",
        VITE_SUPABASE_URL: status.API_URL,
        VITE_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
        VITE_PERSONA_ID: personaId,
        VITE_PERSONA_AVATAR_URL: "",
        DATABASE_URL: status.DB_URL,
        DIRECT_URL: status.DB_URL,
        SUPABASE_URL: status.API_URL,
        SUPABASE_SECRET_KEY: status.SECRET_KEY,
        WEB_ORIGIN: "http://127.0.0.1:5173",
      });
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
  process.stdout.write(
    `本機帳號、AI 分身與 .env 已完成初始化。\n登入資料：${credentialsPath}\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "本機資料初始化失敗。";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
