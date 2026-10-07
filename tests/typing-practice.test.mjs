import assert from "node:assert/strict";
import test from "node:test";
import { gradePracticeAnswer, makePracticeQuestion, normalizeEnglishAnswer, normalizePracticeRecords, selectPracticeQueue } from "../src/lib/study/typing-practice.js";
import { createStudySync } from "../src/lib/study/study-sync.js";
import { STUDY_CONTENT } from "../src/data/study-content.js";
import { authBackend } from "./helpers/auth-backend.js";

const time = "2026-10-07T10:00:00.000Z", userA = { id: "learner-a" }, userB = { id: "learner-b" };
const config = { url: "https://practice-test.supabase.co", publishableKey: "sb_publishable_practice_test_long_key" };
const record = (word, needs_retry = true, answered_at = time) => ({ word, needs_retry, answered_at, mode: "meaning", last_answer: needs_retry ? "mistake" : word });
const tick = () => new Promise(resolve => setImmediate(resolve));
async function waitFor(predicate) { for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(); } assert.fail("Practice sync timed out"); }

function harness({ user = null, cache = new Map(), remote = new Map() } = {}) {
  let listener, clock = time;
  const tables = authBackend().tables;
  const app = { cache, remote, tables, writes: [], failRead: false, failWrite: false, holdWrite: false, releaseWrite: null, holdReadOwner: null, releaseRead: null };
  const api = {
    auth: {
      onAuthStateChange(fn) { listener = fn; return { data: { subscription: { unsubscribe() {} } } }; },
      async getSession() { return { data: { session: user ? { user } : null } }; }
    },
    data: {
      async getCatalog() { return { groups: tables.vocabulary_groups, words: tables.vocabulary_words, readings: tables.reading_passages, questions: tables.reading_questions }; },
      async loadProgress() { return { words: [], attempts: [] }; }, async saveWords() {}, async saveAttempts() {},
      async loadSrs() { return []; }, async saveSrs() {},
      async loadPractice(owner) {
        if (app.failRead) throw new Error("Offline");
        if (app.holdReadOwner === owner) { app.holdReadOwner = null; await new Promise(resolve => { app.releaseRead = resolve; }); }
        return structuredClone(remote.get(owner) || []);
      },
      async savePractice(owner, rows) {
        if (app.holdWrite) { app.holdWrite = false; await new Promise(resolve => { app.releaseWrite = resolve; }); }
        if (app.failWrite) throw new Error("Offline");
        app.writes.push({ owner, rows: structuredClone(rows) });
        const saved = new Map((remote.get(owner) || []).map(row => [row.word, row]));
        for (const row of rows) if (!saved.has(row.word) || saved.get(row.word).answered_at < row.answered_at) saved.set(row.word, structuredClone(row));
        remote.set(owner, [...saved.values()]);
      }
    }
  };
  app.sync = createStudySync({ config, initialContent: STUDY_CONTENT, createClient: () => api,
    storage: { getItem: key => cache.get(key) || null, setItem: (key, value) => cache.set(key, value) },
    schedule: fn => fn(), onChange() {}, now: () => clock, adminRequest: async () => ({ ok: true, canEdit: false }) });
  return Object.assign(app, { setTime(value) { clock = value; }, change(next) { listener("SIGNED_IN", next ? { user: next } : null); },
    async start() { await app.sync.start(); await waitFor(() => !app.sync.snapshot().practiceLoading && !app.sync.snapshot().busy); },
    stored(owner = user?.id || "guest") { return JSON.parse(cache.get("english-study:" + config.url + ":" + owner)); }
  });
}

test("typing grading accepts case/spacing/typographic equivalents but not misspellings, missing words or extra punctuation", () => {
  assert.equal(normalizeEnglishAnswer("  FOLLOW\t UP "), "follow up");
  const phrase = ["follow up", "theo dõi", "We follow up with clients."];
  assert.equal(gradePracticeAnswer(phrase, "meaning", "  FOLLOW   UP ").correct, true);
  for (const answer of ["", "follow", "followup", "follow-up", "follow up.", "folow up"]) assert.equal(gradePracticeAnswer(phrase, "meaning", answer).correct, false);
  assert.equal(gradePracticeAnswer(["don't", "", "Don't panic."], "listening", "DON’T").correct, true);
  assert.equal(gradePracticeAnswer(["roll-back", "", ""], "meaning", "roll‑back").correct, true);
  assert.equal(gradePracticeAnswer(phrase, "meaning", "x".repeat(201)), null);
  assert.equal(gradePracticeAnswer(phrase, "bad", "follow up"), null);
  assert.equal(gradePracticeAnswer(null, "meaning", "answer"), null);
});

