import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createStudySync } from "../src/lib/study/study-sync.js";
import { STUDY_CONTENT } from "../src/data/study-content.js";
import { mutateContent } from "../src/lib/content/content-admin.js";

const config = { url: "https://test-project.supabase.co", publishableKey: "sb_publishable_browser_test_key_long" };
const userA = { id: "user-a", email: "a@example.com" };
const userB = { id: "user-b", email: "b@example.com" };
const tick = () => new Promise(resolve => setImmediate(resolve));

async function waitFor(predicate) {
  for (let index = 0; index < 100; index++) {
    if (predicate()) return;
    await tick();
  }
  assert.fail("Timed out waiting for sync");
}

function backend() {
  return {
    failWrites: false, failReads: false, holdNext: false, release: null, writes: [],
    holdEditorOwner: null, releaseEditor: null,
    tables: {
      vocabulary_groups: STUDY_CONTENT.groups.map((group, sort_order) => ({ id: group.id, title: group.n, sort_order })),
      vocabulary_words: STUDY_CONTENT.groups.flatMap(group => group.w.map((word, sort_order) => ({ word: word[0], group_id: group.id, meaning: word[1], example: word[2], sort_order }))),
      reading_passages: STUDY_CONTENT.readings.map((reading, sort_order) => ({ id: reading.id, title: reading.t, time_label: reading.time, passage: reading.p, sort_order })),
      reading_questions: STUDY_CONTENT.readings.flatMap(reading => reading.q.map((question, sort_order) => ({ reading_id: reading.id, sort_order, prompt: question.q, options: question.o, answer_index: question.a, explanation: question.e }))),
      vocabulary_progress: [], reading_attempts: [], content_editors: []
    }
  };
}

function harness({ db = backend(), user = null, project = config, cache = new Map(), loginError = null, updateError = null, adminWrite = null } = {}) {
  let currentUser = user, authChange, otp, unsubscribed = false;
  const changes = [];
  const authCalls = [];
  const api = {
    auth: {
      onAuthStateChange(callback) { authChange = callback; return { data: { subscription: { unsubscribe() { unsubscribed = true; } } } }; },
      async getSession() { return { data: { session: currentUser ? { user: currentUser } : null }, error: null }; },
      async signOut() { currentUser = null; authChange("SIGNED_OUT", null); return { error: null }; },
      async signInWithOtp(request) { otp = request; return { error: null }; },
      async signInWithPassword(request) { authCalls.push(["password", request]); return { error: loginError, data: { session: loginError ? null : { user: userA } } }; },
      async verifyOtp(request) { authCalls.push(["verify", request]); return { error: loginError, data: { session: loginError ? null : { user: userA } } }; },
      async updateUser(request) { authCalls.push(["update", request]); return { error: updateError }; }
    },
    from(table) {
      let rows, options = {}, operation, single = false, limit = Infinity, offset = 0, end = Infinity;
      const filters = [], ordering = [];
      async function execute() {
        if (operation) {
          if (db.holdNext) { db.holdNext = false; await new Promise(resolve => { db.release = resolve; }); }
          if (db.failWrites) return { error: { message: "Network failure" } };
          db.writes.push({ table, rows, options });
          const matches = row => filters.every(([column, value]) => row[column] === value);
          let changed = [];
          if (operation === "delete") {
            changed = db.tables[table].filter(matches);
            db.tables[table] = db.tables[table].filter(row => !matches(row));
          } else if (operation === "update") {
            db.tables[table] = db.tables[table].map(row => {
              if (!matches(row)) return row;
              const updated = { ...row, ...rows[0] }; changed.push(updated); return updated;
            });
          } else for (const row of rows) {
            const index = db.tables[table].findIndex(existing => table === "vocabulary_progress" ? existing.user_id === row.user_id && existing.word === row.word : table === "vocabulary_words" ? existing.word === row.word : existing.id === row.id);
            if (index < 0) db.tables[table].push(row);
            else if (!options.ignoreDuplicates) db.tables[table][index] = row;
            changed.push(row);
          }
          return single ? { data: changed[0], error: changed.length === 1 ? null : { code: "PGRST116" } } : { error: null };
        }
        if (db.failReads) return { data: null, error: { message: "Network failure" } };
        if (!db.tables[table]) return { data: null, error: { code: "PGRST205" } };
        const data = db.tables[table].filter(row => filters.every(([column, value]) => row[column] === value));
        if (table === "content_editors" && filters.some(([, value]) => value === db.holdEditorOwner)) {
          db.holdEditorOwner = null;
          await new Promise(resolve => { db.releaseEditor = resolve; });
        }
        data.sort((a, b) => {
          for (const [column, ascending] of ordering) {
            if (a[column] !== b[column]) return a[column] < b[column] ? (ascending ? -1 : 1) : (ascending ? 1 : -1);
          }
          return 0;
        });
        return { data: data.slice(offset, Math.min(end + 1, offset + limit)), error: null };
      }
      return {
        select() { return this; }, eq(column, value) { filters.push([column, value]); return this; },
        order(column, opts) { ordering.push([column, opts?.ascending !== false]); return this; },
        range(start, last) { offset = start; end = last; return this; },
        limit(value) { limit = value; return this; }, abortSignal() { return this; },
        upsert(values, opts) { operation = "upsert"; rows = values; options = opts; return this; },
        insert(value) { operation = "insert"; rows = [value]; return this; },
        update(value) { operation = "update"; rows = [value]; return this; },
        delete() { operation = "delete"; return this; }, single() { single = true; return this; },
        then(resolve, reject) { return execute().then(resolve, reject); }
      };
    }
  };
  const sync = createStudySync({ config: project, initialContent: STUDY_CONTENT, createClient: () => api,
    adminRequest: async (client, change) => {
      if (change) { if (adminWrite) return adminWrite(client, change); await mutateContent(client, change, sync.snapshot().catalog, randomUUID); return { ok: true }; }
      const result = await client.from("content_editors").select("user_id").eq("user_id", currentUser.id);
      return { ok: !result.error, canEdit: !!result.data?.length };
    },
    storage: { getItem: key => cache.get(key) || null, setItem: (key, value) => cache.set(key, value) },
    onChange: value => changes.push(value), schedule: callback => setImmediate(callback), makeId: randomUUID
  });
  return { db, sync, cache, changes, authCalls, get otp() { return otp; }, get unsubscribed() { return unsubscribed; },
    async start() { await sync.start(); if (currentUser) await waitFor(() => !sync.snapshot().busy); },
    change(next) { currentUser = next; authChange("SIGNED_IN", next ? { user: next } : null); }
  };
}

