import { createClient, type SupabaseClient } from "@supabase/supabase-js";


export interface CourseSupabaseSession {
  client: SupabaseClient;
  getAccessToken: () => Promise<string | null>;
}

export function createCourseSupabaseSession(
  supabaseUrl: string,
  publishableKey: string,
): CourseSupabaseSession {
  const url = new URL(supabaseUrl);
  const localHttp = url.protocol === "http:"
    && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error("VITE_SUPABASE_URL 必須使用 https://");
  }
  if (!publishableKey.trim()) {
    throw new Error("缺少 VITE_SUPABASE_PUBLISHABLE_KEY");
  }
  const client = createClient(url.toString(), publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return {
    client,
    getAccessToken: async () => {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session?.access_token ?? null;
    },
  };
}