test("cloze masks every whole-word match, preserving sentence text without leaking the answer", () => {
  const question = makePracticeQuestion(["invoice", "hóa đơn", "Invoice: send the invoice, not invoices."], "cloze");
  assert.equal(question.prompt, "_____: send the _____, not invoices."); assert.equal(question.expected, "Invoice");
  assert.equal(gradePracticeAnswer(["invoice", "", "Invoice."], "cloze", "invoice").correct, true);
  assert.equal(makePracticeQuestion(["follow up", "", "We'll FOLLOW   UP soon."], "cloze").prompt, "We'll _____ soon.");
  assert.equal(makePracticeQuestion(["don't", "", "Don’t forget."], "cloze").prompt, "_____ forget.");
});

test("cloze never guesses inflections, partial words, regex syntax, or missing examples", () => {
  for (const word of [["resign", "", "He resigned."], ["cat", "", "A category."], ["cat", "", "A cat2 or cat_name."], ["invoice", "", ""], ["invoice", "", null]]) assert.equal(makePracticeQuestion(word, "cloze"), null);
  assert.equal(makePracticeQuestion(["c++", "", "Use c++ for this module."], "cloze").prompt, "Use _____ for this module.");
  assert.equal(makePracticeQuestion(["a.b", "", "axb"], "cloze"), null);
});

test("all three practice queues filter by group and mistakes, with safe prototype-named words", () => {
  const records = normalizePracticeRecords([record("reschedule"), record("agenda", false)]);
  assert.equal(selectPracticeQueue(STUDY_CONTENT, records, "meaning").length, 42);
  assert.equal(selectPracticeQueue(STUDY_CONTENT, records, "listening").length, 42);
  assert.equal(selectPracticeQueue(STUDY_CONTENT, records, "cloze").length, 37);
  assert.equal(selectPracticeQueue(STUDY_CONTENT, records, "meaning", "meetings-schedule").length, 7);
  assert.deepEqual(selectPracticeQueue(STUDY_CONTENT, records, "cloze", "meetings-schedule", true).map(item => item.word[0]), ["reschedule"]);
  assert.equal(selectPracticeQueue(STUDY_CONTENT, records, "bad").length, 0);
  const prototype = normalizePracticeRecords([record("__proto__"), record("constructor")]);
  assert.equal(Object.getPrototypeOf(prototype), Object.prototype);
  const content = { groups: [{ id: "g", n: "G", w: [["__proto__", "", ""], ["constructor", "", ""], ["toString", "", ""]] }] };
  assert.equal(selectPracticeQueue(content, prototype, "meaning", "", true).length, 2);
});

test("corrupt cached practice entries are ignored without resetting valid words", () => {
  const rows = [null, record("agenda"), { ...record("bad"), needs_retry: "true" }, { ...record("bad2"), last_answer: {} }, { ...record("bad3"), answered_at: "yesterday" }, { ...record("bad4"), mode: "invalid" }];
  assert.deepEqual(Object.keys(normalizePracticeRecords(rows)), ["agenda"]);
});

test("guest mistakes survive reload and correct retries clear them without changing SRS or known progress", async () => {
  const app = harness(); await app.start(); app.sync.mark("agenda", true); app.sync.reviewWord("agenda", 3);
  const srs = structuredClone(app.sync.snapshot().srs);
  assert.equal(app.sync.submitPracticeAnswer("agenda", "meaning", "wrong").correct, false);
  assert.equal(app.sync.submitPracticeAnswer("missing", "meaning", "wrong"), null);
  const next = harness({ cache: app.cache }); await next.start(); assert.equal(next.sync.snapshot().practice.agenda.needs_retry, true);
  assert.equal(next.sync.submitPracticeAnswer("agenda", "listening", " AGENDA ").correct, true);
  assert.equal(next.sync.snapshot().practice.agenda.needs_retry, false); assert.equal(next.writes.length, 0);
  assert.deepEqual(next.sync.snapshot().srs, srs); assert.deepEqual(next.sync.snapshot().known, ["agenda"]);
  app.sync.stop(); next.sync.stop();
});

test("revealing an answer keeps the word for retry and invalid cloze data is not saved", async () => {
  const app = harness(); await app.start();
  assert.equal(app.sync.submitPracticeAnswer("agenda", "meaning", "").correct, false); assert.equal(app.sync.snapshot().practice.agenda.needs_retry, true);
  assert.equal(app.sync.submitPracticeAnswer("resign", "cloze", "resigned"), null); assert.equal(app.sync.snapshot().practice.resign, undefined); app.sync.stop();
});