test("guest vocabulary and reading history survive reload", async () => {
  const first = harness({ project: { url: "", publishableKey: "" } });
  await first.start();
  first.sync.mark("agenda", true);
  assert.equal(first.sync.saveAttempt("remote-work", [1, 2, 1, 1]), true);
  const next = harness({ cache: first.cache, project: { url: "", publishableKey: "" } });
  await next.start();
  assert.deepEqual(next.sync.snapshot().known, ["agenda"]);
  assert.equal(next.sync.snapshot().attempts[0].score, 4);
  first.sync.stop(); next.sync.stop();
});

test("blocked session cookies show an actionable login message without granting a session", async () => {
  const app = harness({ loginError: { code: "session_storage_unavailable" } });
  await app.start();
  assert.equal((await app.sync.signInWithPassword("a@example.com", "private-password")).ok, false);
  assert.equal(app.sync.snapshot().user, null);
  assert.match(app.sync.snapshot().authMessage, /cho phép cookie/);
  assert.equal(app.sync.snapshot().authMessage.includes("private-password"), false);
  app.sync.stop();
});

test("signing in does not merge guest progress into an account, and signing out restores it", async () => {
  const app = harness(); await app.start();
  app.sync.mark("agenda", true); app.sync.saveAttempt("remote-work", [1, 2, 1, 1]);
  app.change(userA); await waitFor(() => app.sync.snapshot().user?.id === userA.id && !app.sync.snapshot().busy);
  assert.deepEqual(app.sync.snapshot().known, []);
  assert.equal(app.sync.snapshot().attempts.length, 0);
  assert.equal(app.db.tables.vocabulary_progress.length, 0);
  assert.equal(app.db.tables.reading_attempts.length, 0);
  await app.sync.signOut(); await tick();
  assert.deepEqual(app.sync.snapshot().known, ["agenda"]);
  assert.equal(app.sync.snapshot().attempts.length, 1);
  app.sync.stop();
});

test("public lesson content loads from the existing four Supabase tables", async () => {
  const app = harness();
  await app.start();
  assert.equal(app.sync.snapshot().content.groups.flatMap(group => group.w).length, 42);
  assert.equal(app.sync.snapshot().content.readings.length, 2);
  assert.equal(app.sync.snapshot().content.readings[0].p, STUDY_CONTENT.readings[0].p);
  assert.equal(app.sync.snapshot().content.groups[0].w[0][3], "/ˌriːˈʃedjuːl/");
  assert.equal(app.sync.snapshot().contentStatus, "");
  app.sync.stop();
});

