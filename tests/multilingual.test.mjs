import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_LANGUAGES, cardId, cardPronunciation, languageContent } from "../src/lib/study/languages.js";
import { MULTILINGUAL_CONTENT } from "../src/data/korean-content.js";
import { toStudyContent, validateContent, mutateContent, fetchCatalog } from "../src/lib/content/content-admin.js";
import { selectSrsQueue } from "../src/lib/study/srs.js";
import { gradePracticeAnswer, selectPracticeQueue, makePracticeQuestion } from "../src/lib/study/typing-practice.js";
import { prepareVocabularyImport } from "../src/lib/vocabulary/vocabulary-import.js";
import { missingImportIpa } from "../src/lib/vocabulary/ipa-review.js";
import { parseVocabularyCsv, decodeVocabularyFile } from "../src/lib/vocabulary/vocabulary-csv.js";
import { vocabularyXlsxToCsv } from "../src/lib/vocabulary/vocabulary-xlsx.js";
import { templateCsv, templateXlsx, vocabularyTemplateRows } from "../src/lib/vocabulary/vocabulary-template.js";
import { GET } from "../src/app/api/vocabulary-template/route.js";
import { readAllCardRows } from "../src/lib/study/card-storage.js";

const catalog = { languages: DEFAULT_LANGUAGES, multilingual: true, groups: [
  { id: "en-g", title: "English", language_code: "en" }, { id: "ko-g", title: "한국어", language_code: "ko" },
  { id: "en-2", title: "English 2", language_code: "en" }], readings: [], questions: [],
  words: [{ id: "original-card", word: "agenda", group_id: "en-g", meaning: "chương trình", ipa: "", example: "An agenda.", sort_order: 0 }] };
const draft = { ...catalog.words[0], reading: "", romanization: "", cloze_text: "", cloze_answer: "" };

test("language filtering keeps English cache IDs and separates Korean queues", () => {
  const english = languageContent(MULTILINGUAL_CONTENT, "en"), korean = languageContent(MULTILINGUAL_CONTENT, "ko");
  assert.equal(english.groups.flatMap(group => group.w).length, 42);
  assert.equal(korean.groups.flatMap(group => group.w).length, 10);
  assert.equal(korean.readings.length, 0);
  assert.equal(cardId(english.groups[0].w[0]), "reschedule");
  assert.equal(cardId(korean.groups[0].w[0]), "ko-hello");
  const mistakes = { "ko-hello": { needs_retry: true }, reschedule: { needs_retry: true } };
  assert.equal(selectPracticeQueue(korean, mistakes, "meaning", "", true).length, 1);
  assert.equal(selectPracticeQueue(english, mistakes, "meaning", "", true).length, 1);
  assert.equal(selectSrsQueue(korean, {}, Date.now()).length, 10);
});

test("stable IDs allow spelling edits without changing progress and reject identity/language moves", async () => {
  const renamed = validateContent("words", { ...draft, word: "meeting agenda" }, draft.id, catalog);
  assert.equal(renamed.id, draft.id); assert.equal(renamed.word, "meeting agenda");
  assert.throws(() => validateContent("words", { ...draft, id: "another" }, draft.id, catalog), /ID/);
  assert.throws(() => validateContent("words", { ...draft, group_id: "ko-g" }, draft.id, catalog), /ngôn ngữ/);
  assert.equal(validateContent("words", { ...draft, group_id: "en-2" }, draft.id, catalog).id, draft.id);
  const calls = [];
  const query = { update(row) { calls.push(row); return this; }, eq(key, value) { calls.push([key, value]); return this; }, select() { return this; }, single() { return this; }, async abortSignal() { return { error: null }; } };
  await mutateContent({ from() { return query; } }, { entity: "words", action: "update", key: draft.id, draft: { ...draft, word: "meeting agenda" } }, catalog);
  assert.equal(calls[0].word, "meeting agenda"); assert.ok(!Object.hasOwn(calls[0], "id")); assert.deepEqual(calls[1], ["id", draft.id]);
});

test("duplicate and import lookups are group scoped, while English IPA fallback never leaks into Korean", () => {
  assert.throws(() => validateContent("words", draft, null, catalog), /đã tồn tại/);
  assert.equal(validateContent("words", { ...draft, id: "new", group_id: "ko-g" }, null, catalog).word, "agenda");
  const preview = prepareVocabularyImport({ rows: [{ word: "agenda", meaning: "의제" }], groupId: "ko-g", mode: "update" }, catalog);
  assert.deepEqual(preview.counts, { create: 1, update: 0, skip: 0 });
  assert.deepEqual(missingImportIpa(preview, catalog), []);
  const content = toStudyContent({ ...catalog, words: [...catalog.words, { ...draft, id: "ko-card", group_id: "ko-g", reading: "[의제]", romanization: "uije" }] });
  assert.equal(content.groups[0].w[0][3], "/əˈdʒendə/");
  assert.equal(content.groups[1].w[0][3], "");
  assert.equal(cardPronunciation(content.groups[1].w[0]), "[의제]");
  assert.equal(cardId(content.groups[0].w[0]), "original-card");
});

