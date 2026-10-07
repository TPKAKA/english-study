import assert from "node:assert/strict";
import test from "node:test";
import { parse, serialize } from "cookie";
import { createSessionCookieStorage, SESSION_COOKIE_MAX_AGE } from "../lib/session-cookie-storage.js";
import { createSupabaseBrowserClient } from "../lib/supabase-browser.js";

const config = { url: "https://cookie-test.supabase.co", publishableKey: "sb_publishable_cookie_test_key_long" };
const key = "sb-cookie-test-auth-token";
const user = { id: "user-a", email: "learner@example.com", user_metadata: { name: "Người học" }, app_metadata: { provider: "email" } };
const token = expires => [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
  Buffer.from(JSON.stringify({ sub: user.id, exp: expires, role: "authenticated" })).toString("base64url"), "test-signature"].join(".");
const session = (expires = Math.floor(Date.now() / 1000) + 3600, refresh = "test-refresh") => ({
  access_token: token(expires), refresh_token: refresh, token_type: "bearer", expires_at: expires, expires_in: 3600, user
});

function browser({ https = true, blockedCookies = false, blockedStorage = false } = {}) {
  const cookies = new Map(), legacy = new Map(), writes = [];
  const document = {
    get cookie() { return [...cookies].map(([name, value]) => serialize(name, value)).join("; "); },
    set cookie(value) {
      writes.push(value);
      if (blockedCookies) return;
      const [name, content] = Object.entries(parse(value))[0];
      if (value.includes("Max-Age=0")) cookies.delete(name); else cookies.set(name, content);
    }
  };
  const environment = {
    document, location: { protocol: https ? "https:" : "http:" },
    get localStorage() {
      if (blockedStorage) throw new Error("blocked storage");
      return { getItem: name => legacy.get(name) ?? null, setItem: (name, value) => legacy.set(name, value), removeItem: name => legacy.delete(name) };
    }
  };
  const storage = createSessionCookieStorage({ document, secure: https, sessionKey: key, legacyStorage: () => environment.localStorage });
  return { cookies, legacy, writes, environment, storage };
}

