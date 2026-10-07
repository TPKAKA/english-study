import assert from "node:assert/strict";
import test from "node:test";
import { contentError, fetchCatalog, mutateContent, toStudyContent, validateContent } from "../src/lib/content/content-admin.js";
import { STUDY_CONTENT } from "../src/data/study-content.js";

const catalog = { groups: [{ id: "group", title: "Group", sort_order: 0 }], words: [], readings: [], questions: [] };
const word = { word: "new word", group_id: "group", meaning: "nghĩa", ipa: "/njuː wɜːd/", example: "An example.", sort_order: 0 };
const reading = { title: "Reading", time_label: "5 phút", passage: "A passage.", sort_order: 0,
  questions: [{ prompt: "Question?", options: ["One", "Two"], answer_index: 1, explanation: "Two." }] };

function clientMock(error = null) {
  const calls = [];
  const query = {
    insert(row) { calls.push(["insert", row]); return this; },
    update(row) { calls.push(["update", row]); return this; },
    delete() { calls.push(["delete"]); return this; },
    eq(key, value) { calls.push(["eq", key, value]); return this; },
    select(value) { calls.push(["select", value]); return this; }, single() { calls.push(["single"]); return this; },
    abortSignal() { return Promise.resolve({ error }); }
  };
  return { calls, from(table) { calls.push(["from", table]); return query; }, rpc(name, args) { calls.push(["rpc", name, args]); return query; } };
}

test("all 42 starter words have British IPA, with the meeting-record sense of minutes", () => {
  const words = STUDY_CONTENT.groups.flatMap(group => group.w);
  assert.equal(words.length, 42);
  assert.ok(words.every(word => /^\/.+\/$/u.test(word[3])));
  assert.equal(words.find(word => word[0] === "minutes")[3], "/ˈmɪnɪts/");
});

test("catalog preserves empty groups and uses starter IPA when a database value is blank or missing", () => {
  const data = { ...catalog, groups: [...catalog.groups, { id: "empty", title: "Empty" }],
    words: [{ ...word, word: "agenda" }, { ...word, word: "reschedule", ipa: "" }] };
  delete data.words[0].ipa;
  const content = toStudyContent(data);
  assert.equal(content.groups[0].w[0][3], "/əˈdʒendə/");
  assert.equal(content.groups[0].w[1][3], "/ˌriːˈʃedjuːl/");
  assert.equal(content.groups[1].w.length, 0);
});

test("all starter pronunciations survive missing, null, empty and whitespace-only database IPA", () => {
  const starterWords = STUDY_CONTENT.groups.flatMap(group => group.w);
  for (const ipa of [undefined, null, "", " \t\n "]) {
    const data = { ...catalog, words: starterWords.map(([value, meaning, example]) => ({
      word: value, meaning, example, group_id: "group", ipa
    })) };
    assert.deepEqual(toStudyContent(data).groups[0].w.map(row => row[3]), starterWords.map(row => row[3]));
    assert.ok(data.words.every(row => row.ipa === ipa));
  }
});

test("stored IPA takes priority over the starter pronunciation without modifying the catalog", () => {
  const data = { ...catalog, words: [{ ...word, word: "reschedule", ipa: "/custom/" },
    { ...word, ipa: "  /custom new word/  " }] };
  const original = structuredClone(data);
  assert.deepEqual(toStudyContent(data).groups[0].w.map(row => row[3]), ["/custom/", "/custom new word/"]);
  assert.deepEqual(data, original);
});

test("IPA fallback normalizes lookup only and never invents IPA for unknown or prototype names", () => {
  const values = [" Reschedule ", "FOLLOW   UP", "new unknown word", "constructor", "__proto__", "toString"];
  const data = { ...catalog, words: values.map(value => ({ ...word, word: value, ipa: "" })) };
  const rows = toStudyContent(data).groups[0].w;
  assert.deepEqual(rows.map(row => row[0]), values);
  assert.deepEqual(rows.map(row => row[3]), ["/ˌriːˈʃedjuːl/", "/ˌfɒləʊ ˈʌp/", "", "", "", ""]);
});

test("paginated content queries do not truncate a large vocabulary", async () => {
  const rows = Array.from({ length: 1203 }, (_, index) => ({ word: "word-" + index, group_id: "group", sort_order: index }));
  const ranges = [];
  const client = { from(table) { let start, end; return {
    select() { return this; }, order() { return this; },
    range(first, last) { start = first; end = last; ranges.push([table, first, last]); return this; },
    abortSignal() { return Promise.resolve({ error: null, data: table === "vocabulary_words" ? rows.slice(start, end + 1) : [] }); }
  }; } };
  const result = await fetchCatalog(client);
  assert.equal(result.words.length, 1203);
  assert.equal(ranges.filter(([table]) => table === "vocabulary_words").length, 3);
});

