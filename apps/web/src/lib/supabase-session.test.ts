import { describe, expect, it } from "vitest";

import { createCourseSupabaseSession } from "./supabase-session.js";


describe("createCourseSupabaseSession", () => {
  it("允許本機 Supabase 使用 HTTP", () => {
    expect(() => createCourseSupabaseSession(
      "http://localhost:54321",
      "publishable-key",
    )).not.toThrow();
  });

  it("外部 Supabase URL 仍必須使用 HTTPS", () => {
    expect(() => createCourseSupabaseSession(
      "http://supabase.course.example",
      "publishable-key",
    )).toThrow("VITE_SUPABASE_URL");
  });
});
