import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const learner = "00000000-0000-0000-0000-000000000001", other = "00000000-0000-0000-0000-000000000002";
const sql = path => readFile(new URL("../" + path, import.meta.url), "utf8");

test("typing practice migration, RLS, tombstones and atomic writes", async t => {
  const db = new PGlite();
  const asRole = async (role, id, action) => {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id || ""]); await db.exec("set role " + role);
    try { return await action(); } finally { await db.exec("reset role"); }
  };
  const denied = (action, code = "42501") => assert.rejects(action, error => error.code === code);
  const row = (word = "agenda", needs_retry = true, answered_at = new Date().toISOString()) => ({ word, needs_retry, answered_at, mode: "meaning", last_answer: needs_retry ? "wrong" : word });
  const save = rows => db.query("select public.save_vocabulary_practice($1::jsonb)", [JSON.stringify(rows)]);
  try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth; create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
      grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
    `);
    await db.query("insert into auth.users values ($1), ($2)", [learner, other]);
    await db.exec(await sql("supabase/schema.sql")); await db.exec(await sql("supabase/seed.sql"));
    await db.exec(await sql("supabase/migrations/20261007_typing_practice.sql"));
    const initial = row();

    await t.test("anonymous visitors and missing identities cannot use private practice data", async () => {
      await asRole("anon", null, async () => { await denied(() => db.query("select * from public.vocabulary_practice")); await denied(() => save([initial])); });
      await asRole("authenticated", null, () => denied(() => save([initial])));
    });
    await t.test("ordinary learners only see/write their own records, without editor privileges", async () => {
      await asRole("authenticated", learner, async () => {
        await save([{ ...initial, user_id: other }]); assert.equal((await db.query("select user_id from public.vocabulary_practice")).rows[0].user_id, learner);
        await denied(() => db.query("update public.vocabulary_practice set user_id = $1", [other]));
      });
      await asRole("authenticated", other, async () => {
        assert.equal((await db.query("select * from public.vocabulary_practice")).rows.length, 0);
        assert.equal((await db.query("update public.vocabulary_practice set needs_retry = false returning word")).rows.length, 0);
        await save([row()]);
      });
    });
    await t.test("correct retry tombstones prevent old mistakes or equal-timestamp replays from reappearing", async () => {
      await asRole("authenticated", learner, async () => {
        const correct = row("agenda", false, new Date(Date.parse(initial.answered_at) + 1000).toISOString());
        await save([correct]); await save([initial]); await save([{ ...correct, needs_retry: true }]);
        assert.equal((await db.query("select needs_retry from public.vocabulary_practice")).rows[0].needs_retry, false);
      });
    });
    await t.test("invalid batches rollback all rows and enforce date, mode, size and duplicate limits", async () => {
      await asRole("authenticated", learner, async () => {
        const item = row("reschedule");
        for (const rows of [[], [item, item], Array(501).fill(item), [{ ...item, needs_retry: null }], [{ ...item, answered_at: "1999-01-01T00:00:00.000Z" }], [{ ...item, answered_at: new Date(Date.now() + 3600000).toISOString() }]]) await denied(() => save(rows), "22023");
        await denied(() => save([item, row("not-in-catalog")]), "23503");
        await denied(() => save([item, { ...row("deadline"), mode: "invalid" }]), "23514");
        await denied(() => save([{ ...item, last_answer: "a".repeat(201) }]), "23514");
        assert.equal((await db.query("select * from public.vocabulary_practice where word = 'reschedule'")).rows.length, 0);
      });
    });
    await t.test("rerunning migration retains correct/mistake states and does not change known progress", async () => {
      await asRole("authenticated", learner, () => db.query("insert into public.vocabulary_progress (user_id, word, is_known) values ($1, 'agenda', true)", [learner]));
      await db.exec(await sql("supabase/migrations/20261007_typing_practice.sql"));
      assert.equal((await db.query("select count(*)::int as n from public.vocabulary_practice")).rows[0].n, 2);
      assert.equal((await db.query("select is_known from public.vocabulary_progress where user_id = $1", [learner])).rows[0].is_known, true);
    });
    await t.test("deleting vocabulary or an account cascades practice records", async () => {
      await asRole("authenticated", learner, () => save([row("reschedule")]));
      await db.query("delete from public.vocabulary_words where word = 'reschedule'");
      assert.equal((await db.query("select * from public.vocabulary_practice where word = 'reschedule'")).rows.length, 0);
      await db.query("delete from auth.users where id = $1", [other]); assert.equal((await db.query("select * from public.vocabulary_practice where user_id = $1", [other])).rows.length, 0);
    });
  } finally { await db.close(); }
});
