import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";


const migrationPath = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260813184519_student_studio_owner_backend.sql",
    import.meta.url,
  ),
);
const migration = readFileSync(migrationPath, "utf8").toLowerCase();

describe("student_studio_owner_backend", () => {
  it("草稿與公開版本分離，草稿仍由後端管理", () => {
    expect(migration).toContain("create table public.persona_drafts");
    expect(migration).toContain("alter table public.persona_drafts enable row level security");
    expect(migration).toContain(
      "revoke all on table public.persona_drafts from anon, authenticated",
    );
    expect(migration).toContain("foreign key (persona_id, tenant_id)");
    expect(migration).toContain("function public.publish_persona_draft");
    expect(migration).toContain("for update of p, d");
    expect(migration).toContain(
      "revoke all on function public.publish_persona_draft(uuid)",
    );
  });

  it("訪客資料保留信箱與最後活動時間，供 OWNER 後臺查詢", () => {
    expect(migration).toContain("add column email text");
    expect(migration).toContain("add column last_seen_at timestamptz");
  });

  it("頭像欄位只存 Storage 路徑，檔案類型與大小由 bucket 限制", () => {
    expect(migration).toContain("add column avatar_path text");
    expect(migration).toContain("'persona-avatars'");
    expect(migration).toContain("5242880");
    expect(migration).toContain("image/jpeg");
    expect(migration).toContain("image/png");
    expect(migration).toContain("image/webp");
    expect(migration).not.toContain("create policy");
  });
});
