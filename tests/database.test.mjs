import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const editorId = "00000000-0000-0000-0000-000000000001";
const learnerId = "00000000-0000-0000-0000-000000000002";
const otherId = "00000000-0000-0000-0000-000000000003";
const sql = path => readFile(new URL("../" + path, import.meta.url), "utf8");

test("PostgreSQL migration, RLS and atomic reading CRUD", async t => {
  const db = new PGlite();
  const asRole = async (role, id, action) => {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id || ""]);
    await db.exec(role === "anon" ? "set role anon" : "set role authenticated");
    try { return await action(); } finally { await db.exec("reset role"); }
  };
  const denied = (action, code = "42501") => assert.rejects(action, error => error.code === code);
  const passage = { title: "New reading", time_label: "5 phút", passage: "A complete reading.", sort_order: 2 };
  const questions = [{ prompt: "What is this?", options: ["A reading", "An invoice"], answer_index: 0, explanation: "A reading." }];
  const saveReading = (create, data = passage, quiz = questions, id = "test-reading") => db.query(
    "select public.save_reading_content($1, $2, $3::jsonb, $4::jsonb)", [id, create, JSON.stringify(data), JSON.stringify(quiz)]);

  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
    `);
    await db.query("insert into auth.users values ($1), ($2), ($3)", [editorId, learnerId, otherId]);
    await db.exec(await sql("supabase/schema.sql"));
    await db.exec(await sql("supabase/seed.sql"));

    await t.test("upgrades the pre-IPA schema without resetting lessons", async () => {
      await db.exec(`
        alter table public.vocabulary_words drop column ipa;
        alter table public.vocabulary_words drop constraint vocabulary_words_group_id_fkey;
        alter table public.vocabulary_words add constraint vocabulary_words_group_id_fkey
          foreign key (group_id) references public.vocabulary_groups(id) on delete cascade;
      `);
      await db.exec(await sql("supabase/migrations/20261006_content_crud.sql"));
      await db.exec(await sql("supabase/ipa-backfill.sql"));
      const { rows } = await db.query("select count(*)::int as total, count(nullif(ipa, ''))::int as pronounced from public.vocabulary_words");
      assert.deepEqual(rows[0], { total: 42, pronounced: 42 });
      await db.query("insert into public.content_editors values ($1), ($2)", [editorId, otherId]);
    });

    await t.test("anonymous visitors can read lessons but cannot modify them or invoke the RPC", async () => {
      await asRole("anon", null, async () => {
        assert.equal((await db.query("select count(*)::int as total from public.vocabulary_words")).rows[0].total, 42);
        await denied(() => db.query("insert into public.vocabulary_groups values ('forbidden', 'Forbidden', 0)"));
        await denied(() => db.query("delete from public.vocabulary_words where word = 'agenda'"));
        await denied(() => saveReading(true));
      });
    });

    await t.test("ordinary users cannot self-promote, write lessons or use the reading RPC", async () => {
      await asRole("authenticated", learnerId, async () => {
        assert.equal((await db.query("select * from public.content_editors")).rows.length, 0);
        await denied(() => db.query("insert into public.content_editors values ($1)", [learnerId]));
        await denied(() => db.query("insert into public.vocabulary_groups values ('forbidden', 'Forbidden', 0)"));
        assert.equal((await db.query("update public.vocabulary_words set meaning = 'forbidden' where word = 'agenda' returning word")).rows.length, 0);
        assert.equal((await db.query("delete from public.reading_passages where id = 'remote-work' returning id")).rows.length, 0);
        await denied(() => saveReading(true));
      });
    });

    await t.test("an editor sees only their permission and can CRUD groups and words", async () => {
      await asRole("authenticated", editorId, async () => {
        assert.deepEqual((await db.query("select user_id from public.content_editors")).rows, [{ user_id: editorId }]);
        await db.query("insert into public.vocabulary_groups values ('test-group', 'New group', 10)");
        await db.query("insert into public.vocabulary_words (word, group_id, meaning, ipa) values ('collaborate', 'test-group', 'hợp tác', '/kəˈlæbəreɪt/')");
        await db.query("update public.vocabulary_words set meaning = 'cộng tác' where word = 'collaborate'");
        await db.query("update public.vocabulary_groups set title = 'Updated group' where id = 'test-group'");
        assert.equal((await db.query("select meaning from public.vocabulary_words where word = 'collaborate'")).rows[0].meaning, "cộng tác");
        await assert.rejects(() => db.query("delete from public.vocabulary_groups where id = 'test-group'"), error => ["23001", "23503"].includes(error.code));
        await db.query("update public.vocabulary_words set group_id = 'meetings-schedule' where word = 'collaborate'");
        await db.query("delete from public.vocabulary_groups where id = 'test-group'");
        await db.query("delete from public.vocabulary_words where word = 'collaborate'");
      });
    });

    await t.test("reading save is atomic and preserves old content when a question fails", async () => {
      await asRole("authenticated", editorId, async () => {
        await saveReading(true);
        assert.equal((await db.query("select count(*)::int as total from public.reading_questions where reading_id = 'test-reading'")).rows[0].total, 1);
        await denied(() => saveReading(false, { ...passage, title: "Should roll back" }, [{ ...questions[0], options: ["Only one"] }]), "23514");
        assert.equal((await db.query("select title from public.reading_passages where id = 'test-reading'")).rows[0].title, "New reading");
        assert.deepEqual((await db.query("select options from public.reading_questions where reading_id = 'test-reading'")).rows[0].options, questions[0].options);
        await denied(() => saveReading(true), "23505");
        await saveReading(false, { ...passage, title: "Updated reading" }, [...questions, { ...questions[0], prompt: "Second question?", answer_index: 1 }]);
        assert.equal((await db.query("select count(*)::int as total from public.reading_questions where reading_id = 'test-reading'")).rows[0].total, 2);
        await db.query("delete from public.reading_passages where id = 'test-reading'");
        assert.equal((await db.query("select * from public.reading_questions where reading_id = 'test-reading'")).rows.length, 0);
        await denied(() => saveReading(false), "P0002");
      });
    });

    await t.test("malformed quiz data rolls back and a revoked editor loses write access", async () => {
      await asRole("authenticated", editorId, async () => {
        await denied(() => saveReading(true, passage, []), "22023");
        await denied(() => saveReading(true, passage, [{ ...questions[0], options: ["", "ok"] }]), "22023");
        assert.equal((await db.query("select * from public.reading_passages where id = 'test-reading'")).rows.length, 0);
      });
      await db.query("delete from public.content_editors where user_id = $1", [otherId]);
      await asRole("authenticated", otherId, async () => { await denied(() => saveReading(true)); });
    });

    await t.test("learning progress remains isolated even from content editors", async () => {
      await asRole("authenticated", learnerId, async () => {
        await db.query("insert into public.vocabulary_progress (user_id, word, is_known) values ($1, 'agenda', true)", [learnerId]);
        await denied(() => db.query("insert into public.vocabulary_progress (user_id, word) values ($1, 'agenda')", [editorId]));
      });
      await asRole("authenticated", editorId, async () => {
        assert.equal((await db.query("select * from public.vocabulary_progress")).rows.length, 0);
      });
    });

    await t.test("rerunning migration and IPA backfill preserves editor grants and custom edits", async () => {
      await db.query("update public.vocabulary_words set ipa = '/custom/', meaning = 'Custom meaning' where word = 'reschedule'");
      await db.exec(await sql("supabase/migrations/20261006_content_crud.sql"));
      await db.exec(await sql("supabase/ipa-backfill.sql"));
      await db.exec(await sql("supabase/seed.sql"));
      assert.deepEqual((await db.query("select ipa, meaning from public.vocabulary_words where word = 'reschedule'")).rows[0], { ipa: "/custom/", meaning: "Custom meaning" });
      assert.equal((await db.query("select * from public.content_editors where user_id = $1", [editorId])).rows.length, 1);
      assert.equal((await db.query("select count(*)::int as total from public.vocabulary_words")).rows[0].total, 42);
    });
  } finally { await db.close(); }
});