test("a successfully loaded empty database does not resurrect deleted lessons", async () => {
  const app = harness();
  for (const table of ["vocabulary_groups", "vocabulary_words", "reading_passages", "reading_questions"]) app.db.tables[table] = [];
  await app.start();
  assert.deepEqual(app.sync.snapshot().content, { groups: [], readings: [] });
  assert.equal(app.sync.snapshot().contentStatus, "");
  app.sync.stop();
});

test("unreachable lesson tables retain the built-in lessons with IPA", async () => {
  const app = harness(); app.db.failReads = true;
  await app.start();
  assert.equal(app.sync.snapshot().content, STUDY_CONTENT);
  assert.match(app.sync.snapshot().contentStatus, /bài học có sẵn/);
  app.sync.stop();
});

test("guests and ordinary signed-in users cannot submit content mutations", async () => {
  const guest = harness(); await guest.start();
  assert.equal((await guest.sync.editContent({ entity: "words", action: "delete", key: "agenda" })).ok, false);
  const learner = harness({ user: userA }); await learner.start();
  await waitFor(() => !learner.sync.snapshot().editorStatus.includes("Đang"));
  assert.equal(learner.sync.snapshot().canEdit, false);
  assert.equal((await learner.sync.editContent({ entity: "words", action: "delete", key: "agenda" })).ok, false);
  assert.equal(learner.db.writes.length, 0);
  guest.sync.stop(); learner.sync.stop();
});

test("editor can create, update and delete words, reloading lessons without losing progress", async () => {
  const app = harness({ user: userA }); app.db.tables.content_editors.push({ user_id: userA.id });
  await app.start(); await waitFor(() => app.sync.snapshot().canEdit);
  app.sync.mark("agenda", true); await waitFor(() => !app.sync.snapshot().busy);
  const draft = { word: "collaborate", meaning: "hợp tác", example: "We collaborate.", ipa: "/kəˈlæbəreɪt/", group_id: "meetings-schedule", sort_order: 7 };
  assert.equal((await app.sync.editContent({ entity: "words", action: "create", draft })).ok, true);
  assert.ok(app.sync.snapshot().content.groups[0].w.some(word => word[0] === "collaborate" && word[3] === draft.ipa));
  const revision = app.sync.snapshot().contentRevision;
  assert.equal((await app.sync.editContent({ entity: "words", action: "update", key: "collaborate", draft: { ...draft, meaning: "cộng tác" } })).ok, true);
  assert.equal(app.sync.snapshot().contentRevision, revision + 1);
  assert.equal((await app.sync.editContent({ entity: "words", action: "delete", key: "collaborate" })).ok, true);
  assert.ok(!app.sync.snapshot().content.groups[0].w.some(word => word[0] === "collaborate"));
  assert.deepEqual(app.sync.snapshot().known, ["agenda"]);
  app.db.failWrites = true;
  assert.equal((await app.sync.editContent({ entity: "words", action: "create", draft })).ok, false);
  assert.ok(!app.sync.snapshot().catalog.words.some(word => word.word === "collaborate"));
  assert.equal(app.sync.snapshot().adminBusy, false);
  app.sync.stop();
});

test("delayed editor permission cannot grant edit access to another account", async () => {
  const app = harness({ user: userA });
  app.db.tables.content_editors = [{ user_id: userA.id }]; app.db.holdEditorOwner = userA.id;
  await app.start(); await waitFor(() => app.db.releaseEditor);
  app.change(userB); await waitFor(() => app.sync.snapshot().user?.id === userB.id && !app.sync.snapshot().editorStatus.includes("Đang"));
  app.db.releaseEditor(); await tick();
  assert.equal(app.sync.snapshot().canEdit, false);
  assert.equal((await app.sync.editContent({ entity: "words", action: "delete", key: "agenda" })).ok, false);
  app.sync.stop();
});

