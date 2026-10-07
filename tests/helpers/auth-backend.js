import { STUDY_CONTENT } from "../../src/data/study-content.js";

export const testEnv = { url_db: "https://cookie-test.supabase.co", publishableKey: "sb_publishable_cookie_test_key_long", ADMIN_EMAIL: "learner@example.com" };
export const testUser = { id: "a4c6e968-cb3a-4ec2-a3e2-865afda18fa1", email: testEnv.ADMIN_EMAIL, email_confirmed_at: "2026-10-06T00:00:00Z", user_metadata: {}, app_metadata: { provider: "email" } };

export function authBackend() {
  const calls = [], issued = new Set(), refreshes = new Set();
  const tables = {
    vocabulary_groups: STUDY_CONTENT.groups.map((g, sort_order) => ({ id: g.id, title: g.n, sort_order })),
    vocabulary_words: STUDY_CONTENT.groups.flatMap(g => g.w.map((w, sort_order) => ({ word: w[0], group_id: g.id, meaning: w[1], example: w[2], ipa: w[3], sort_order }))),
    reading_passages: STUDY_CONTENT.readings.map((r, sort_order) => ({ id: r.id, title: r.t, time_label: r.time, passage: r.p, sort_order })),
    reading_questions: STUDY_CONTENT.readings.flatMap(r => r.q.map((q, sort_order) => ({ reading_id: r.id, sort_order, prompt: q.q, options: q.o, answer_index: q.a, explanation: q.e }))),
    content_editors: [{ user_id: testUser.id }], vocabulary_progress: [], reading_attempts: []
  };
  const backend = { calls, tables, revoked: false, unavailable: false, expires: 3600, padding: "" };
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
    const table = url.pathname.split("/").at(-1);
    if (!Object.hasOwn(tables, table)) throw new Error("Unexpected mock table: " + table);
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
        const index = tables[table].findIndex(old => table === "vocabulary_progress" ? old.user_id === row.user_id && old.word === row.word : table === "vocabulary_words" ? old.word === row.word : old.id === row.id);
        if (index < 0) tables[table].push(row);
        else if (!headers.get("prefer")?.includes("ignore-duplicates")) tables[table][index] = row;
      }
      return headers.get("prefer")?.includes("return=representation") ? Response.json(headers.get("accept")?.includes("object+json") ? inputRows[0] : inputRows, { status: 201 }) : new Response(null, { status: 201 });
    }
    let rows = tables[table].filter(matches);
    rows = rows.slice(Number(url.searchParams.get("offset") || 0), Number(url.searchParams.get("offset") || 0) + Number(url.searchParams.get("limit") || 500));
    const columns = url.searchParams.get("select");
    if (columns && columns !== "*") rows = rows.map(row => Object.fromEntries(columns.split(",").map(key => [key, row[key]])));
    return Response.json(rows);
  };
  return backend;
}
