import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createStudySync } from "../lib/study-sync.js";
import { STUDY_CONTENT } from "../study-content.js";

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
    failWrites: false, holdNext: false, release: null, writes: [],
    tables: {
      vocabulary_groups: STUDY_CONTENT.groups.map((group, sort_order) => ({ id: group.id, title: group.n, sort_order })),
      vocabulary_words: STUDY_CONTENT.groups.flatMap(group => group.w.map((word, sort_order) => ({ word: word[0], group_id: group.id, meaning: word[1], example: word[2], sort_order }))),
      reading_passages: STUDY_CONTENT.readings.map((reading, sort_order) => ({ id: reading.id, title: reading.t, time_label: reading.time, passage: reading.p, sort_order })),
      reading_questions: STUDY_CONTENT.readings.flatMap(reading => reading.q.map((question, sort_order) => ({ reading_id: reading.id, sort_order, prompt: question.q, options: question.o, answer_index: question.a, explanation: question.e }))),
      vocabulary_progress: [], reading_attempts: []
    }
  };
}

function harness({ db = backend(), user = null, project = config, cache = new Map() } = {}) {
  let currentUser = user, authChange, otp, unsubscribed = false;
  const changes = [];
  const api = {
    auth: {
      onAuthStateChange(callback) { authChange = callback; return { data: { subscription: { unsubscribe() { unsubscribed = true; } } } }; },
      async getSession() { return { data: { session: currentUser ? { user: currentUser } : null }, error: null }; },
      async signOut() { currentUser = null; authChange("SIGNED_OUT", null); return { error: null }; },
      async signInWithOtp(request) { otp = request; return { error: null }; }
    },
    from(table) {
      let owner, rows, options, sortBy, ascending = true, limit = Infinity;
      async function execute() {
        if (rows) {
          if (db.holdNext) { db.holdNext = false; await new Promise(resolve => { db.release = resolve; }); }
          if (db.failWrites) return { error: { message: "Network failure" } };
          db.writes.push({ table, rows, options });
          for (const row of rows) {
            const index = db.tables[table].findIndex(existing => table === "vocabulary_progress" ? existing.user_id === row.user_id && existing.word === row.word : existing.id === row.id);
            if (index < 0) db.tables[table].push(row);
            else if (!options.ignoreDuplicates) db.tables[table][index] = row;
          }
          return { error: null };
        }
        let data = db.tables[table].filter(row => !owner || row.user_id === owner);
        if (sortBy) data.sort((a, b) => a[sortBy] < b[sortBy] ? (ascending ? -1 : 1) : a[sortBy] > b[sortBy] ? (ascending ? 1 : -1) : 0);
        return { data: data.slice(0, limit), error: null };
      }
      return {
        select() { return this; }, eq(_, value) { owner = value; return this; },
        order(column, opts) { sortBy = column; ascending = opts?.ascending !== false; return this; },
        limit(value) { limit = value; return this; }, abortSignal() { return this; },
        upsert(values, opts) { rows = values; options = opts; return this; },
        then(resolve, reject) { return execute().then(resolve, reject); }
      };
    }
  };
  const sync = createStudySync({ config: project, initialContent: STUDY_CONTENT, createClient: () => api,
    storage: { getItem: key => cache.get(key) || null, setItem: (key, value) => cache.set(key, value) },
    onChange: value => changes.push(value), schedule: callback => setImmediate(callback), makeId: randomUUID
  });
  return { db, sync, cache, changes, get otp() { return otp; }, get unsubscribed() { return unsubscribed; },
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
  assert.equal(app.sync.snapshot().contentStatus, "");
  app.sync.stop();
});

test("an empty database retains the built-in lessons", async () => {
  const app = harness(); app.db.tables.vocabulary_groups = [];
  await app.start();
  assert.equal(app.sync.snapshot().content, STUDY_CONTENT);
  assert.match(app.sync.snapshot().contentStatus, /bài học có sẵn/);
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