test("session cookie persists 30 days with HTTPS, SameSite=Lax and host-only scope", async () => {
  const app = browser();
  const value = JSON.stringify(session());
  await app.storage.setItem(key, value);
  assert.equal(await app.storage.getItem(key), value);
  assert.equal(SESSION_COOKIE_MAX_AGE, 2592000);
  for (const cookie of app.writes) {
    assert.match(cookie, /Max-Age=2592000/);
    assert.match(cookie, /Path=\//);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Secure/);
    assert.ok(!cookie.includes("Domain="));
    assert.ok(!cookie.includes("HttpOnly"));
  }
  const local = browser({ https: false });
  await local.storage.setItem(key, value);
  assert.ok(local.writes.every(cookie => !cookie.includes("Secure")));
});

test("large Unicode sessions chunk safely and replacing them removes obsolete chunks", async () => {
  const app = browser();
  const long = JSON.stringify({ ...session(), user: { ...user, user_metadata: { name: "Tiếng Việt /kəˈlæbəreɪt/ ".repeat(200) } } });
  await app.storage.setItem(key, long);
  assert.ok(app.cookies.size > 1);
  assert.ok(app.writes.every(value => new TextEncoder().encode(value).length < 4096));
  assert.equal(await app.storage.getItem(key), long);
  const short = JSON.stringify(session());
  await app.storage.setItem(key, short);
  assert.deepEqual([...app.cookies.keys()], [key]);
  assert.equal(await app.storage.getItem(key), short);
  await app.storage.setItem(key, long);
  assert.ok(!app.cookies.has(key));
  assert.equal(await app.storage.getItem(key), long);
});

test("existing auth migrates once without changing progress or another project's auth", async () => {
  const app = browser();
  const value = JSON.stringify(session());
  app.legacy.set(key, value);
  app.legacy.set("english-study:progress", "progress-data");
  app.legacy.set("sb-other-auth-token", "other-session");
  assert.equal(await app.storage.getItem(key), value);
  assert.equal(app.legacy.has(key), false);
  assert.equal(app.cookies.size, 1);
  assert.equal(app.legacy.get("english-study:progress"), "progress-data");
  assert.equal(app.legacy.get("sb-other-auth-token"), "other-session");
  const next = createSessionCookieStorage({ document: app.environment.document, secure: true, sessionKey: key, legacyStorage: () => null });
  assert.equal(await next.getItem(key), value);
});

test("logout removes every auth chunk and old auth cache so reload cannot resurrect a session", async () => {
  const app = browser();
  await app.storage.setItem(key, JSON.stringify({ ...session(), padding: "x".repeat(9000) }));
  app.cookies.set("unrelated", "keep");
  app.legacy.set(key, JSON.stringify(session()));
  await app.storage.removeItem(key);
  assert.deepEqual([...app.cookies.entries()], [["unrelated", "keep"]]);
  assert.equal(app.legacy.has(key), false);
  assert.equal(await app.storage.getItem(key), null);
});

test("corrupt and incomplete cookies are cleared without falling back to stale auth", async () => {
  for (const name of [key, `${key}.1`]) {
    const app = browser();
    app.cookies.set(name, "base64-invalid!");
    app.legacy.set(key, JSON.stringify(session()));
    assert.equal(await app.storage.getItem(key), null);
    assert.equal(app.cookies.size, 0);
    assert.equal(app.legacy.has(key), false);
  }
  const invalid = browser();
  invalid.legacy.set(key, '{"email":"admin@example.com"}');
  assert.equal(await invalid.storage.getItem(key), null);
  assert.equal(invalid.cookies.size, 0);
});

test("cookies work when localStorage is blocked; blocked cookies cannot silently report persistence", async () => {
  const app = browser({ blockedStorage: true });
  const value = JSON.stringify(session());
  await app.storage.setItem(key, value);
  assert.equal(await app.storage.getItem(key), value);
  const blocked = browser({ blockedCookies: true });
  blocked.legacy.set(key, value);
  await assert.rejects(() => blocked.storage.setItem(key, value), error => error.code === "session_storage_unavailable");
  assert.equal(blocked.legacy.get(key), value);
  assert.equal(blocked.cookies.size, 0);
});

function authBackend({ revoked = false } = {}) {
  const requests = [];
  const fetchRequest = async (input, options = {}) => {
    const url = new URL(input);
    requests.push({ path: url.pathname, grant: url.searchParams.get("grant_type"), body: options.body ? JSON.parse(options.body) : null });
    if (url.pathname.endsWith("/logout")) return new Response(null, { status: 204 });
    if (url.pathname.endsWith("/user")) return Response.json(user);
    if (revoked && url.searchParams.get("grant_type") === "refresh_token") {
      return Response.json({ code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" }, { status: 400 });
    }
    if (url.pathname.endsWith("/token")) return Response.json(session(undefined, `refresh-${requests.length}`));
    if (url.pathname.endsWith("/verify")) return Response.json(session());
    throw new Error("Unexpected mock Auth request");
  };
  return { requests, fetchRequest };
}

test("real Supabase SDK stores password login in cookies and restores it in a fresh client", async () => {
  const app = browser(), backend = authBackend();
  const first = createSupabaseBrowserClient(config, app.environment, backend.fetchRequest);
  let next;
  try {
    assert.equal(first.auth.persistSession, true);
    assert.equal(first.auth.autoRefreshToken, true);
    assert.equal(first.auth.flowType, "implicit");
    const result = await first.auth.signInWithPassword({ email: user.email, password: "not-a-real-password" });
    assert.equal(result.error, null);
    assert.equal(result.data.user.id, user.id);
    assert.ok(app.cookies.size > 0);
    assert.ok(!JSON.stringify([...app.cookies]).includes("not-a-real-password"));
    assert.equal(app.legacy.has(key), false);
    await first.auth.dispose();
    next = createSupabaseBrowserClient(config, app.environment, backend.fetchRequest);
    const restored = await next.auth.getSession();
    assert.equal(restored.error, null);
    assert.equal(restored.data.session.user.id, user.id);
    assert.equal(backend.requests.filter(request => request.grant === "password").length, 1);
    const logout = await next.auth.signOut({ scope: "local" });
    assert.equal(logout.error, null);
    assert.equal(app.cookies.size, 0);
    assert.equal((await next.auth.getSession()).data.session, null);
  } finally { await first.auth.dispose(); await next?.auth.dispose(); }
});

test("real Supabase SDK refreshes an expired cookie session and renews the cookie without password login", async () => {
  const app = browser(), backend = authBackend();
  const old = session(Math.floor(Date.now() / 1000) - 60, "old-refresh");
  await app.storage.setItem(key, JSON.stringify(old));
  app.writes.length = 0;
  const client = createSupabaseBrowserClient(config, app.environment, backend.fetchRequest);
  try {
    const restored = await client.auth.getSession();
    assert.equal(restored.error, null);
    assert.equal(restored.data.session.user.id, user.id);
    assert.notEqual(restored.data.session.refresh_token, old.refresh_token);
    assert.deepEqual(backend.requests.filter(request => request.grant).map(request => request.grant), ["refresh_token"]);
    assert.equal(backend.requests[0].body.refresh_token, "old-refresh");
    assert.ok(app.writes.some(cookie => cookie.includes("Max-Age=2592000")));
    assert.equal(JSON.parse(await app.storage.getItem(key)).refresh_token, restored.data.session.refresh_token);
  } finally { await client.auth.dispose(); }
});

test("real Supabase SDK restores migrated auth, stores OTP login and clears revoked sessions", async () => {
  const app = browser(), backend = authBackend();
  app.legacy.set(key, JSON.stringify(session()));
  const client = createSupabaseBrowserClient(config, app.environment, backend.fetchRequest);
  try {
    assert.equal((await client.auth.getSession()).data.session.user.id, user.id);
    assert.equal(app.legacy.has(key), false);
    assert.ok(app.cookies.size > 0);
    await client.auth.signOut({ scope: "local" });
    const otp = await client.auth.verifyOtp({ email: user.email, token: "123456", type: "email" });
    assert.equal(otp.error, null);
    assert.ok(app.cookies.size > 0);
    assert.ok(!JSON.stringify([...app.cookies]).includes("123456"));
  } finally { await client.auth.dispose(); }

  const revoked = browser(), rejectedBackend = authBackend({ revoked: true });
  await revoked.storage.setItem(key, JSON.stringify(session(Math.floor(Date.now() / 1000) - 60)));
  const rejected = createSupabaseBrowserClient(config, revoked.environment, rejectedBackend.fetchRequest);
  try {
    assert.equal((await rejected.auth.getSession()).data.session, null);
    assert.equal(revoked.cookies.size, 0);
  } finally { await rejected.auth.dispose(); }
});
