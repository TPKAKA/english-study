import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { reviewSrsCard } from "../src/lib/study/srs.js";

const owner = "00000000-0000-0000-0000-000000000001", learner = "00000000-0000-0000-0000-000000000002";
const sql = path => readFile(new URL("../" + path, import.meta.url), "utf8");
test("multilingual migration preserves learning, immutable IDs and RLS on real PostgreSQL", async t => {
  const db = new PGlite();
  const denied = (action, code) => assert.rejects(action, error => error.code === code);
  const asRole = async (role, id, action) => {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id || ""]); await db.exec(`set role ${role}`);
    try { return await action(); } finally { await db.exec("reset role"); }
  };
  const importRows = (rows, mode = "skip") => db.query("select public.import_vocabulary_words($1::jsonb, $2) result", [JSON.stringify(rows), mode]);
  const sample = { word: "회의", group_id: "ko-work", meaning: "cuộc họp", ipa: "", reading: "", romanization: "hoeui", example: "회의가 있어요.", cloze_text: "_____가 있어요.", cloze_answer: "회의", sort_order: 0 };
  const now = new Date().toISOString(), card = reviewSrsCard(null, 3, now);
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid; $$;
      grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
    await db.query("insert into auth.users values($1), ($2)", [owner, learner]);
    for (const file of ["schema.sql", "seed.sql", "migrations/20261006_content_crud.sql", "migrations/20261006_vocabulary_import.sql", "migrations/20261007_spaced_repetition.sql", "migrations/20261007_typing_practice.sql"]) await db.exec(await sql("supabase/" + file));
    await db.query("insert into public.content_editors values($1)", [owner]);
    await db.query("insert into public.vocabulary_progress(user_id,word,is_known) values($1,'agenda',true), ($1,'old-orphan',true)", [owner]);
    await asRole("authenticated", owner, async () => {
      await db.query("select public.save_vocabulary_srs($1)", [JSON.stringify([{ word: "agenda", rating: 3, reviewed_at: now, card }])]);
      await db.query("select public.save_vocabulary_practice($1)", [JSON.stringify([{ word: "agenda", mode: "meaning", needs_retry: true, last_answer: "wrong", answered_at: now }])]);
    });
    await db.exec(await sql("supabase/migrations/20261007_multilingual.sql"));
    await db.exec(await sql("supabase/korean-seed.sql"));

    await t.test("existing IDs, orphan progress, SRS and mistakes survive migration and word renames", async () => {
      assert.equal((await db.query("select id from public.vocabulary_words where word='agenda'")).rows[0].id, "agenda");
      assert.deepEqual((await db.query("select card_id from public.vocabulary_progress order by card_id")).rows, [{ card_id: "agenda" }, { card_id: "old-orphan" }]);
      await asRole("authenticated", owner, () => db.query("update public.vocabulary_words set word='meeting agenda' where id='agenda'"));
      assert.deepEqual((await db.query("select card_id,card from public.vocabulary_srs")).rows, [{ card_id: "agenda", card }]);
      assert.equal((await db.query("select card_id from public.vocabulary_practice")).rows[0].card_id, "agenda");
      await denied(() => db.query("update public.vocabulary_words set id='changed' where id='agenda'"), "22023");
      await denied(() => db.query("update public.vocabulary_words set group_id='ko-work' where id='agenda'"), "22023");
      await denied(() => db.query("update public.vocabulary_groups set language_code='ko' where id='meetings-schedule'"), "22023");
    });

    await t.test("Korean seed is additive and group-local duplicates are isolated", async () => {
      assert.equal((await db.query("select count(*)::int n from public.vocabulary_words")).rows[0].n, 52);
      await db.query("insert into public.vocabulary_words(id,word,group_id,meaning) values('en-same','회의','meetings-schedule','loanword')");
      await denied(() => db.query("insert into public.vocabulary_words(word,group_id,meaning) values(' 회의 ','ko-work','duplicate')"), "23505");
      await asRole("authenticated", owner, async () => {
        const result = await importRows([{ ...sample, meaning: "đã sửa" }], "update");
        assert.equal(result.rows[0].result.imported, 1);
        assert.equal((await db.query("select id,meaning from public.vocabulary_words where group_id='ko-work' and word='회의'")).rows[0].id, "ko-meeting");
        assert.equal((await db.query("select meaning from public.vocabulary_words where id='en-same'")).rows[0].meaning, "loanword");
        const rows = [{ ...sample, word: "새 단어", cloze_text: "", cloze_answer: "" }, { ...sample, word: "실패", group_id: "missing-group" }];
        await denied(() => importRows(rows), "23503");
        assert.equal((await db.query("select id from public.vocabulary_words where word='새 단어'")).rows.length, 0);
      });
    });

    await t.test("public reads languages but only editors manage them; occupied codes are protected", async () => {
      await asRole("anon", null, async () => { assert.equal((await db.query("select code from public.study_languages")).rows.length, 2); await denied(() => db.query("insert into public.study_languages values('ja','Nhật','ja-JP','reading',2)"), "42501"); });
      await asRole("authenticated", learner, async () => { await denied(() => importRows([sample]), "42501"); await denied(() => db.query("insert into public.study_languages values('ja','Nhật','ja-JP','reading',2)"), "42501"); });
      await asRole("authenticated", owner, async () => {
        await db.query("insert into public.study_languages values('ja','Tiếng Nhật','ja-JP','reading',2)");
        await denied(() => db.query("update public.study_languages set code='jp' where code='ja'"), "22023");
        await denied(() => db.query("delete from public.study_languages where code='ko'"), "23001");
        await db.query("delete from public.study_languages where code='ja'");
      });
    });

    await t.test("Korean schedules and practice use card IDs, are owner-isolated, and newer results win", async () => {
      await asRole("authenticated", learner, async () => {
        await db.query("select public.save_vocabulary_srs($1)", [JSON.stringify([{ word: "ko-school", rating: 3, reviewed_at: now, card }])]);
        const row = { word: "ko-school", mode: "cloze", needs_retry: false, last_answer: "학교", answered_at: now };
        await db.query("select public.save_vocabulary_practice($1)", [JSON.stringify([row])]);
        await db.query("select public.save_vocabulary_practice($1)", [JSON.stringify([{ ...row, needs_retry: true, answered_at: "2001-01-01T00:00:00Z" }])]);
        assert.deepEqual((await db.query("select card_id,needs_retry from public.vocabulary_practice")).rows, [{ card_id: "ko-school", needs_retry: false }]);
        await denied(() => db.query("insert into public.vocabulary_progress(user_id,card_id) values($1,'not-a-card')", [learner]), "23503");
      });
      await asRole("authenticated", owner, async () => assert.equal((await db.query("select * from public.vocabulary_srs")).rows.length, 1));
    });

    await t.test("reading RPC stores Korean language and rolls back questions on invalid updates", async () => {
      await asRole("authenticated", owner, async () => {
        const passage = { title: "한국어", passage: "안녕하세요.", time_label: "1 phút", sort_order: 0, language_code: "ko" };
        const questions = [{ prompt: "인사?", options: ["네", "아니요"], answer_index: 0 }];
        await db.query("select public.save_reading_content('ko-reading',true,$1,$2)", [JSON.stringify(passage), JSON.stringify(questions)]);
        assert.equal((await db.query("select language_code from public.reading_passages where id='ko-reading'")).rows[0].language_code, "ko");
        await denied(() => db.query("select public.save_reading_content('ko-reading',false,$1,$2)", [JSON.stringify({ ...passage, language_code: "en" }), JSON.stringify(questions)]), "22023");
        await denied(() => db.query("select public.save_reading_content('ko-reading',false,$1,$2)", [JSON.stringify(passage), JSON.stringify([{ ...questions[0], answer_index: 5 }])]), "23514");
        assert.equal((await db.query("select count(*)::int n from public.reading_questions where reading_id='ko-reading'")).rows[0].n, 1);
      });
    });

    await t.test("rerunning migration/seed retains edited words, pronunciation, IDs and all learning", async () => {
      const before = (await db.query("select id,word,meaning from public.vocabulary_words order by id")).rows;
      await db.exec(await sql("supabase/migrations/20261007_multilingual.sql")); await db.exec(await sql("supabase/korean-seed.sql"));
      assert.deepEqual((await db.query("select id,word,meaning from public.vocabulary_words order by id")).rows, before);
      assert.equal((await db.query("select count(*)::int n from public.vocabulary_srs")).rows[0].n, 2);
      assert.equal((await db.query("select count(*)::int n from public.vocabulary_progress")).rows[0].n, 2);
      await db.query("delete from public.vocabulary_words where id='ko-school'");
      assert.equal((await db.query("select card_id from public.vocabulary_srs where card_id='ko-school'")).rows.length, 0);
      assert.equal((await db.query("select card_id from public.vocabulary_practice where card_id='ko-school'")).rows.length, 0);
    });
  } finally { await db.close(); }
});