test("switching account during a content write does not retain editor state", async () => {
  const app = harness({ user: userA }); app.db.tables.content_editors = [{ user_id: userA.id }];
  await app.start(); await waitFor(() => app.sync.snapshot().canEdit);
  app.db.holdNext = true;
  const pending = app.sync.editContent({ entity: "words", action: "delete", key: "agenda" });
  await waitFor(() => app.db.release);
  app.change(userB); await waitFor(() => app.sync.snapshot().user?.id === userB.id);
  app.db.release();
  assert.equal((await pending).ok, false);
  assert.equal(app.sync.snapshot().canEdit, false);
  assert.equal(app.sync.snapshot().adminBusy, false);
  app.sync.stop();
});

test("progress and history synchronize across sessions using the same account", async () => {
  const first = harness({ user: userA });
  await first.start();
  first.sync.mark("agenda", true);
  first.sync.saveAttempt("remote-work", [1, 2, 1, 1]);
  await waitFor(() => first.db.tables.reading_attempts.length === 1 && !first.sync.snapshot().busy);
  const second = harness({ db: first.db, user: userA }); await second.start();
  assert.deepEqual(second.sync.snapshot().known, ["agenda"]);
  assert.equal(second.sync.snapshot().attempts.length, 1);
  assert.equal(first.db.writes.find(write => write.table === "reading_attempts").options.ignoreDuplicates, true);
  first.sync.stop(); second.sync.stop();
});

test("failed writes remain queued after reload and retry without duplicating attempts", async () => {
  const first = harness({ user: userA }); await first.start();
  first.db.failWrites = true;
  first.sync.mark("reschedule", true); first.sync.saveAttempt("remote-work", [1, 2, 1, 1]);
  await waitFor(() => first.sync.snapshot().status.includes("Chưa đồng bộ"));
  first.sync.stop();
  const next = harness({ db: first.db, user: userA, cache: first.cache }); await next.start();
  assert.deepEqual(next.sync.snapshot().known, ["reschedule"]);
  next.db.failWrites = false;
  await next.sync.refresh(); await next.sync.refresh();
  assert.equal(next.db.tables.vocabulary_progress.length, 1);
  assert.equal(next.db.tables.reading_attempts.length, 1);
  next.sync.stop();
});

test("a completed write cannot clear newer clicks made while the request was in flight", async () => {
  const app = harness({ user: userA }); await app.start();
  app.db.holdNext = true; app.sync.mark("agenda", false);
  await waitFor(() => app.db.release);
  app.sync.mark("agenda", true); app.db.release();
  await waitFor(() => !app.sync.snapshot().busy);
  assert.equal(app.db.tables.vocabulary_progress.find(row => row.word === "agenda").is_known, true);
  app.sync.stop();
});

test("switching accounts and signing out isolate queues, history and delayed responses", async () => {
  const app = harness({ user: userA }); await app.start();
  app.sync.mark("agenda", true); app.sync.saveAttempt("remote-work", [1, 2, 1, 1]);
  await waitFor(() => !app.sync.snapshot().busy);
  app.change(userB); await waitFor(() => app.sync.snapshot().user?.id === userB.id && !app.sync.snapshot().busy);
  assert.deepEqual(app.sync.snapshot().known, []); assert.equal(app.sync.snapshot().attempts.length, 0);
  app.db.holdNext = true; app.sync.mark("reschedule", true); await waitFor(() => app.db.release);
  app.change(userA); await waitFor(() => app.sync.snapshot().user?.id === userA.id && !app.sync.snapshot().busy);
  app.db.release(); await tick();
  assert.deepEqual(app.sync.snapshot().known, ["agenda"]); assert.equal(app.sync.snapshot().attempts.length, 1);
  await app.sync.signOut(); await tick();
  assert.equal(app.sync.snapshot().user, null); assert.deepEqual(app.sync.snapshot().known, []); assert.equal(app.sync.snapshot().attempts.length, 0);
  app.sync.stop();
});

test("magic links receive the supplied website root and stopping unsubscribes auth", async () => {
  const app = harness(); await app.start();
  await app.sync.signIn(" learner@example.com ", "https://example.com/");
  assert.deepEqual(app.otp, { email: "learner@example.com", options: { emailRedirectTo: "https://example.com/" } });
  assert.match(app.sync.snapshot().authMessage, /Đã gửi/);
  const before = app.changes.length; app.sync.stop(); app.change(userA); await tick();
  assert.equal(app.unsubscribed, true); assert.equal(app.changes.length, before);
});

