import { describe, expect, it } from "vitest";

import { extractBearerToken, SupabaseJwtVerifier } from "./supabase-jwt-verifier.js";


describe("extractBearerToken", () => {
  it("只接受單一 Bearer access token", () => {
    expect(extractBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it.each([null, "", "Basic abc", "Bearer", "Bearer one two"])(
    "拒絕不安全或不完整的 Authorization header：%s",
    (value) => {
      expect(() => extractBearerToken(value)).toThrow("UNAUTHORIZED");
    },
  );
});

describe("SupabaseJwtVerifier", () => {
  it("允許本機 Supabase 使用 HTTP", () => {
    expect(() => new SupabaseJwtVerifier({
      supabaseUrl: "http://127.0.0.1:54321",
    })).not.toThrow();
  });

  it("外部 Supabase URL 仍必須使用 HTTPS", () => {
    expect(() => new SupabaseJwtVerifier({
      supabaseUrl: "http://supabase.course.example",
    })).toThrow("SUPABASE_URL");
  });
});
