import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

type RateLimitResult = {
  allowed: boolean;
  retry_after_seconds: number | null;
};

describeWithDatabase("consume_voice_preview_rate_limit concurrency", () => {
  const sql = postgres(databaseUrl!, { max: 10, connect_timeout: 10 });
  let userId = "";

  beforeAll(async () => {
    const [user] = await sql<Array<{ id: string }>>`
      select id from auth.users order by created_at limit 1
    `;
    if (!user) throw new Error("整合測試需要至少一個本機帳號");
    userId = user.id;
    await sql`delete from public.voice_preview_rate_limits where user_id = ${userId}`;
  });

  afterAll(async () => {
    if (userId) {
      await sql`delete from public.voice_preview_rate_limits where user_id = ${userId}`;
    }
    await sql.end({ timeout: 5 });
  });

  it("十個同時請求在限制為二時只允許兩個", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => sql<Array<RateLimitResult>>`
        select allowed, retry_after_seconds
        from public.consume_voice_preview_rate_limit(${userId}, 2, 60)
      `),
    );
    const rows = results.map(([row]) => row!);

    expect(rows.filter((row) => row.allowed)).toHaveLength(2);
    expect(rows.filter((row) => !row.allowed)).toHaveLength(8);
    expect(rows.filter((row) => !row.allowed).every(
      (row) => row.retry_after_seconds !== null && row.retry_after_seconds > 0,
    )).toBe(true);
  });
});
