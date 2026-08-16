import { describe, expect, it } from "vitest";

import { readWebEnvironment } from "./config.js";


describe("readWebEnvironment", () => {
  it("只允許公開瀏覽器設定", () => {
    const result = readWebEnvironment({
      VITE_API_URL: "http://localhost:8080",
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
      VITE_PERSONA_ID: "persona-1",
    });
    expect(result.personaId).toBe("persona-1");
    expect(result.apiUrl).toBe("http://localhost:8080");
    expect(result.personaAvatarUrl).toBe("");
  });

  it("允許學員替換公開 Persona 頭像", () => {
    const result = readWebEnvironment({
      VITE_API_URL: "http://localhost:8080",
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
      VITE_PERSONA_ID: "persona-1",
      VITE_PERSONA_AVATAR_URL: "/img/student-avatar.png",
    });
    expect(result.personaAvatarUrl).toBe("/img/student-avatar.png");
  });

  it("正式 Core URL 不允許明文 HTTP", () => {
    expect(() => readWebEnvironment({
      VITE_API_URL: "http://api.course.example",
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
      VITE_PERSONA_ID: "persona-1",
    })).toThrow("VITE_API_URL");
  });
});