test("password login calls Supabase Auth without redirects, never grants admin by email alone", async () => {
  const app = harness(); await app.start();
  assert.equal((await app.sync.signInWithPassword(" a@example.com ", "test-password")).ok, true);
  assert.deepEqual(app.authCalls[0], ["password", { email: "a@example.com", password: "test-password" }]);
  assert.equal(app.sync.snapshot().user.id, userA.id);
  await waitFor(() => !app.sync.snapshot().busy);
  assert.equal(app.sync.snapshot().canEdit, false);
  assert.ok(!JSON.stringify(app.changes).includes("test-password"));
  assert.ok(!JSON.stringify([...app.cache.values()]).includes("test-password"));
  app.sync.stop();
});

test("wrong password and unconfirmed email do not create a session or expose Auth errors", async () => {
  for (const error of [{ code: "invalid_credentials", message: "private-password" }, { code: "email_not_confirmed" }]) {
    const app = harness({ loginError: error }); await app.start();
    assert.equal((await app.sync.signInWithPassword("a@example.com", "private-password")).ok, false);
    assert.equal(app.sync.snapshot().user, null);
    assert.equal(app.sync.snapshot().canEdit, false);
    assert.ok(!JSON.stringify(app.changes).includes("private-password"));
    app.sync.stop();
  }
});

test("email code requires valid token and verifies through Supabase before starting a session", async () => {
  const app = harness(); await app.start();
  await app.sync.signIn("a@example.com");
  assert.deepEqual(app.otp, { email: "a@example.com", options: {} });
  assert.equal((await app.sync.verifyEmailCode("a@example.com", "bad")).ok, false);
  assert.equal(app.authCalls.length, 0);
  assert.equal((await app.sync.verifyEmailCode(" a@example.com ", " 123456 ")).ok, true);
  assert.deepEqual(app.authCalls[0], ["verify", { email: "a@example.com", token: "123456", type: "email" }]);
  assert.equal(app.sync.snapshot().user.id, userA.id);
  assert.ok(!JSON.stringify(app.changes).includes("123456"));
  app.sync.stop();
});

test("only a signed-in user can set a password, with validation and no password caching", async () => {
  const guest = harness(); await guest.start();
  assert.equal((await guest.sync.setPassword("new-private-password")).ok, false);
  assert.equal(guest.authCalls.length, 0);
  const app = harness({ user: userA }); await app.start();
  assert.equal((await app.sync.setPassword("short")).ok, false);
  assert.equal(app.authCalls.length, 0);
  assert.equal((await app.sync.setPassword("new-private-password")).ok, true);
  assert.deepEqual(app.authCalls[0], ["update", { password: "new-private-password" }]);
  assert.ok(!JSON.stringify(app.changes).includes("new-private-password"));
  const rejected = harness({ user: userA, updateError: { code: "weak_password", message: "private-password" } }); await rejected.start();
  assert.equal((await rejected.sync.setPassword("private-password")).ok, false);
  assert.ok(!rejected.sync.snapshot().authMessage.includes("private-password"));
  guest.sync.stop(); app.sync.stop(); rejected.sync.stop();
});

test("import result counts survive sync's content reload", async () => {
  const app = harness({ user: userA, adminWrite: async () => ({ ok: true, imported: 2, skipped: 3 }) });
  app.db.tables.content_editors.push({ user_id: userA.id });
  await app.start(); await waitFor(() => app.sync.snapshot().canEdit);
  const result = await app.sync.editContent({ entity: "words", action: "import" });
  assert.equal(result.imported, 2);
  assert.equal(result.skipped, 3);
  assert.equal(result.warning, "");
  app.sync.stop();
});

test("invalid quiz answers and privileged keys cannot be submitted", async () => {
  const app = harness({ project: { url: config.url, publishableKey: "sb_secret_do_not_ship_this" } }); await app.start();
  assert.equal(app.sync.snapshot().connected, false);
  assert.equal(app.sync.saveAttempt("remote-work", [1]), false);
  assert.equal(app.sync.saveAttempt("deleted-reading", [1]), false);
  assert.equal(app.sync.snapshot().attempts.length, 0);
  app.sync.stop();
});

test("local cache keys remain compatible with the HTML version", async () => {
  const cache = new Map([["english-study:" + config.url + ":user-a", JSON.stringify({ words: { agenda: { is_known: true } }, pendingWords: { agenda: { is_known: true, updated_at: new Date().toISOString() } }, attempts: [], pendingAttempts: [] })]]);
  const app = harness({ user: userA, cache }); await app.start();
  assert.deepEqual(app.sync.snapshot().known, ["agenda"]);
  assert.equal(app.db.tables.vocabulary_progress[0].word, "agenda");
  app.sync.stop();
});
