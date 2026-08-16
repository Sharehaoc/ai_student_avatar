import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";


const migrationPath = fileURLToPath(
  new URL("../../../supabase/migrations/20260813183634_initial_course_schema.sql", import.meta.url),
);
const migration = readFileSync(migrationPath, "utf8").toLowerCase();
const admissionMigrationPath = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260813221017_serialize_global_voice_admission.sql",
    import.meta.url,
  ),
);
const admissionMigration = readFileSync(admissionMigrationPath, "utf8").toLowerCase();
const previewLimiterMigrationPath = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260813221511_persist_voice_preview_rate_limit.sql",
    import.meta.url,
  ),
);
const previewLimiterMigration = readFileSync(previewLimiterMigrationPath, "utf8").toLowerCase();
const userTables = [
  "tenants",
  "profiles",
  "tenant_memberships",
  "personas",
  "persona_versions",
  "usage_policies",
  "conversations",
  "messages",
  "voice_admissions",
];

describe("initial_course_schema", () => {
  it.each(userTables)("%s 啟用 RLS 並撤銷 browser Data API 權限", (table) => {
    expect(migration).toContain(`alter table public.${table} enable row level security`);
    expect(migration).toContain(`revoke all on table public.${table} from anon, authenticated`);
  });

  it("PersonaVersion 不允許原地覆寫", () => {
    expect(migration).toContain("before update on public.persona_versions");
    expect(migration).toContain("persona_version_immutable");
  });

  it("Persona、Version 與 Conversation 的 tenant 關係不能交叉接錯", () => {
    expect(migration).toContain("unique (id, tenant_id)");
    expect(migration).toContain("foreign key (persona_id, tenant_id)");
    expect(migration).toContain("foreign key (active_version_id, id, tenant_id)");
    expect(migration).toContain("foreign key (persona_version_id, persona_id, tenant_id)");
  });

  it("Persona 預設不公開，必須由主人明確發布", () => {
    expect(migration).toContain("is_published boolean not null default false");
  });

  it("撥號 Admission 在資料庫函式中原子保留名額", () => {
    expect(migration).toContain("function public.reserve_voice_admission");
    expect(migration).toContain("for update of p");
    expect(migration).toContain("insert into public.voice_admissions");
    expect(migration).toContain("update public.conversations");
  });

  it("跨學員搶全域名額時使用 transaction advisory lock 串行化", () => {
    expect(admissionMigration).toContain("pg_advisory_xact_lock");
    expect(admissionMigration).toContain("student-ai-avatar:voice-admission-global");
  });

  it("聲音試聽限流保存在資料庫且不開放 browser Data API", () => {
    expect(previewLimiterMigration).toContain("table public.voice_preview_rate_limits");
    expect(previewLimiterMigration).toContain("function public.consume_voice_preview_rate_limit");
    expect(previewLimiterMigration).toContain(
      "alter table public.voice_preview_rate_limits enable row level security",
    );
    expect(previewLimiterMigration).toContain(
      "revoke all on table public.voice_preview_rate_limits from public, anon, authenticated",
    );
  });
});
