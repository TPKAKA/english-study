import { STUDY_CONTENT } from "../../src/data/study-content.js";
import { MULTILINGUAL_CONTENT } from "../../src/data/korean-content.js";
import { cardId, cardMeta, DEFAULT_LANGUAGES } from "../../src/lib/study/languages.js";
import { randomUUID } from "node:crypto";

export const testEnv = { url_db: "https://cookie-test.supabase.co", publishableKey: "sb_publishable_cookie_test_key_long", ADMIN_EMAIL: "learner@example.com" };
export const testUser = { id: "a4c6e968-cb3a-4ec2-a3e2-865afda18fa1", email: testEnv.ADMIN_EMAIL, email_confirmed_at: "2026-10-06T00:00:00Z", user_metadata: {}, app_metadata: { provider: "email" } };

export function authBackend({ multilingual = false } = {}) {
  const calls = [], issued = new Set(), refreshes = new Set();
  const tables = {
    vocabulary_groups: STUDY_CONTENT.groups.map((g, sort_order) => ({ id: g.id, title: g.n, sort_order })),
    vocabulary_words: STUDY_CONTENT.groups.flatMap(g => g.w.map((w, sort_order) => ({ word: w[0], group_id: g.id, meaning: w[1], example: w[2], ipa: w[3], sort_order }))),
    reading_passages: STUDY_CONTENT.readings.map((r, sort_order) => ({ id: r.id, title: r.t, time_label: r.time, passage: r.p, sort_order })),
    reading_questions: STUDY_CONTENT.readings.flatMap(r => r.q.map((q, sort_order) => ({ reading_id: r.id, sort_order, prompt: q.q, options: q.o, answer_index: q.a, explanation: q.e }))),
    content_editors: [{ user_id: testUser.id }], vocabulary_progress: [], reading_attempts: [], vocabulary_srs: [], vocabulary_practice: []
  };
  const backend = { calls, tables, revoked: false, unavailable: false, srsUnavailable: false, practiceUnavailable: false, expires: 3600, padding: "" };
  if (multilingual) {
    tables.study_languages = structuredClone(DEFAULT_LANGUAGES);
    tables.vocabulary_groups = MULTILINGUAL_CONTENT.groups.map((group, sort_order) => ({ id: group.id, title: group.n, language_code: group.language_code || "en", sort_order }));
    tables.vocabulary_words = MULTILINGUAL_CONTENT.groups.flatMap(group => group.w.map((card, sort_order) => ({ word: card[0], id: cardId(card), group_id: group.id, meaning: card[1], example: card[2], ipa: card[3], reading: cardMeta(card).reading || "", romanization: cardMeta(card).romanization || "", cloze_text: cardMeta(card).cloze_text || "", cloze_answer: cardMeta(card).cloze_answer || "", sort_order })));
    tables.reading_passages = tables.reading_passages.map(row => ({ ...row, language_code: "en" }));
  }
  function issue() {
    const exp = Math.floor(Date.now() / 1000) + backend.expires;
    const access_token = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"), Buffer.from(JSON.stringify({ sub: testUser.id, exp, role: "authenticated", serial: calls.length })).toString("base64url"), "mock-signature"].join(".");
    const refresh_token = "private-refresh-" + calls.length;
    issued.add(access_token); refreshes.add(refresh_token);
    return { access_token, refresh_token, expires_in: backend.expires, expires_at: exp, token_type: "bearer", user: { ...testUser, user_metadata: { padding: backend.padding } } };
  }
  backend.fetchRequest = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const headers = new Headers(init.headers);
    const body = init.body ? JSON.parse(init.body) : null;
    const bearer = headers.get("authorization")?.replace(/^Bearer /, "");
    calls.push({ url, body, method: init.method || "GET", bearer, cache: init.cache });
    if (url.pathname.startsWith("/auth/v1")) {
      if (backend.unavailable) return Response.json({ message: "private upstream diagnostic" }, { status: 503 });
      if (url.pathname.endsWith("/token")) {
        const grant = url.searchParams.get("grant_type");
        if (grant === "password" && body.password !== "test-password-only") return Response.json({ code: "invalid_credentials", msg: "private password details" }, { status: 400 });
        if (grant === "password") backend.revoked = false;
        if (grant === "refresh_token" && (backend.revoked || !refreshes.has(body.refresh_token))) return Response.json({ code: "refresh_token_not_found", msg: "invalid refresh" }, { status: 400 });
        return Response.json(issue());
      }
      if (url.pathname.endsWith("/verify")) return body.token === "123456" ? Response.json(issue()) : Response.json({ msg: "invalid otp" }, { status: 400 });
      if (url.pathname.endsWith("/otp")) return Response.json({});
      if (!issued.has(bearer) || backend.revoked) return Response.json({ msg: "invalid jwt" }, { status: 401 });
      if (url.pathname.endsWith("/logout")) { backend.revoked = true; issued.clear(); refreshes.clear(); return new Response(null, { status: 204 }); }
      if (url.pathname.endsWith("/user")) return Response.json(testUser);
      throw new Error("Unexpected mock auth path");
    }
    if (url.pathname.endsWith("/vocabulary_srs") || url.pathname.endsWith("/rpc/save_vocabulary_srs")) {
      if (backend.srsUnavailable) return Response.json({ code: "PGRST205", message: "private missing migration details" }, { status: 404 });
      if (!issued.has(bearer) || backend.revoked) return Response.json({ code: "42501" }, { status: 403 });
    }
    if (url.pathname.endsWith("/rpc/save_vocabulary_srs")) {
      for (const item of body.p_rows) {
        const row = { ...item, ...(multilingual ? { card_id: item.word } : {}), user_id: testUser.id };
        const index = tables.vocabulary_srs.findIndex(old => old.user_id === row.user_id && (old.card_id || old.word) === row.word);
        if (index < 0) tables.vocabulary_srs.push(row);
        else if (tables.vocabulary_srs[index].reviewed_at < row.reviewed_at) tables.vocabulary_srs[index] = row;
      }
      return new Response(null, { status: 204 });
    }
    if (url.pathname.endsWith("/vocabulary_practice") || url.pathname.endsWith("/rpc/save_vocabulary_practice")) {
      if (backend.practiceUnavailable) return Response.json({ code: "PGRST205", message: "private missing practice migration" }, { status: 404 });
      if (!issued.has(bearer) || backend.revoked) return Response.json({ code: "42501" }, { status: 403 });
    }
    if (url.pathname.endsWith("/rpc/save_vocabulary_practice")) {
      for (const item of body.p_rows) {
        const row = { ...item, ...(multilingual ? { card_id: item.word } : {}), user_id: testUser.id };
        const index = tables.vocabulary_practice.findIndex(old => old.user_id === row.user_id && (old.card_id || old.word) === row.word);
        if (index < 0) tables.vocabulary_practice.push(row);
        else if (tables.vocabulary_practice[index].answered_at < row.answered_at) tables.vocabulary_practice[index] = row;
      }
      return new Response(null, { status: 204 });
    }
    if (multilingual && url.pathname.endsWith("/rpc/import_vocabulary_words")) {
      if (!issued.has(bearer) || backend.revoked || !tables.content_editors.some(row => row.user_id === testUser.id)) return Response.json({ code: "42501" }, { status: 403 });
      let imported = 0;
      for (const item of body.p_rows) {
        const existing = tables.vocabulary_words.find(row => row.group_id === item.group_id && row.word.trim().toLowerCase() === item.word.trim().toLowerCase());
        if (existing && body.p_mode === "skip") continue;
        if (existing) Object.assign(existing, { ...item, id: existing.id });
        else tables.vocabulary_words.push({ ...item, id: randomUUID() });
        imported++;
      }
      return Response.json({ imported, skipped: body.p_rows.length - imported });
    }
    const table = url.pathname.split("/").at(-1);
    if (table === "study_languages" && !multilingual) return Response.json({ code: "PGRST205" }, { status: 404 });
    if (!Object.hasOwn(tables, table)) throw new Error("Unexpected mock table: " + table);
    if (!multilingual && (url.searchParams.get("select")?.includes("card_id") || body?.[0]?.card_id || body?.card_id)) return Response.json({ code: "42703" }, { status: 400 });
    const matches = row => [...url.searchParams].every(([key, value]) => !value.startsWith("eq.") || row[key] === value.slice(3));
    if (["PATCH", "DELETE"].includes(init.method)) {
      if (!issued.has(bearer) || backend.revoked) return Response.json({ code: "42501" }, { status: 403 });
      const changed = tables[table].filter(matches).map(row => init.method === "PATCH" ? { ...row, ...body } : row);
      tables[table] = init.method === "DELETE" ? tables[table].filter(row => !matches(row)) : tables[table].map(row => matches(row) ? { ...row, ...body } : row);
      return Response.json(headers.get("accept")?.includes("object+json") ? changed[0] : changed);
    }
    if (init.method === "POST") {
      if (!issued.has(bearer) || backend.revoked) return Response.json({ code: "42501" }, { status: 403 });
      const inputRows = Array.isArray(body) ? body : [body];
      for (const row of inputRows) {
        const index = tables[table].findIndex(old => table === "vocabulary_progress" ? old.user_id === row.user_id && (old.card_id || old.word) === (row.card_id || row.word) : table === "vocabulary_words" ? (multilingual ? old.id === row.id : old.word === row.word) : table === "study_languages" ? old.code === row.code : old.id === row.id);
        if (index < 0) tables[table].push(row);
        else if (!headers.get("prefer")?.includes("ignore-duplicates")) tables[table][index] = row;
      }
      return headers.get("prefer")?.includes("return=representation") ? Response.json(headers.get("accept")?.includes("object+json") ? inputRows[0] : inputRows, { status: 201 }) : new Response(null, { status: 201 });
    }
    let rows = tables[table].filter(matches);
    rows = rows.slice(Number(url.searchParams.get("offset") || 0), Number(url.searchParams.get("offset") || 0) + Number(url.searchParams.get("limit") || 500));
    const columns = url.searchParams.get("select");
    if (columns && columns !== "*") rows = rows.map(row => Object.fromEntries(columns.split(",").map(key => { const [alias, column = alias] = key.split(":"); return [alias, row[column]]; })));
    return Response.json(rows);
  };
  return backend;
}
