import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";


const migrationPath = fileURLToPath(new URL(
  "../../../supabase/migrations/20260813191307_conversation_summary_and_owner_management.sql",
  import.meta.url,
));
const migration = readFileSync(migrationPath, "utf8").toLowerCase();

describe("conversation_summary_and_owner_management", () => {
  it("通話結束時只從實際使用者訊息建立不臆測的本機摘要", () => {
    expect(migration).toContain("function public.build_local_conversation_summary");
    expect(migration).toContain("and m.role = 'user'");
    expect(migration).toContain("'local-extractive'");
    expect(migration).toContain("'first-user-message-v1'");
    expect(migration).toContain("summary = coalesce");
  });

  it("摘要函式不開放給 browser Data API 角色直接呼叫", () => {
    expect(migration).toContain(
      "revoke all on function public.build_local_conversation_summary(uuid)",
    );
  });
});