test("word validation rejects blanks, duplicates, invalid group/order and identity changes", () => {
  assert.equal(validateContent("words", { ...word, word: " new word " }, null, catalog).word, "new word");
  for (const invalid of [{ meaning: " " }, { word: "" }, { group_id: "missing" }, { sort_order: -1 }, { sort_order: 0.5 }, { sort_order: "" }, { sort_order: null }, { ipa: "x".repeat(501) }]) {
    assert.throws(() => validateContent("words", { ...word, ...invalid }, null, catalog));
  }
  assert.throws(() => validateContent("words", { ...word, word: "NEW WORD" }, null, { ...catalog, words: [word] }), /đã tồn tại/);
  assert.throws(() => validateContent("words", { ...word, word: "renamed" }, word.word, catalog), /định danh/);
});

test("reading validation requires complete questions and an in-range correct answer", () => {
  assert.equal(validateContent("readings", reading, "reading", catalog).questions.length, 1);
  for (const questions of [[], [{ ...reading.questions[0], answer_index: -1 }], [{ ...reading.questions[0], answer_index: 2 }], [{ ...reading.questions[0], options: ["Only one"] }], [{ ...reading.questions[0], options: ["", "Two"] }]]) {
    assert.throws(() => validateContent("readings", { ...reading, questions }, null, catalog));
  }
});

test("word create/update/delete use a fixed table and key without upserting deleted rows", async () => {
  const client = clientMock();
  await mutateContent(client, { entity: "words", action: "create", draft: word }, catalog);
  assert.deepEqual(client.calls.find(([method]) => method === "insert"), ["insert", word]);
  client.calls.length = 0;
  await mutateContent(client, { entity: "words", action: "update", key: word.word, draft: { ...word, ipa: "/edited/" } }, catalog);
  assert.ok(!("word" in client.calls.find(([method]) => method === "update")[1]));
  assert.deepEqual(client.calls.find(([method]) => method === "eq"), ["eq", "word", word.word]);
  client.calls.length = 0;
  await mutateContent(client, { entity: "words", action: "delete", key: word.word }, catalog);
  assert.deepEqual(client.calls[0], ["from", "vocabulary_words"]);
  await assert.rejects(() => mutateContent(client, { entity: "vocabulary_progress", action: "delete", key: "any" }, catalog), /hợp lệ/);
  await assert.rejects(() => mutateContent(client, { entity: "__proto__", action: "delete", key: "any" }, catalog), /hợp lệ/);
});

test("a nonempty group cannot be deleted by the client", async () => {
  const client = clientMock();
  await assert.rejects(() => mutateContent(client, { entity: "groups", action: "delete", key: "group" }, { ...catalog, words: [word] }), /hết từ/);
  assert.equal(client.calls.length, 0);
});

test("reading updates call one atomic RPC with stable ID and all questions", async () => {
  const client = clientMock();
  await mutateContent(client, { entity: "readings", action: "update", key: "existing", draft: reading }, catalog);
  assert.equal(client.calls.length, 1);
  assert.deepEqual(client.calls[0], ["rpc", "save_reading_content", { p_id: "existing", p_create: false,
    p_passage: { title: reading.title, time_label: reading.time_label, passage: reading.passage, sort_order: 0 }, p_questions: reading.questions }]);
});

test("new group and reading forms retain their IDs when a lost response is retried", async () => {
  for (const entity of ["groups", "readings"]) {
    const client = clientMock();
    const draft = { ...(entity === "groups" ? { title: "Group", sort_order: 0 } : reading), id: "stable-form-id" };
    let generated = 0;
    const makeId = () => "incorrect-new-id-" + ++generated;
    await mutateContent(client, { entity, action: "create", draft }, catalog, makeId);
    await mutateContent(client, { entity, action: "create", draft }, catalog, makeId);
    assert.equal(generated, 0);
    if (entity === "groups") assert.ok(client.calls.filter(([name]) => name === "insert").every(([, row]) => row.id === draft.id));
    else assert.ok(client.calls.every(([, , params]) => params.p_id === draft.id));
  }
});

test("API errors show actionable messages without exposing backend SQL", async () => {
  for (const code of ["23505", "23503", "23001", "42501", "PGRST116", "PGRST202", "PGRST204"]) {
    const error = { code, message: "Sensitive SQL details" };
    await assert.rejects(() => mutateContent(clientMock(error), { entity: "words", action: "create", draft: word }, catalog), { message: contentError(error) });
    assert.ok(!contentError(error).includes("Sensitive"));
  }
});
