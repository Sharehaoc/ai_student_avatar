export interface WebEnvironment {
  apiUrl: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
  personaId: string;
  personaAvatarUrl: string;
}

type EnvironmentRecord = Record<string, string | boolean | undefined>;

function required(values: EnvironmentRecord, name: string): string {
  const value = String(values[name] ?? "").trim();
  if (!value) throw new Error(`缺少必要環境變數：${name}`);
  return value;
}

function secureUrl(raw: string, name: string): string {
  const url = new URL(raw);
  const localHttp = url.protocol === "http:"
    && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error(`${name} 必須使用 HTTPS；只有本機 localhost 可使用 HTTP`);
  }
  return url.toString().replace(/\/$/, "");
}

export function readWebEnvironment(values: EnvironmentRecord): WebEnvironment {
  return {
    apiUrl: secureUrl(required(values, "VITE_API_URL"), "VITE_API_URL"),
    supabaseUrl: secureUrl(
      required(values, "VITE_SUPABASE_URL"),
      "VITE_SUPABASE_URL",
    ),
    supabasePublishableKey: required(values, "VITE_SUPABASE_PUBLISHABLE_KEY"),
    personaId: required(values, "VITE_PERSONA_ID"),
    personaAvatarUrl: String(values.VITE_PERSONA_AVATAR_URL ?? "").trim(),
  };
}
