import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createIpaLookup, dictionaryIpaCandidates, validateIpaWords } from "../src/lib/vocabulary/ipa-suggestions.js";
import { applyImportIpa, missingImportIpa } from "../src/lib/vocabulary/ipa-review.js";
import { prepareVocabularyImport } from "../src/lib/vocabulary/vocabulary-import.js";
import { requestIpaSuggestions } from "../src/lib/admin/admin-browser.js";
import { createStudyApiClient } from "../src/lib/api/api-client.js";

const entry = word => [{ word, phonetic: "əˈtest", phonetics: [
  { text: "/əˈtest/", audio: "https://api.dictionaryapi.dev/media/pronunciations/en/test-us.mp3" },
  { text: "/ˈtest/", audio: "//ssl.gstatic.com/dictionary/static/sounds/test--_gb_1.mp3" },
  { text: "/test/" }
] }];

test("IPA words are bounded and cannot become URLs or paths", () => {
  assert.deepEqual(validateIpaWords(["  Collaborate ", "follow up", "can't"]), ["Collaborate", "follow up", "can't"]);
  assert.deepEqual(validateIpaWords(["R&D", "24/7", "C++", "e.g."]), ["R&D", "24/7", "C++", "e.g."]);
  for (const value of [null, {}, [], Array(21).fill("word"), [null], [""], ["a".repeat(201)], ["hello\nworld"], ["https://evil.example"], ["../../etc"], ["a?b"], ["<word>"]]) assert.throws(() => validateIpaWords(value));
});

test("known starter words return British IPA without sending anything to a provider", async () => {
  const lookup = createIpaLookup({ fetchRequest() { throw new Error("Should not fetch"); } });
  const [reschedule, phrase] = await lookup([" RESCHEDULE ", "follow   up"]);
  assert.deepEqual(reschedule.candidates, [{ ipa: "/ˌriːˈʃedjuːl/", accent: "uk", source: "starter" }]);
  assert.equal(phrase.status, "found"); assert.equal(phrase.word, "follow   up");
});

test("dictionary IPA is deduplicated, UK first; absent audio does not imply British English", () => {
  const candidates = dictionaryIpaCandidates([...entry("hello"), ...entry("hello")], "HELLO");
  assert.deepEqual(candidates.map(candidate => [candidate.ipa, candidate.accent]), [["/ˈtest/", "uk"], ["/test/", "unknown"], ["/əˈtest/", "us"]]);
  assert.deepEqual(dictionaryIpaCandidates([{ word: "hello", phonetic: "həˈləʊ" }], "hello"), [{ ipa: "/həˈləʊ/", accent: "unknown", source: "dictionary" }]);
});

test("malformed/oversized IPA and a different dictionary word are not suggested", () => {
  assert.deepEqual(dictionaryIpaCandidates([{ word: "another", phonetic: "/wrong/" }], "test"), []);
  assert.deepEqual(dictionaryIpaCandidates([{ word: "test", phonetics: [{ text: "<script>" }, { text: "/a\nb/" }, { text: "a".repeat(501) }, { text: 123 }, { text: "//" }] }], "test"), []);
  assert.equal(dictionaryIpaCandidates([{ word: "test", phonetics: [{ text: "test", audio: "javascript:test-uk.mp3" }] }], "test")[0].accent, "unknown");
});

test("lookups use a fixed HTTPS provider, no auth headers, bounded concurrency and deduplicated words", async () => {
  let active = 0, peak = 0;
  const calls = [];
  const lookup = createIpaLookup({ fetchRequest: async (url, options) => {
    active++; peak = Math.max(peak, active); calls.push({ url, options });
    await delay(5); active--;
    return Response.json(entry(decodeURIComponent(new URL(url).pathname.split("/").at(-1))));
  } });
  const words = Array.from({ length: 15 }, (_, i) => `unknown ${i}`);
  const results = await lookup([...words, "Unknown 0"]);
  assert.equal(calls.length, 15); assert.equal(results.length, 16); assert.equal(peak, 4);
  for (const { url, options } of calls) {
    assert.ok(url.startsWith("https://api.dictionaryapi.dev/api/v2/entries/en/"));
    assert.equal(options.redirect, "error"); assert.equal(options.cache, "no-store"); assert.ok(options.signal);
    assert.deepEqual(options.headers, { Accept: "application/json" });
  }
  assert.equal(results.at(-1).word, "Unknown 0");
});

test("positive/negative caches expire, have a capacity, and never cache service outages", async () => {
  let time = 0, calls = 0;
  const lookup = createIpaLookup({ now: () => time, cacheSize: 2, fetchRequest: async url => {
    calls++;
    const word = decodeURIComponent(new URL(url).pathname.split("/").at(-1));
    return word === "missing" ? Response.json({}, { status: 404 }) : word === "offline" ? Response.json({}, { status: 503 }) : Response.json(entry(word));
  } });
  await lookup(["hello"]); await lookup(["HELLO"]); assert.equal(calls, 1);
  await lookup(["missing"]); await lookup(["missing"]); assert.equal(calls, 2);
  time = 600001; await lookup(["missing"]); assert.equal(calls, 3);
  await lookup(["offline"]); await lookup(["offline"]); assert.equal(calls, 5);
  await lookup(["third"]); await lookup(["hello"]); assert.equal(calls, 7);
  time = 5000000; await lookup(["hello"]); assert.equal(calls, 8);
});

