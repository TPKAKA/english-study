import assert from "node:assert/strict";
import test from "node:test";
import { createPasswordHandlers, readAdminPassword } from "../lib/admin-password.js";
import { requestDefaultPassword } from "../lib/admin-browser.js";
import { createSupabaseRequestClient } from "../lib/supabase-server.js";

const env = { ADMIN_EMAIL: "admin@example.com", ADMIN_PASSWORD: "test-private-password", url_db: "https://test-project.supabase.co", publishableKey: "sb_publishable_test_public_key_long" };
const admin = { id: "verified-admin-id", email: env.ADMIN_EMAIL, email_confirmed_at: "2026-10-06T00:00:00Z" };
const request = (method = "GET", token = "admin-token", body = { confirm: true }) => new Request("https://example.com/api/admin/password", {
  method, headers: { ...(token ? { Authorization: "Bearer " + token } : {}), "Content-Type": "application/json" },
  ...(method === "POST" ? { body: JSON.stringify(body) } : {})
});
function backend({ user = admin, config = env, authError = null, response = () => Response.json(admin) } = {}) {
  const calls = [];
  const handlers = createPasswordHandlers({ env: config,
    createClient: () => ({ auth: { async getUser(token) { calls.push(["getUser", token]); return { data: { user }, error: authError }; } } }),
    fetchRequest: async (url, options) => { calls.push([url, options]); return response(); }
  });
  return { ...handlers, calls };
}

test("default password is read from server environment exactly, without logging values", () => {
  assert.equal(readAdminPassword({}), "");
  assert.equal(readAdminPassword(env), env.ADMIN_PASSWORD);
  assert.equal(readAdminPassword({ ADMIN_PASSWORD: " spaces kept " }), " spaces kept ");
  assert.throws(() => readAdminPassword({ ADMIN_PASSWORD: "short" }), error => !error.message.includes("short"));
  assert.throws(() => readAdminPassword({ ADMIN_PASSWORD: "x".repeat(129) }));
});

test("default password setup is unavailable to guests, forged tokens, wrong or unconfirmed email", async () => {
  const guest = backend();
  assert.equal((await guest.POST(request("POST", null))).status, 401);
  assert.equal(guest.calls.length, 0);
  for (const settings of [{ authError: { code: "invalid_jwt" } }, { user: { ...admin, email: "other@example.com", user_metadata: { email: env.ADMIN_EMAIL } } }, { user: { ...admin, email_confirmed_at: null } }, { user: { ...admin, is_anonymous: true } }]) {
    const api = backend(settings);
    const response = await api.POST(request("POST"));
    assert.ok([401, 403].includes(response.status));
    assert.equal(api.calls.length, 1);
    assert.ok(!(await response.text()).includes(env.ADMIN_PASSWORD));
  }
});

test("configuration checks and explicit confirmation never write or publish the password", async () => {
  const api = backend();
  const available = await api.GET(request());
  assert.deepEqual(await available.json(), { ok: true, enabled: true });
  assert.match(available.headers.get("cache-control"), /private, no-store/);
  assert.equal((await api.POST(request("POST", "token", { confirm: false }))).status, 400);
  assert.equal(api.calls.length, 2);
  const disabled = backend({ config: { ...env, ADMIN_PASSWORD: "" } });
  assert.deepEqual(await (await disabled.GET(request())).json(), { ok: true, enabled: false });
  assert.equal((await disabled.POST(request("POST"))).status, 503);
});

test("setup updates only the verified caller using their JWT and publishable key", async () => {
  const api = backend();
  const response = await api.POST(request("POST", "current-user-token", { confirm: true, email: "other@example.com", password: "browser-override", user_id: "other-id" }));
  assert.deepEqual(await response.json(), { ok: true });
  const [url, options] = api.calls[1];
  assert.equal(url, env.url_db + "/auth/v1/user");
  assert.equal(options.method, "PUT");
  assert.equal(options.headers.Authorization, "Bearer current-user-token");
  assert.equal(options.headers.apikey, env.publishableKey);
  assert.equal(options.cache, "no-store");
  assert.deepEqual(JSON.parse(options.body), { password: env.ADMIN_PASSWORD });
});

test("Auth rejection and network errors do not reveal password or upstream diagnostics", async () => {
  for (const response of [() => Response.json({ message: env.ADMIN_PASSWORD }, { status: 422 }), () => { throw new Error(env.ADMIN_PASSWORD); }]) {
    const api = backend({ response });
    const result = await api.POST(request("POST"));
    assert.ok(!result.ok);
    assert.ok(!(await result.text()).includes(env.ADMIN_PASSWORD));
  }
});

test("real SDK verifies the JWT before server password update, without a service key", async () => {
  const calls = [];
  const fetchRequest = async (url, options) => { calls.push([url, options]); return Response.json(admin); };
  const api = createPasswordHandlers({ env, fetchRequest,
    createClient: (config, token) => createSupabaseRequestClient(config, token, fetchRequest) });
  assert.equal((await api.POST(request("POST"))).status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[0][1].method, "GET");
  assert.equal(calls[1][1].method, "PUT");
  assert.ok(calls.every(([, options]) => new Headers(options.headers).get("authorization") === "Bearer admin-token"));
});

test("browser setup sends explicit confirmation, never a password or target email", async () => {
  const client = { auth: { async getSession() { return { data: { session: { access_token: "token" } } }; } } };
  const calls = [];
  const fetchRequest = async (url, options) => { calls.push([url, options]); return Response.json({ ok: true }); };
  await requestDefaultPassword(client, false, fetchRequest);
  await requestDefaultPassword(client, true, fetchRequest);
  assert.ok(calls.every(([url]) => url === "/api/admin/password"));
  assert.equal(calls[0][1].method, "GET");
  assert.deepEqual(JSON.parse(calls[1][1].body), { confirm: true });
});