test("Korean cloze supports particles and explicit inflected answers, not romanized guesses", () => {
  const card = languageContent(MULTILINGUAL_CONTENT, "ko").groups[0].w[2];
  assert.equal(makePracticeQuestion(card, "cloze").prompt, "저는 _____에 갑니다.");
  assert.equal(gradePracticeAnswer(card, "cloze", "학교").correct, true);
  assert.equal(gradePracticeAnswer(card, "meaning", "hakgyo").correct, false);
  const inflected = ["가다", "đi", "학교에 가요.", "", { id: "ko-go", language_code: "ko", cloze_text: "학교에 _____.", cloze_answer: "가요" }];
  assert.equal(gradePracticeAnswer(inflected, "cloze", "가요").correct, true);
  assert.equal(gradePracticeAnswer(inflected, "meaning", "가다").correct, true);
  for (const changes of [{ cloze_text: "No blank", cloze_answer: "x" }, { cloze_text: "_____", cloze_answer: "" }, { reading: "x".repeat(501) }]) assert.throws(() => validateContent("words", { ...draft, ...changes }, draft.id, catalog));
});

test("adding a language validates code, locale and pronunciation mode and protects occupied languages", async () => {
  const language = { code: "ja", name: "Tiếng Nhật", speech_locale: "ja-jp", pronunciation_mode: "reading", sort_order: 2 };
  assert.equal(validateContent("languages", language, null, catalog).speech_locale, "ja-JP");
  for (const changes of [{ code: "../ja" }, { code: "en US" }, { speech_locale: "bad_locale" }, { pronunciation_mode: "unknown" }, { name: "" }]) assert.throws(() => validateContent("languages", { ...language, ...changes }, null, catalog));
  assert.throws(() => validateContent("languages", language, "en", catalog));
  assert.throws(() => validateContent("groups", { title: "new", sort_order: 0, language_code: "ja" }, null, catalog));
  await assert.rejects(() => mutateContent({}, { entity: "languages", action: "delete", key: "en" }, catalog), /còn nhóm/);
});

test("Korean Excel and UTF-16 CSV downloads preserve every Hangul, accent, reading and blank", async () => {
  const rows = vocabularyTemplateRows("ko"), expected = parseVocabularyCsv(templateCsv(rows));
  assert.deepEqual(parseVocabularyCsv(await vocabularyXlsxToCsv(templateXlsx(rows))), expected);
  assert.equal(expected[0].word, "학교"); assert.equal(expected[0].reading, "[학꾜]");
  assert.deepEqual(prepareVocabularyImport({ rows: expected, groupId: "ko-g", mode: "skip" }, catalog).counts, { create: 2, update: 0, skip: 0 });
  for (const format of ["csv", "xlsx"]) {
    const response = await GET(new Request(`http://localhost/api/vocabulary-template?language=ko&format=${format}`));
    const bytes = await response.arrayBuffer();
    assert.deepEqual(parseVocabularyCsv(format === "csv" ? decodeVocabularyFile(bytes) : await vocabularyXlsxToCsv(bytes)), expected);
  }
  assert.equal((await GET(new Request("http://localhost/api/vocabulary-template?language=../../secret"))).status, 400);
  assert.deepEqual(vocabularyTemplateRows("ja")[0], rows[0]);
});

test("missing language migration falls back only on missing-table errors, never masks permission failures", async () => {
  function client(code) { return { from(table) { return { select() { return this; }, order() { return this; }, range() { return this; }, async abortSignal() { return table === "study_languages" ? { error: { code }, data: null } : { error: null, data: [] }; } }; } }; }
  const result = await fetchCatalog(client("PGRST205"));
  assert.equal(result.multilingual, false); assert.deepEqual(result.languages, [DEFAULT_LANGUAGES[0]]);
  await assert.rejects(() => fetchCatalog(client("42501")), { code: "42501" });
});

test("progress reads all pages and aliases database card IDs without rewriting caches", async () => {
  const rows = Array.from({ length: 1201 }, (_, i) => ({ word: `card-${i}`, is_known: true })), calls = [];
  const client = { from(table) { let offset; return { select(columns) { calls.push([table, columns]); return this; }, eq() { return this; }, order() { return this; }, range(start) { offset = start; return this; }, async abortSignal() { return { data: rows.slice(offset, offset + 500), error: null }; } }; } };
  assert.deepEqual(await readAllCardRows(client, "vocabulary_progress", "is_known,updated_at", "owner"), rows);
  assert.equal(calls.length, 3); assert.ok(calls.every(([, columns]) => columns.startsWith("word:card_id,")));
});
