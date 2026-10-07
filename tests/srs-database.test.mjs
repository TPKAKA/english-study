import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { reviewSrsCard } from "../src/lib/study/srs.js";

const learner = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
const sql = path => readFile(new URL("../" + path, import.meta.url), "utf8");

test("SRS PostgreSQL migration, account isolation, replay safety and atomic batches", async t => {
  const db = new PGlite();
  const asRole = async (role, id, action) => {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id || ""]);
    await db.exec("set role " + role);
    try { return await action(); } finally { await db.exec("reset role"); }
  };
  const denied = (action, code = "42501") => assert.rejects(action, error => error.code === code);
  const row = (word = "agenda", rating = 3, time = new Date().toISOString()) => ({ word, rating, reviewed_at: time, card: reviewSrsCard(null, rating, time) });
  const save = rows => db.query("select public.save_vocabulary_srs($1::jsonb)", [JSON.stringify(rows)]);
  try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth; create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
    `);
    await db.query("insert into auth.users values ($1), ($2)", [learner, other]);
    await db.exec(await sql("supabase/schema.sql"));
    await db.exec(await sql("supabase/seed.sql"));
    await db.exec(await sql("supabase/migrations/20261007_spaced_repetition.sql"));
    const first = row();

    await t.test("anonymous users cannot read, write or invoke the SRS RPC", async () => {
      await asRole("anon", null, async () => {
        await denied(() => db.query("select * from public.vocabulary_srs"));
        await denied(() => save([first]));
      });
      await asRole("authenticated", null, () => denied(() => save([first])));
    });

    await t.test("ordinary learners can save only their own schedules, with owner derived from auth.uid", async () => {
      await asRole("authenticated", learner, async () => {
        await save([{ ...first, user_id: other }]);
        const { rows } = await db.query("select user_id, card, rating from public.vocabulary_srs");
        assert.deepEqual(rows, [{ user_id: learner, card: first.card, rating: 3 }]);
        await denied(() => db.query("update public.vocabulary_srs set user_id = $1", [other]));
      });
      await asRole("authenticated", other, async () => {
        assert.equal((await db.query("select * from public.vocabulary_srs")).rows.length, 0);
        assert.equal((await db.query("update public.vocabulary_srs set rating = 1 returning word")).rows.length, 0);
        await save([row("agenda", 4)]);
        assert.equal((await db.query("select user_id from public.vocabulary_srs")).rows[0].user_id, other);
      });
    });

    await t.test("newer reviews win; old offline writes and exact retries cannot overwrite them", async () => {
      await asRole("authenticated", learner, async () => {
        const newer = row("agenda", 4, new Date(Date.parse(first.reviewed_at) + 1000).toISOString());
        await save([newer]); await save([first]); await save([{ ...newer, rating: 1 }]);
        const saved = (await db.query("select card, rating from public.vocabulary_srs")).rows[0];
        assert.deepEqual(saved, { card: newer.card, rating: 4 });
      });
    });

    await t.test("invalid batches rollback all writes, with duplicate and size limits", async () => {
      await asRole("authenticated", learner, async () => {
        const item = row("reschedule");
        for (const rows of [[], [item, item], Array(501).fill(item), [{ ...item, reviewed_at: "1999-01-01T00:00:00.000Z" }], [{ ...item, reviewed_at: new Date(Date.now() + 3600000).toISOString() }]]) await denied(() => save(rows), "22023");
        await denied(() => save([item, row("not-in-catalog")]), "23503");
        await denied(() => save([item, { ...row("deadline"), card: {} }]), "23502");
        await denied(() => save([{ ...item, card: { ...item.card, due: "2001-01-01T00:00:00.000Z" } }]), "23514");
        assert.equal((await db.query("select * from public.vocabulary_srs where word = 'reschedule'")).rows.length, 0);
        await denied(() => db.query("insert into public.vocabulary_srs (user_id, word, card, rating, due, reviewed_at) values ($1, 'reschedule', '{}', 3, now(), now())", [learner]), "23514");
      });
    });

    await t.test("rerunning migration retains schedules and leaves known-progress untouched", async () => {
      await asRole("authenticated", learner, () => db.query("insert into public.vocabulary_progress (user_id, word, is_known) values ($1, 'agenda', true)", [learner]));
      await db.exec(await sql("supabase/migrations/20261007_spaced_repetition.sql"));
      assert.equal((await db.query("select count(*)::int as n from public.vocabulary_srs")).rows[0].n, 2);
      assert.equal((await db.query("select is_known from public.vocabulary_progress where user_id = $1", [learner])).rows[0].is_known, true);
    });

    await t.test("deleting vocabulary or an account removes its schedules by foreign key", async () => {
      await asRole("authenticated", learner, () => save([row("reschedule")]));
      await db.query("delete from public.vocabulary_words where word = 'reschedule'");
      assert.equal((await db.query("select * from public.vocabulary_srs where word = 'reschedule'")).rows.length, 0);
      await db.query("delete from auth.users where id = $1", [other]);
      assert.equal((await db.query("select * from public.vocabulary_srs where user_id = $1", [other])).rows.length, 0);
    });
  } finally { await db.close(); }
});
