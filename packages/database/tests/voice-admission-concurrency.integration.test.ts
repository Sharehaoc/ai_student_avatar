import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

type AdmissionFixture = {
  conversationId: string;
  tenantId: string;
};

type AdmissionResult = {
  allowed: boolean;
  code: string;
};

describeWithDatabase("reserve_voice_admission concurrency", () => {
  const sql = postgres(databaseUrl!, { max: 4, connect_timeout: 10 });
  const fixtures: AdmissionFixture[] = [];

  beforeAll(async () => {
    const personas = await sql<
      Array<{
        tenant_id: string;
        persona_id: string;
        persona_version_id: string;
        system_prompt: string;
        opening_message: string;
        voice_snapshot: unknown;
        pronunciation_fixes: unknown;
      }>
    >`
      select
        p.tenant_id,
        p.id as persona_id,
        pv.id as persona_version_id,
        pv.system_prompt,
        pv.opening_message,
        pv.voice_snapshot,
        pv.pronunciation_fixes
      from public.personas p
      join public.persona_versions pv on pv.id = p.active_version_id
      join public.usage_policies up on up.tenant_id = p.tenant_id
      where up.voice_enabled = true
      order by p.tenant_id
      limit 2
    `;
    const [user] = await sql<Array<{ id: string }>>`
      select id from auth.users order by created_at limit 1
    `;

    if (personas.length < 2 || !user) {
      throw new Error("整合測試需要至少兩個已啟用語音的學員分身與一個本機帳號");
    }

    for (const persona of personas) {
      const promptSnapshot = {
        systemPrompt: persona.system_prompt,
        openingMessage: persona.opening_message,
      };
      const voiceSnapshot = JSON.parse(
        JSON.stringify({
          ...(persona.voice_snapshot as Record<string, unknown>),
          pronunciationFixes: persona.pronunciation_fixes,
        }),
      ) as postgres.JSONValue;
      const [conversation] = await sql<Array<{ id: string }>>`
        insert into public.conversations (
          tenant_id,
          persona_id,
          persona_version_id,
          visitor_user_id,
          status,
          prompt_snapshot,
          voice_snapshot
        ) values (
          ${persona.tenant_id},
          ${persona.persona_id},
          ${persona.persona_version_id},
          ${user.id},
          'PENDING',
          ${sql.json(promptSnapshot)},
          ${sql.json(voiceSnapshot)}
        )
        returning id
      `;
      fixtures.push({
        conversationId: conversation!.id,
        tenantId: persona.tenant_id,
      });
    }
  });

  afterAll(async () => {
    if (fixtures.length > 0) {
      await sql`
        delete from public.conversations
        where id in ${sql(fixtures.map((fixture) => fixture.conversationId))}
      `;
    }
    await sql.end({ timeout: 5 });
  });

  it("不同學員同時搶最後一個全域名額時只放行一個", async () => {
    let arrived = 0;
    let releaseBarrier!: () => void;
    const barrier = new Promise<void>((resolve) => {
      releaseBarrier = resolve;
    });

    const reserve = async (fixture: AdmissionFixture) =>
      sql.begin(async (transaction) => {
        await transaction`
          select tenant_id
          from public.usage_policies
          where tenant_id = ${fixture.tenantId}
          for update
        `;

        arrived += 1;
        if (arrived === fixtures.length) {
          releaseBarrier();
        }
        await barrier;

        const [result] = await transaction<Array<AdmissionResult>>`
          select allowed, code
          from public.reserve_voice_admission(
            ${fixture.conversationId},
            (select visitor_user_id from public.conversations where id = ${fixture.conversationId}),
            1,
            10000
          )
        `;
        return result!;
      });

    const results = await Promise.all(fixtures.map(reserve));

    expect(results.filter((result) => result.allowed)).toHaveLength(1);
    expect(results.filter((result) => !result.allowed)).toEqual([
      expect.objectContaining({ code: "GLOBAL_CONCURRENCY_LIMIT" }),
    ]);
  });
});