test("guest and different accounts never share mistake lists", async () => {
  const app = harness(); await app.start(); app.sync.submitPracticeAnswer("agenda", "meaning", "wrong");
  app.change(userA); await waitFor(() => !app.sync.snapshot().practiceLoading); assert.deepEqual(app.sync.snapshot().practice, {});
  app.sync.submitPracticeAnswer("reschedule", "meaning", "wrong"); await waitFor(() => !app.sync.snapshot().practiceSaving);
  app.change(userB); await waitFor(() => !app.sync.snapshot().practiceLoading); assert.deepEqual(app.sync.snapshot().practice, {});
  app.change(null); assert.ok(app.sync.snapshot().practice.agenda); assert.equal(app.sync.snapshot().practice.reschedule, undefined); app.sync.stop();
});

test("offline correct-answer tombstones survive reload and clear older remote mistakes", async () => {
  const app = harness({ user: userA }); await app.start(); app.failWrite = true;
  app.sync.submitPracticeAnswer("agenda", "meaning", "wrong"); await waitFor(() => !app.sync.snapshot().practiceSaving);
  app.sync.submitPracticeAnswer("agenda", "meaning", "agenda"); await waitFor(() => !app.sync.snapshot().practiceSaving);
  assert.equal(app.stored().pendingPractice.agenda.needs_retry, false); app.sync.stop();
  const next = harness({ user: userA, cache: app.cache, remote: new Map([[userA.id, [record("agenda")]]]) }); await next.start(); await waitFor(() => !next.sync.snapshot().practiceSaving);
  assert.equal(next.remote.get(userA.id)[0].needs_retry, false); assert.deepEqual(next.stored().pendingPractice, {}); next.sync.stop();
});

test("newer remote correct answers discard older unsent mistakes without reuploading them", async () => {
  const app = harness({ user: userA }); await app.start(); app.failWrite = true; app.sync.submitPracticeAnswer("agenda", "meaning", "wrong");
  await waitFor(() => !app.sync.snapshot().practiceSaving); app.sync.stop();
  const next = harness({ user: userA, cache: app.cache, remote: new Map([[userA.id, [record("agenda", false, "2026-10-08T10:00:00.000Z")]]]) }); await next.start();
  assert.equal(next.sync.snapshot().practice.agenda.needs_retry, false); assert.equal(next.writes.length, 0); assert.deepEqual(next.stored().pendingPractice, {}); next.sync.stop();
});

test("an in-flight wrong-answer write cannot erase a newer correct retry", async () => {
  const app = harness({ user: userA }); await app.start(); app.holdWrite = true;
  app.sync.submitPracticeAnswer("agenda", "meaning", "wrong"); await waitFor(() => app.releaseWrite);
  app.sync.submitPracticeAnswer("agenda", "meaning", "agenda"); app.releaseWrite(); await waitFor(() => !app.sync.snapshot().practiceSaving);
  assert.equal(app.writes.length, 2); assert.equal(app.remote.get(userA.id)[0].needs_retry, false); assert.deepEqual(app.stored().pendingPractice, {}); app.sync.stop();
});

test("late practice reads/writes cannot populate another account", async () => {
  const app = harness(); await app.start(); app.holdReadOwner = userA.id; app.change(userA); await waitFor(() => app.releaseRead);
  app.change(userB); await waitFor(() => !app.sync.snapshot().practiceLoading); app.releaseRead(); await tick();
  assert.deepEqual(app.sync.snapshot().practice, {});
  app.holdWrite = true; app.sync.submitPracticeAnswer("agenda", "meaning", "wrong"); await waitFor(() => app.releaseWrite);
  app.change(userA); await waitFor(() => !app.sync.snapshot().practiceLoading); app.releaseWrite(); await tick();
  assert.deepEqual(app.sync.snapshot().practice, {}); app.sync.stop();
});

test("missing migration still permits local practice; deleting vocabulary prunes its pending mistake", async () => {
  const app = harness({ user: userA }); app.failRead = true; app.failWrite = true; await app.start();
  app.sync.submitPracticeAnswer("agenda", "meaning", "wrong"); await waitFor(() => !app.sync.snapshot().practiceSaving);
  assert.match(app.sync.snapshot().practiceStatus, /giữ trên thiết bị/); assert.ok(app.stored().pendingPractice.agenda);
  app.tables.vocabulary_words = app.tables.vocabulary_words.filter(word => word.word !== "agenda"); await app.sync.reloadContent();
  assert.equal(app.sync.snapshot().practice.agenda, undefined); assert.deepEqual(app.stored().pendingPractice, {}); app.sync.stop();
});
