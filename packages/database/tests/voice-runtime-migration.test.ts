import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";


const migrationPath = fileURLToPath(
  new URL("../../../supabase/migrations/20260813183636_voice_runtime_lifecycle.sql", import.meta.url),
);
const migration = readFileSync(migrationPath, "utf8").toLowerCase();

describe("voice_runtime_lifecycle", () => {
  it("逐字稿以 event id 冪等寫入，sequence 在 DB lock 內產生", () => {
    expect(migration).toContain("function public.append_voice_message");
    expect(migration).toContain("for update");
    expect(migration).toContain("on conflict (event_id) do nothing");
    expect(migration).toContain("max(m.sequence)");
  });

  it("通話開始與結束由 DB 原子轉移狀態", () => {
    expect(migration).toContain("function public.activate_voice_session");
    expect(migration).toContain("function public.finalize_voice_session");
    expect(migration).toContain("duration_seconds");
    expect(migration).toContain("used_seconds");
  });

  it("三個內部函式不開放給 browser roles", () => {
    for (const functionName of [
      "append_voice_message",
      "activate_voice_session",
      "finalize_voice_session",
    ]) {
      expect(migration).toContain(`revoke all on function public.${functionName}`);
    }
  });
});
