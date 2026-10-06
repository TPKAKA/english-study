import assert from "node:assert/strict";
import test from "node:test";
import { createAdminHandlers, readAdminEmail } from "../lib/admin-server.js";
import { requestAdmin } from "../lib/admin-browser.js";
import { createSupabaseRequestClient } from "../lib/supabase-server.js";

const env = { url_db: "https://test-project.supabase.co", publishableKey: "sb_publishable_test_public_key_long", ADMIN_EMAIL: "admin@example.com" };
const admin = { id: "admin-id", email: env.ADMIN_EMAIL, email_confirmed_at: "2026-10-06T00:00:00Z" };
const action = { entity: "groups", action: "create", draft: { id: "new-group", title: "Group", sort_order: 0 } };
const request = (token = "admin-token", body) => new Request("https://example.com/api/admin", {
  method: body === undefined ? "GET" : "POST",
  headers: { ...(token ? { Authorization: "Bearer " + token } : {}), "Content-Type": "application/json" },
  ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) })
});

function backend({ user = admin, member = true, tableError = null, authError = null, config = env } = {}) {
  const calls = [];
  const client = {
    auth: { async getUser(token) { calls.push(["getUser", token]); return { data: { user }, error: authError }; } },
    from(table) {
      let inserted, single = false;
      return {
        select() { return this; }, eq(column, value) { calls.push(["filter", table, column, value]); return this; },
        limit() { return this; }, order() { return this; }, range() { return this; },
        insert(row) { inserted = row; calls.push(["insert", table, row]); return this; },
        single() { single = true; return this; },
        async abortSignal() {
          if (table === "content_editors") return { error: tableError, data: member ? [{ user_id: user?.id }] : [] };
          return { error: null, data: single ? inserted : [] };
        }
      };
    }
  };
  const handlers = createAdminHandlers({ env: config, createClient(config, token) { calls.push(["client", config, token]); return client; } });
  return { ...handlers, calls, client };
}

test("ADMIN_EMAIL is server-only configuration, normalized and limited to one address", () => {
  assert.equal(readAdminEmail({ ADMIN_EMAIL: " Admin@Example.com " }), "admin@example.com");
  assert.equal(readAdminEmail({}), "");
  for (const value of ["not-email", "a@example.com,b@example.com", "a@example.com\nb@example.com", "a@example.com; b@example.com"]) {
    assert.throws(() => readAdminEmail({ ADMIN_EMAIL: value }), error => !error.message.includes(value));
  }
});

test("missing/invalid token cannot read permissions or perform CRUD", async () => {
  const api = backend();
  assert.equal((await api.GET(request(null))).status, 401);
  assert.equal((await api.POST(request(null, action))).status, 401);
  assert.equal(api.calls.length, 0);
  const invalid = backend({ authError: { message: "Invalid JWT" }, user: null });
  assert.equal((await invalid.POST(request("forged-token", action))).status, 401);
  assert.ok(!invalid.calls.some(([name]) => name === "insert"));
});

test("missing or malformed ADMIN_EMAIL fails closed without publishing configured values", async () => {
  for (const value of ["", "private-invalid-value"]) {
    const api = backend({ config: { ...env, ADMIN_EMAIL: value } });
    const response = await api.GET(request());
    assert.equal(response.status, 503);
    assert.ok(!value || !(await response.text()).includes(value));
    assert.equal(api.calls.length, 0);
  }
});

test("verified email must match ADMIN_EMAIL even if the user has a database editor grant", async () => {
  const api = backend({ user: { ...admin, email: "learner@example.com", user_metadata: { email: env.ADMIN_EMAIL, role: "admin" } } });
  assert.equal((await api.GET(request())).status, 403);
  assert.equal((await api.POST(request("learner-token", { ...action, email: env.ADMIN_EMAIL }))).status, 403);
  assert.ok(!api.calls.some(([name]) => name === "filter" || name === "insert"));
});

test("an unverified or anonymous identity cannot gain admin access", async () => {
  for (const user of [{ ...admin, email_confirmed_at: null }, { ...admin, is_anonymous: true }]) {
    const api = backend({ user });
    assert.equal((await api.POST(request("unverified-token", action))).status, 403);
    assert.ok(!api.calls.some(([name]) => name === "insert"));
  }
});

