import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyCard, State } from "ts-fsrs";
import { intervalLabel, normalizeSrsRecords, previewSrs, restoreSrsCard, reviewSrsCard, selectSrsQueue, serializeSrsCard, SRS_RATINGS } from "../src/lib/study/srs.js";
import { createStudySync } from "../src/lib/study/study-sync.js";
import { STUDY_CONTENT } from "../src/data/study-content.js";
import { authBackend } from "./helpers/auth-backend.js";

const at = "2026-10-07T03:00:00.000Z";
const config = { url: "https://srs-test.supabase.co", publishableKey: "sb_publishable_srs_test_key_long" };
const userA = { id: "learner-a" }, userB = { id: "learner-b" };
const record = (word, rating = 3, time = at, previous = null) => ({ word, rating, reviewed_at: time, previous_card: previous, card: reviewSrsCard(previous, rating, time) });
const tick = () => new Promise(resolve => setImmediate(resolve));
async function waitFor(predicate) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(); }
  assert.fail("SRS sync timed out");
}

function harness({ user = null, cache = new Map(), remote = new Map(), failReads = false, failWrites = false } = {}) {
  let listener, clock = at;
  const tables = authBackend().tables;
  const app = { failReads, failWrites, holdOwner: null, holdReadOwner: null, release: null, releaseRead: null, writes: [], remote, cache, tables };
  const api = {
    auth: {
      onAuthStateChange(callback) { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
      async getSession() { return { data: { session: user ? { user } : null } }; }
    },
    data: {
      async getCatalog() { return { groups: tables.vocabulary_groups, words: tables.vocabulary_words, readings: tables.reading_passages, questions: tables.reading_questions }; },
      async loadProgress() { return { words: [], attempts: [] }; },
      async saveWords() {}, async saveAttempts() {},
      async loadSrs(owner) {
        if (app.failReads) throw new Error("Missing migration or offline");
        if (app.holdReadOwner === owner) { app.holdReadOwner = null; await new Promise(resolve => { app.releaseRead = resolve; }); }
        return structuredClone(remote.get(owner) || []);
      },
      async saveSrs(owner, rows) {
        if (owner === app.holdOwner) { app.holdOwner = null; await new Promise(resolve => { app.release = resolve; }); }
        if (app.failWrites) throw new Error("Offline");
        app.writes.push({ owner, rows: structuredClone(rows) });
        const saved = new Map((remote.get(owner) || []).map(row => [row.word, row]));
        for (const row of rows) if (!saved.has(row.word) || saved.get(row.word).reviewed_at < row.reviewed_at) saved.set(row.word, structuredClone(row));
        remote.set(owner, [...saved.values()]);
      }
    }
  };
  const sync = createStudySync({ config, initialContent: STUDY_CONTENT, createClient: () => api,
    storage: { getItem: key => cache.get(key) || null, setItem: (key, value) => cache.set(key, value) },
    schedule: fn => fn(), onChange() {}, now: () => clock, adminRequest: async () => ({ ok: true, canEdit: false }) });
  return Object.assign(app, { sync, setTime(value) { clock = value; },
    change(next) { listener("SIGNED_IN", next ? { user: next } : null); },
    async start() { await sync.start(); await waitFor(() => !sync.snapshot().srsLoading && !sync.snapshot().busy); },
    stored(owner = user?.id || "guest") { return JSON.parse(cache.get("english-study:" + config.url + ":" + owner)); }
  });
}

test("FSRS previews match deterministic reviews for all four Vietnamese ratings", () => {
  assert.deepEqual(SRS_RATINGS.map(item => item.label), ["Quên", "Khó", "Nhớ", "Dễ"]);
  const outcomes = previewSrs(null, Date.parse(at));
  for (const outcome of outcomes) {
    const card = reviewSrsCard(null, outcome.rating, at);
    assert.equal(card.due, outcome.due); assert.equal(card.reps, 1); assert.equal(card.last_review, at);
    assert.ok(Date.parse(card.due) > Date.parse(at));
    assert.deepEqual(serializeSrsCard(restoreSrsCard(card)), card);
  }
  assert.equal(intervalLabel(outcomes[0].due, Date.parse(at)), "1 phút");
  assert.equal(intervalLabel(outcomes[2].due, Date.parse(at)), "10 phút");
  assert.equal(reviewSrsCard(null, 4, at).state, State.Review);
});

test("reviews graduate learning and forgotten reviews enter relearning without resetting history", () => {
  let card = reviewSrsCard(null, 3, at);
  card = reviewSrsCard(card, 3, card.due);
  assert.equal(card.state, State.Review); assert.equal(card.reps, 2);
  const next = reviewSrsCard(card, 1, card.due);
  assert.equal(next.state, State.Relearning); assert.equal(next.lapses, 1); assert.equal(next.reps, 3);
  assert.equal(intervalLabel(next.due, Date.parse(next.last_review)), "10 phút");
});

test("card validation rejects bad dates, counters, manual ratings and impossible chronology", () => {
  const good = record("agenda").card;
  for (const patch of [{ due: "bad" }, { reps: -1 }, { difficulty: 11 }, { stability: Infinity }, { state: 4 }, { lapses: 99 }, { learning_steps: 0.5 }, { last_review: null }, { due: "2001-01-01T00:00:00.000Z" }]) {
    assert.throws(() => restoreSrsCard({ ...good, ...patch }));
  }
  for (const rating of [0, 5, "3", NaN]) assert.throws(() => reviewSrsCard(null, rating, at));
  assert.throws(() => reviewSrsCard(good, 3, "2026-10-06T03:00:00.000Z"));
  assert.throws(() => reviewSrsCard(null, 3, "2026-10-07"));
  assert.deepEqual(previewSrs(good, Date.parse(at) - 1), []);
  assert.deepEqual(restoreSrsCard(null, new Date(at)), createEmptyCard(new Date(at)));
});

test("due cards are sorted ahead of new words, with group filters and exact due boundaries", () => {
  const a = record("agenda", 1), b = record("reschedule", 3);
  const records = normalizeSrsRecords([a, b]);
  const before = selectSrsQueue(STUDY_CONTENT, records, Date.parse(a.card.due) - 1);
  assert.equal(before.length, 40); assert.ok(before.every(item => item.isNew));
  const after = selectSrsQueue(STUDY_CONTENT, records, Date.parse(b.card.due));
  assert.equal(after[0].word[0], "agenda"); assert.equal(after[1].word[0], "reschedule");
  assert.equal(selectSrsQueue(STUDY_CONTENT, records, Date.parse(b.card.due), "meetings-schedule").length, 7);
  assert.equal(selectSrsQueue(STUDY_CONTENT, records, Date.parse(at), "missing").length, 0);
});

test("corrupt cached cards do not break lessons, including prototype-named vocabulary", () => {
  const records = normalizeSrsRecords([null, { word: "bad", rating: 3, reviewed_at: at, card: {} }, { ...record("bad-date"), reviewed_at: "yesterday" }, { ...record("bad-previous"), previous_card: {} }, { ...record("missing-card"), card: null }, record("constructor"), record("__proto__"), record("agenda")]);
  assert.equal(Object.keys(records).length, 3); assert.ok(Object.hasOwn(records, "__proto__"));
  const content = { groups: [{ id: "test", n: "Test", w: [["constructor"], ["__proto__"], ["toString"]] }] };
  assert.deepEqual(selectSrsQueue(content, records, Date.parse(at)).map(item => item.word[0]), ["toString"]);
});

test("guest SRS survives reload and does not change the old known flag", async () => {
  const app = harness(); await app.start();
  app.sync.mark("agenda", true);
  assert.equal(app.sync.reviewWord("agenda", 1), true);
  assert.equal(app.sync.reviewWord("agenda", 3), false);
  assert.equal(app.sync.reviewWord("unknown", 3), false);
  const next = harness({ cache: app.cache }); await next.start();
  assert.deepEqual(next.sync.snapshot().known, ["agenda"]);
  assert.equal(next.sync.snapshot().srs.agenda.card.reps, 1); assert.equal(app.writes.length, 0);
  next.setTime(next.sync.snapshot().srs.agenda.card.due);
  assert.equal(next.sync.reviewWord("agenda", 3), true); assert.equal(next.sync.snapshot().srs.agenda.card.reps, 2);
  app.sync.stop(); next.sync.stop();
});

test("guest and each signed-in account have separate schedules without automatic guest merging", async () => {
  const app = harness(); await app.start(); app.sync.reviewWord("agenda", 3);
  app.change(userA); await waitFor(() => !app.sync.snapshot().srsLoading);
  assert.deepEqual(app.sync.snapshot().srs, {});
  app.sync.reviewWord("reschedule", 4); await waitFor(() => !app.sync.snapshot().srsSaving);
  assert.equal(app.remote.get(userA.id).length, 1);
  app.change(userB); await waitFor(() => !app.sync.snapshot().srsLoading);
  assert.deepEqual(app.sync.snapshot().srs, {});
  app.change(null); assert.ok(app.sync.snapshot().srs.agenda); assert.equal(app.sync.snapshot().srs.reschedule, undefined);
  app.sync.stop();
});

test("offline reviews survive account reload and retry; newer remote schedules win", async () => {
  const first = harness({ user: userA, failWrites: true }); await first.start();
  first.sync.reviewWord("agenda", 1); await waitFor(() => !first.sync.snapshot().srsSaving);
  first.setTime(first.sync.snapshot().srs.agenda.card.due);
  first.sync.reviewWord("agenda", 3); await waitFor(() => !first.sync.snapshot().srsSaving);
  assert.equal(first.stored().pendingSrs.agenda.card.reps, 2);
  first.sync.stop();
  const next = harness({ user: userA, cache: first.cache }); await next.start(); await waitFor(() => !next.sync.snapshot().srsSaving);
  assert.equal(next.remote.get(userA.id)[0].card.reps, 2); assert.deepEqual(next.stored().pendingSrs, {});
  const remoteRow = record("agenda", 4, "2026-10-08T03:00:00.000Z");
  next.remote.set(userA.id, [remoteRow]); await next.sync.refreshSrs();
  assert.deepEqual(next.sync.snapshot().srs.agenda.card, remoteRow.card); next.sync.stop();
});

test("a newer remote review clears an older offline pending row without uploading it", async () => {
  const first = harness({ user: userA, failWrites: true }); await first.start();
  first.sync.reviewWord("agenda", 3); await waitFor(() => !first.sync.snapshot().srsSaving); first.sync.stop();
  const row = record("agenda", 4, "2026-10-08T03:00:00.000Z");
  const next = harness({ user: userA, cache: first.cache, remote: new Map([[userA.id, [row]]]) }); await next.start();
  assert.deepEqual(next.sync.snapshot().srs.agenda.card, row.card); assert.equal(next.writes.length, 0);
  assert.deepEqual(next.stored().pendingSrs, {}); next.sync.stop();
});

test("an in-flight write cannot erase a newer review or leak its response into a different account", async () => {
  const app = harness({ user: userA }); await app.start(); app.holdOwner = userA.id;
  app.sync.reviewWord("agenda", 1); await waitFor(() => app.release);
  app.setTime(app.sync.snapshot().srs.agenda.card.due); app.sync.reviewWord("agenda", 3);
  app.release(); await waitFor(() => !app.sync.snapshot().srsSaving);
  assert.equal(app.writes.length, 2); assert.equal(app.remote.get(userA.id)[0].card.reps, 2);
  app.holdOwner = userA.id; app.sync.reviewWord("reschedule", 1); await waitFor(() => app.release);
  app.change(userB); await waitFor(() => !app.sync.snapshot().srsLoading); app.release(); await tick();
  assert.deepEqual(app.sync.snapshot().srs, {}); app.sync.stop();
});

test("missing SRS migration leaves local review and old progress working independently", async () => {
  const app = harness({ user: userA, failReads: true, failWrites: true }); await app.start();
  assert.match(app.sync.snapshot().srsStatus, /giữ trên thiết bị/);
  assert.equal(app.sync.reviewWord("agenda", 3), true); app.sync.mark("agenda", true);
  await waitFor(() => !app.sync.snapshot().srsSaving && !app.sync.snapshot().busy);
  assert.ok(app.stored().pendingSrs.agenda); assert.deepEqual(app.sync.snapshot().known, ["agenda"]); app.sync.stop();
});

test("a late read cannot populate another account after a session change", async () => {
  const app = harness({ remote: new Map([[userA.id, [record("agenda")]]]) }); await app.start();
  app.holdReadOwner = userA.id; app.change(userA); await waitFor(() => app.releaseRead);
  app.change(userB); await waitFor(() => !app.sync.snapshot().srsLoading); app.releaseRead(); await tick();
  assert.equal(app.sync.snapshot().user.id, userB.id); assert.deepEqual(app.sync.snapshot().srs, {}); app.sync.stop();
});

test("removing vocabulary clears both its local schedule and unsent pending review", async () => {
  const app = harness({ user: userA, failWrites: true }); await app.start();
  app.sync.reviewWord("agenda", 3); await waitFor(() => !app.sync.snapshot().srsSaving);
  app.tables.vocabulary_words = app.tables.vocabulary_words.filter(word => word.word !== "agenda");
  await app.sync.reloadContent(); assert.equal(app.sync.snapshot().srs.agenda, undefined);
  assert.deepEqual(app.stored().pendingSrs, {}); assert.equal(app.sync.reviewWord("agenda", 3), false); app.sync.stop();
});
