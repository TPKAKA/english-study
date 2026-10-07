import assert from "node:assert/strict";
import test from "node:test";
import { parse, serialize } from "cookie";
import { stringFromBase64URL, stringToBase64URL } from "@supabase/ssr";
import { createAuthHandlers } from "../src/lib/auth/auth-server.js";
import { sessionNames, SESSION_MAX_AGE, withCookieSession, sessionJson, readJson, requestOrigin } from "../src/lib/auth/session-server.js";
import { createProgressHandlers } from "../src/lib/study/progress-server.js";
import { createAdminHandlers } from "../src/lib/admin/admin-server.js";
import { createIpaHandlers } from "../src/lib/admin/ipa-server.js";
import { createSupabaseRequestClient } from "../src/lib/supabase/supabase-server.js";
import { createStudyApiClient } from "../src/lib/api/api-client.js";
import { authBackend, testEnv, testUser } from "./helpers/auth-backend.js";

function harness({ https = true } = {}) {
  const backend = authBackend(), jar = new Map(), responses = [], origin = https ? "https://study.example.com" : "http://localhost:3000";
  const dependencies = { env: testEnv, fetchRequest: backend.fetchRequest };
  const auth = createAuthHandlers(dependencies), progress = createProgressHandlers(dependencies);
  const names = sessionNames({ url: testEnv.url_db }, new Request(origin));
  let csrf;
  function request(path, body, headers = {}) {
    return new Request(origin + path, { method: body === undefined ? "GET" : "POST", headers: {
      Cookie: [...jar].map(([name, value]) => serialize(name, value)).join("; "),
      ...(body === undefined ? {} : { Origin: origin, "Content-Type": "application/json", "X-CSRF-Token": csrf || "", "Sec-Fetch-Site": "same-origin" }), ...headers
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  async function receive(response) {
    const setCookies = response.headers.getSetCookie();
    for (const cookie of setCookies) {
      const [name, value] = Object.entries(parse(cookie))[0];
      if (cookie.includes("Max-Age=0")) jar.delete(name); else jar.set(name, value);
    }
    const body = await response.json();
    if (body.csrfToken) csrf = body.csrfToken;
    responses.push({ response, body, setCookies });
    return { response, body, setCookies };
  }
  const authCall = async (body, headers) => receive(await auth[body === undefined ? "GET" : "POST"](request("/api/auth/session", body, headers)));
  return { backend, jar, names, responses, dependencies, request, receive, authCall, progress,
    async login() { await authCall(); return authCall({ action: "password", email: testUser.email, password: "test-password-only" }); }
  };
}

test("IPA lookup requires the existing cookie, CSRF, confirmed admin email and editor grant; it never writes content", async () => {
  const app = harness();
  let lookups = 0;
  const api = createIpaHandlers({ env: testEnv,
    createClient: (config, token) => createSupabaseRequestClient(config, token, app.backend.fetchRequest),
    lookup: async words => { lookups++; return words.map(word => ({ word, status: "not-found", candidates: [] })); }
  });
  const call = (body = { words: ["hello"] }, headers = {}) => withCookieSession(app.request("/api/admin/ipa", body, headers), internal => api.POST(internal), app.dependencies);
  assert.equal((await call()).status, 401); await app.login();
  for (const headers of [{ "X-CSRF-Token": "" }, { Origin: "https://evil.example.com" }]) assert.equal((await call(undefined, headers)).status, 403);
  app.backend.tables.content_editors = [];
  assert.equal((await call()).status, 403); assert.equal(lookups, 0);
  app.backend.tables.content_editors = [{ user_id: testUser.id }];
  for (const words of [[], Array(21).fill("hello"), ["https://evil.example.com"]]) assert.equal((await call({ words })).status, 400);
  const result = await call();
  assert.equal(result.status, 200); assert.equal(result.headers.get("cache-control"), "private, no-store"); assert.equal(result.headers.get("vary"), "Cookie");
  assert.deepEqual(await result.json(), { ok: true, results: [{ word: "hello", status: "not-found", candidates: [] }] });
  assert.equal(lookups, 1);
  assert.ok(!app.backend.calls.some(call => call.url.pathname.startsWith("/rest/") && call.method !== "GET"));
  const wrongEmail = createIpaHandlers({ env: { ...testEnv, ADMIN_EMAIL: "other@example.com" }, createClient: (config, token) => createSupabaseRequestClient(config, token, app.backend.fetchRequest), lookup: () => { lookups++; } });
  assert.equal((await withCookieSession(app.request("/api/admin/ipa", { words: ["hello"] }), internal => wrongEmail.POST(internal), app.dependencies)).status, 403);
  assert.equal(lookups, 1);
});

test("server login issues 30-day HttpOnly host-only cookies; response JSON contains no credentials", async () => {
  const app = harness();
  const { body, response, setCookies } = await app.login();
  assert.equal(response.status, 200);
  assert.deepEqual(body.user, { id: testUser.id, email: testUser.email });
  assert.equal(SESSION_MAX_AGE, 2592000);
  assert.ok(setCookies.length >= 2);
  for (const value of setCookies) {
    assert.match(value, /HttpOnly/); assert.match(value, /Secure/); assert.match(value, /SameSite=Lax/); assert.match(value, /Path=\//); assert.match(value, /Max-Age=2592000/);
    assert.ok(value.startsWith("__Host-")); assert.ok(!value.includes("Domain=")); assert.ok(!value.includes("test-password-only"));
  }
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.ok(!/access_token|refresh_token|password|padding/.test(JSON.stringify(body)));
  assert.equal((await app.authCall()).body.user.id, testUser.id);
  assert.equal(app.backend.calls.filter(call => call.url.searchParams.get("grant_type") === "password").length, 1);
  assert.ok(app.backend.calls.every(call => call.cache === "no-store"));
  const local = harness({ https: false });
  assert.ok((await local.login()).setCookies.every(cookie => cookie.includes("HttpOnly") && !cookie.includes("Secure")));
});

test("large Unicode sessions chunk safely and logout clears all chunks without exposing tokens", async () => {
  const app = harness(); app.backend.padding = "Tiếng Việt /kəˈlæbəreɪt/ ".repeat(200);
  const logged = await app.login();
  assert.ok(logged.setCookies.filter(cookie => cookie.startsWith(app.names.session + ".")).length > 1);
  assert.ok(logged.setCookies.every(cookie => Buffer.byteLength(cookie) < 4096));
  assert.equal((await app.authCall()).body.user.id, testUser.id);
  const loggedOut = await app.authCall({ action: "sign-out" });
  assert.equal(loggedOut.response.status, 200);
  assert.equal(loggedOut.body.user, null);
  assert.ok(![...app.jar.keys()].some(name => name === app.names.session || name.startsWith(app.names.session + ".")));
  assert.equal((await app.authCall()).body.user, null);
  assert.ok(app.backend.calls.some(call => call.url.pathname.endsWith("logout") && call.url.searchParams.get("scope") === "local"));
});

test("expired session refreshes on the server and renews HttpOnly cookies without a password", async () => {
  const app = harness(); await app.login();
  const value = app.jar.get(app.names.session);
  const stored = JSON.parse(stringFromBase64URL(value.slice(7)));
  stored.expires_at = Math.floor(Date.now() / 1000) - 60;
  app.jar.set(app.names.session, "base64-" + stringToBase64URL(JSON.stringify(stored)));
  const restored = await app.authCall();
  assert.equal(restored.body.user.id, testUser.id);
  assert.ok(restored.setCookies.some(cookie => cookie.startsWith(app.names.session) && cookie.includes("HttpOnly") && cookie.includes("Max-Age=2592000")));
  assert.equal(app.backend.calls.filter(call => call.url.searchParams.get("grant_type") === "refresh_token").length, 1);
});

test("forged, revoked and legacy browser cookies cannot grant a server identity", async () => {
  const app = harness();
  app.jar.set(app.names.legacy, "fake-old-auth");
  app.jar.set(app.names.legacy + ".0", "fake-chunk");
  assert.equal((await app.authCall()).body.user, null);
  assert.ok(!app.jar.has(app.names.legacy)); assert.ok(!app.jar.has(app.names.legacy + ".0"));
  await app.login();
  const stored = JSON.parse(stringFromBase64URL(app.jar.get(app.names.session).slice(7)));
  stored.access_token = stored.access_token.replace("mock-signature", "forged-signature");
  stored.user.email = "admin@example.com";
  app.jar.set(app.names.session, "base64-" + stringToBase64URL(JSON.stringify(stored)));
  assert.equal((await app.authCall()).body.user, null);
  assert.ok(!app.jar.has(app.names.session));
  await app.login(); app.backend.revoked = true;
  assert.equal((await app.authCall()).body.user, null);
  assert.ok(!app.jar.has(app.names.session));
});

test("login and cookie-authenticated mutations fail closed for missing/mismatched CSRF and cross-origin requests", async () => {
  const app = harness(); await app.authCall();
  const body = { action: "password", email: testUser.email, password: "test-password-only" };
  for (const headers of [{ Origin: "https://evil.example.com" }, { Origin: "null" }, { Origin: "" }, { "X-CSRF-Token": "" }, { "X-CSRF-Token": "f".repeat(64) }, { "Sec-Fetch-Site": "same-site" }, { "Content-Type": "text/plain" }]) {
    assert.equal((await app.authCall(body, headers)).response.status, 403);
  }
  assert.equal(app.backend.calls.length, 0);
  await app.login();
  let writes = 0;
  const response = await withCookieSession(app.request("/api/admin", { entity: "groups" }, { "X-CSRF-Token": "" }), async () => { writes++; return sessionJson({ ok: true }); }, app.dependencies);
  assert.equal(response.status, 403); assert.equal(writes, 0);
  const bearerOnly = new Request("https://study.example.com/api/admin", { headers: { Authorization: "Bearer forged-token" } });
  assert.equal((await withCookieSession(bearerOnly, () => { writes++; }, app.dependencies)).status, 401);
  assert.equal(writes, 0);
});

test("OTP login and password update work server-side and errors never include secrets", async () => {
  const app = harness(); await app.authCall();
  assert.equal((await app.authCall({ action: "send-code", email: testUser.email })).response.status, 200);
  const otp = app.backend.calls.find(call => call.url.pathname.endsWith("/otp"));
  assert.equal(otp.body.email, testUser.email);
  assert.equal((await app.authCall({ action: "verify-code", email: testUser.email, token: "123456" })).body.user.id, testUser.id);
  assert.equal((await app.authCall({ action: "password-update", password: "updated-test-password" })).response.status, 200);
  const denied = await app.authCall({ action: "password", email: testUser.email, password: "wrong-test-password" });
  assert.equal(denied.response.status, 400);
  assert.ok(!JSON.stringify(denied.body).includes("password details"));
});

test("cookie-backed admin retains verified email and editor-grant checks", async () => {
  const app = harness(); await app.login();
  const handlers = createAdminHandlers({ env: testEnv, createClient: (config, token) => createSupabaseRequestClient(config, token, app.backend.fetchRequest) });
  const call = () => withCookieSession(app.request("/api/admin"), request => handlers.GET(request), app.dependencies);
  assert.equal((await app.receive(await call())).body.canEdit, true);
  app.backend.tables.content_editors = [];
  assert.equal((await call()).status, 403);
});

test("cookie authorization preserves body and identity when Next proxies the Request object", async () => {
  const app = harness(); await app.login();
  const original = app.request("/api/admin", { entity: "groups", action: "create" });
  const proxy = new Proxy(original, { get(target, key) { const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value; } });
  const result = await withCookieSession(proxy, async (internal, { user }) => {
    assert.equal(user.id, testUser.id);
    assert.match(internal.headers.get("authorization"), /^Bearer /);
    assert.deepEqual(await readJson(internal), { entity: "groups", action: "create" });
    return sessionJson({ ok: true });
  }, app.dependencies);
  assert.equal(result.status, 200);
});

test("progress writes derive owner from verified cookies and compute reading scores on the server", async () => {
  const app = harness(); await app.login();
  const words = { owner: testUser.id, type: "words", rows: [{ word: "agenda", is_known: true, updated_at: new Date().toISOString(), user_id: "another-user" }] };
  assert.equal((await app.progress.POST(app.request("/api/progress", words))).status, 200);
  assert.equal(app.backend.tables.vocabulary_progress[0].user_id, testUser.id);
  const forgedOwner = { ...words, owner: "another-user" };
  assert.equal((await app.progress.POST(app.request("/api/progress", forgedOwner))).status, 409);
  const attempts = { owner: testUser.id, type: "attempts", rows: [{ id: "c9d8b28d-41a1-46a4-892f-74a045a29d32", reading_id: "remote-work", answers: [1, 2, 1, 1], score: 999, total: 999, user_id: "another-user", completed_at: new Date().toISOString() }] };
  assert.equal((await app.progress.POST(app.request("/api/progress", attempts))).status, 200);
  assert.equal(app.backend.tables.reading_attempts[0].score, 4);
  assert.equal(app.backend.tables.reading_attempts[0].total, 4);
  assert.equal(app.backend.tables.reading_attempts[0].user_id, testUser.id);
  assert.equal((await app.progress.POST(app.request("/api/progress", { ...words, rows: [{ ...words.rows[0], word: "missing-word" }] }))).status, 400);
  assert.equal((await app.progress.GET(app.request("/api/progress?owner=another-user"))).status, 409);
});

test("browser facade sends no Bearer credentials, preserves learning cache and restores cookies through same-origin API", async () => {
  const app = harness(), legacy = new Map([[app.names.legacy, "old-token"], ["english-study:progress", "keep"]]);
  const calls = [];
  const browser = { location: { hash: "", pathname: "/", search: "" }, localStorage: { removeItem: key => legacy.delete(key) } };
  const fetchRequest = async (path, init) => {
    calls.push({ path, init });
    const response = await app.authCall(init.body ? JSON.parse(init.body) : undefined);
    return Response.json(response.body, { status: response.response.status });
  };
  const client = createStudyApiClient({ url: testEnv.url_db }, browser, fetchRequest);
  assert.ok(!legacy.has(app.names.legacy)); assert.equal(legacy.get("english-study:progress"), "keep");
  const logged = await client.auth.signInWithPassword({ email: testUser.email, password: "test-password-only" });
  assert.equal(logged.error, null);
  assert.deepEqual(logged.data.session, { user: { id: testUser.id, email: testUser.email } });
  assert.ok(calls.every(({ path, init }) => path.startsWith("/api/") && !init.headers.Authorization && init.credentials === "same-origin"));
  assert.ok(calls.some(({ init }) => init.headers["X-CSRF-Token"]));
  assert.equal((await client.auth.getSession()).data.session.user.id, testUser.id);
  assert.equal((await client.auth.signOut()).error, null);
  assert.equal((await client.auth.getSession()).data.session, null);
});

test("temporary Auth outage does not discard a valid session or expose upstream diagnostics", async () => {
  const app = harness(); await app.login();
  const old = app.jar.get(app.names.session);
  app.backend.unavailable = true;
  const result = await app.authCall();
  assert.equal(result.response.status, 503);
  assert.equal(app.jar.get(app.names.session), old);
  assert.ok(!JSON.stringify(result.body).includes("upstream diagnostic"));
  app.backend.unavailable = false;
  assert.equal((await app.authCall()).body.user.id, testUser.id);
});

test("browser cannot claim successful login when cookies are blocked", async () => {
  const app = harness();
  const browser = { location: { hash: "" } };
  const client = createStudyApiClient({ url: testEnv.url_db }, browser, async (_path, init) => {
    app.jar.clear();
    const result = await app.authCall(init.body ? JSON.parse(init.body) : undefined);
    return Response.json(result.body, { status: result.response.status });
  });
  const result = await client.auth.signInWithPassword({ email: testUser.email, password: "test-password-only" });
  assert.equal(result.error.code, "csrf_failed");
  assert.equal(app.backend.calls.length, 0);
});

test("JSON limits and malformed login requests cannot call Auth", async () => {
  const app = harness(); await app.authCall();
  for (const body of [null, { action: "password", email: "invalid", password: "test-password-only" }, { action: "verify-code", email: testUser.email, token: "abc" }, { action: "password", email: testUser.email, password: "x".repeat(129) }]) {
    assert.equal((await app.authCall(body)).response.status, 400);
  }
  assert.equal(app.backend.calls.length, 0);
  await assert.rejects(() => readJson(new Request("https://example.com", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: "x".repeat(50) }) }), 20), /too large/);
});

test("origin checks use the external Host, never an internal Next hostname or untrusted forwarded host", () => {
  const request = new Request("http://localhost:3001/api/auth/session", { headers: { Host: "127.0.0.1:3001", "X-Forwarded-Host": "evil.example.com", "X-Forwarded-Proto": "https" } });
  assert.equal(requestOrigin(request, {}), "http://127.0.0.1:3001");
  const deployed = new Request("http://localhost:3000/api/auth/session", { headers: { Host: "study.example.com", "X-Forwarded-Proto": "https" } });
  assert.equal(requestOrigin(deployed, { VERCEL: "1" }), "https://study.example.com");
  assert.ok(sessionNames({ url: testEnv.url_db }, deployed, { VERCEL: "1" }).secure);
  for (const host of ["evil.example.com/path", "evil.example.com@study.example.com", "study.example.com,evil.example.com"]) {
    assert.throws(() => requestOrigin(new Request("https://study.example.com", { headers: { Host: host } }), {}));
  }
});