test("matching admin email still requires an explicit database grant", async () => {
  const api = backend({ member: false });
  const response = await api.GET(request());
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /content_editors/);
  assert.equal((await api.POST(request("admin-token", action))).status, 403);
  assert.ok(!api.calls.some(([name]) => name === "insert"));
  const missingMigration = backend({ tableError: { code: "PGRST205", message: "Private backend details" } });
  const missingResponse = await missingMigration.GET(request());
  assert.equal(missingResponse.status, 503);
  assert.ok(!(await missingResponse.text()).includes("Private backend"));
});

test("granted admin can check access and create content; responses are private and uncached", async () => {
  const api = backend({ user: { ...admin, email: "ADMIN@example.com" } });
  const response = await api.GET(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("vary"), "Authorization");
  assert.deepEqual(await response.json(), { ok: true, canEdit: true });
  assert.equal((await api.POST(request("admin-token", action))).status, 200);
  assert.ok(api.calls.some(([name, table, row]) => name === "insert" && table === "vocabulary_groups" && row.id === "new-group"));
  assert.ok(api.calls.filter(([name]) => name === "getUser").length === 2);
  assert.ok(!api.calls.some(([name, table]) => name === "insert" && table === "content_editors"));
});

test("invalid requests and protected table names cannot be used as CRUD targets", async () => {
  const api = backend();
  for (const body of ["broken-json", null, { entity: "content_editors", action: "create", draft: {} }, { entity: "groups", action: "upsert", draft: {} }, { entity: "words", action: "create" }, { ...action, draft: { ...action.draft, title: " " } }]) {
    assert.equal((await api.POST(request("admin-token", body))).status, 400);
  }
  assert.ok(!api.calls.some(([name]) => name === "insert"));
});

test("the real Supabase SDK forwards each request's JWT to Auth and database without a shared session", async () => {
  const requests = [];
  const fakeFetch = async (input, init) => {
    const url = new URL(input);
    const headers = new Headers(init.headers);
    const authorization = headers.get("authorization");
    requests.push({ url, authorization, key: headers.get("apikey"), cache: init.cache });
    const owner = authorization === "Bearer admin-token" ? admin : { ...admin, email: "other@example.com", id: "other-id" };
    return Response.json(url.pathname === "/auth/v1/user" ? owner : [{ user_id: owner.id }]);
  };
  const api = createAdminHandlers({ env, createClient: (config, token) => createSupabaseRequestClient(config, token, fakeFetch) });
  assert.equal((await api.GET(request("admin-token"))).status, 200);
  assert.equal((await api.GET(request("other-token"))).status, 403);
  assert.equal(requests.length, 3);
  assert.deepEqual(requests.map(call => call.authorization), ["Bearer admin-token", "Bearer admin-token", "Bearer other-token"]);
  assert.ok(requests.every(call => call.key === env.publishableKey && call.cache === "no-store"));
  assert.ok(requests[1].url.pathname.includes("content_editors"));
});

test("browser API calls send only the session JWT and content, never an admin email claim", async () => {
  const calls = [];
  const client = { auth: { async getSession() { return { data: { session: { access_token: "session-token" } } }; } } };
  const fakeFetch = async (url, options) => { calls.push([url, options]); return Response.json({ ok: true, canEdit: true }); };
  assert.equal((await requestAdmin(client, undefined, fakeFetch)).canEdit, true);
  assert.equal((await requestAdmin(client, action, fakeFetch)).ok, true);
  assert.equal(calls[0][0], "/api/admin");
  assert.equal(calls[0][1].method, "GET");
  assert.equal(calls[1][1].headers.Authorization, "Bearer session-token");
  assert.deepEqual(JSON.parse(calls[1][1].body), action);
  assert.ok(!calls[1][1].body.includes(env.ADMIN_EMAIL));
});

test("browser API handles missing session, server denial and network failure without granting access", async () => {
  const guest = { auth: { async getSession() { return { data: { session: null } }; } } };
  let requested = false;
  assert.equal((await requestAdmin(guest, undefined, async () => { requested = true; })).ok, false);
  assert.equal(requested, false);
  const user = { auth: { async getSession() { return { data: { session: { access_token: "token" } } }; } } };
  assert.equal((await requestAdmin(user, undefined, async () => Response.json({ ok: false, error: "Forbidden" }, { status: 403 }))).canEdit, false);
  assert.equal((await requestAdmin(user, action, async () => { throw new Error("Private network details"); })).ok, false);
});