test("timeouts, rate limits, malformed and oversized JSON are recoverable per word", async () => {
  for (const fetchRequest of [async () => Response.json({}, { status: 429 }), async () => new Response("not json", { headers: { "Content-Type": "application/json" } }),
    async () => Response.json({ invalid: true }), async () => Response.json([{ word: "hello", filler: "x".repeat(140000) }]),
    async (url, options) => { await delay(1000, null, { signal: options.signal }); return Response.json(entry("hello")); }]) {
    const [result] = await createIpaLookup({ fetchRequest, timeoutMs: 10 })(["hello"]);
    assert.deepEqual(result, { word: "hello", status: "unavailable", candidates: [] });
  }
  const [unknown] = await createIpaLookup({ fetchRequest: async () => Response.json({}, { status: 404 }) })(["constructor"]);
  assert.equal(unknown.status, "not-found");
});

const catalog = { groups: [{ id: "g", title: "Group", sort_order: 0 }], words: [
  { word: "stored", group_id: "g", meaning: "old", ipa: "/old/", example: "old example", sort_order: 0 },
  { word: "blank", group_id: "g", meaning: "blank", ipa: "", example: "", sort_order: 1 }
], readings: [], questions: [] };

test("import suggestions fill only approved missing IPA, never overwrite file/database IPA or skipped rows", () => {
  const rows = [{ word: "fresh", meaning: "new" }, { word: "custom", meaning: "custom", ipa: "/file/" },
    { word: "STORED", meaning: "updated" }, { word: "blank", meaning: "updated" }];
  const preview = prepareVocabularyImport({ rows, groupId: "g", mode: "update" }, catalog);
  assert.deepEqual(missingImportIpa(preview, catalog), ["fresh", "blank"]);
  const approved = new Map(["fresh", "custom", "stored", "blank"].map(word => [word, "/suggested/"]));
  const result = applyImportIpa(rows, preview, catalog, approved);
  assert.equal(result[0].ipa, "/suggested/"); assert.equal(result[1].ipa, "/file/");
  assert.equal(result[2], rows[2]); assert.ok(!Object.hasOwn(result[2], "ipa")); assert.equal(result[3].ipa, "/suggested/");
  assert.ok(!Object.hasOwn(rows[0], "ipa"));
  const final = prepareVocabularyImport({ rows: result, groupId: "g", mode: "update" }, catalog);
  assert.equal(final.prepared[2].row.ipa, "/old/"); assert.equal(final.prepared[2].row.example, "old example");
  assert.deepEqual(applyImportIpa(rows, preview, catalog, new Map()), rows);
  const skipped = prepareVocabularyImport({ rows, groupId: "g", mode: "skip" }, catalog);
  assert.deepEqual(missingImportIpa(skipped, catalog), ["fresh"]);
  assert.equal(applyImportIpa(rows, skipped, catalog, approved)[3], rows[3]);
});

test("an explicitly cleared database IPA is not silently replaced by suggestions", () => {
  const rows = [{ word: "stored", meaning: "old", ipa: "" }];
  const preview = prepareVocabularyImport({ rows, groupId: "g", mode: "update" }, catalog);
  assert.deepEqual(missingImportIpa(preview, catalog), []);
  assert.equal(applyImportIpa(rows, preview, catalog, new Map([["stored", "/new/"]]))[0], rows[0]);
});

test("browser IPA requests use same-origin cookie/CSRF facade and do not send emails or credentials", async () => {
  const calls = [];
  const fetchRequest = async (url, options) => {
    calls.push({ url, options });
    return Response.json(url === "/api/auth/session" ? { ok: true, user: { id: "admin" }, csrfToken: "a".repeat(64) } : { ok: true, results: [] });
  };
  const client = createStudyApiClient({ url: "https://test.supabase.co" }, { location: { hash: "" } }, fetchRequest);
  assert.equal((await requestIpaSuggestions(client, ["hello"], fetchRequest)).ok, true);
  const lookup = calls.find(call => call.url === "/api/admin/ipa");
  assert.deepEqual(JSON.parse(lookup.options.body), { words: ["hello"] });
  assert.equal(lookup.options.credentials, "same-origin");
  assert.equal(new Headers(lookup.options.headers).get("X-CSRF-Token"), "a".repeat(64));
  assert.equal(new Headers(lookup.options.headers).get("Authorization"), null);
  assert.ok(calls.every(call => call.url.startsWith("/api/")));
});
