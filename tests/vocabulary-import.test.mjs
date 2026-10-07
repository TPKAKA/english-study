import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { decodeVocabularyFile, parseVocabularyCsv } from "../src/lib/vocabulary/vocabulary-csv.js";
import { importVocabulary, prepareVocabularyImport } from "../src/lib/vocabulary/vocabulary-import.js";
import { GET as downloadTemplate } from "../src/app/api/vocabulary-template/route.js";

const catalog = { groups: [{ id: "g", title: "Group" }, { id: "other", title: "Other" }], words: [
  { word: "Agenda", group_id: "g", meaning: "Old meaning", ipa: "/old/", example: "Old example.", sort_order: 4 }
] };
const change = (rows, extra = {}) => ({ rows, groupId: "g", mode: "skip", ...extra });

test("standard CSV template identifies UTF-8 without Excel metadata and imports intact", () => {
  const file = readFileSync(new URL("../public/templates/vocabulary.csv", import.meta.url));
  assert.deepEqual([...file.subarray(0, 3)], [0xEF, 0xBB, 0xBF]);
  const source = file.toString("utf8");
  assert.match(source, /^\uFEFFword,meaning,ipa,example\r?\n/);
  const rows = parseVocabularyCsv(source);
  assert.deepEqual(rows, [
    { word: "collaborate", meaning: "hợp tác", ipa: "/kəˈlæbəreɪt/", example: "We collaborate with the design team." },
    { word: "invoice", meaning: "hóa đơn", ipa: "/ˈɪnvɔɪs/", example: "Please check the invoice, then send it to finance." }
  ]);
  assert.equal(prepareVocabularyImport(change(rows), catalog).counts.create, 2);
});

test("Excel download uses UTF-16LE BOM and CRLF with a separator hint, and re-imports identically", async () => {
  const response = await downloadTemplate();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /charset=utf-16le/);
  assert.match(response.headers.get("content-disposition"), /attachment; filename="vocabulary-excel.csv"/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 2)], [0xFF, 0xFE]);
  const source = decodeVocabularyFile(bytes);
  assert.match(source, /^sep=,\r\nword,meaning,ipa,example\r\n/);
  assert.ok(!source.replace(/\r\n/g, "").includes("\n"));
  const standard = readFileSync(new URL("../public/templates/vocabulary.csv", import.meta.url));
  assert.deepEqual(parseVocabularyCsv(source), parseVocabularyCsv(decodeVocabularyFile(standard)));
});

test("file decoding accepts UTF-8 with/without BOM, UTF-16LE, UTF-16BE and Excel Unicode TSV", () => {
  const csv = 'word,meaning,ipa,example\r\nhello,xin chào,/həˈləʊ/,"Say hello, then continue."';
  const encodings = [Buffer.from(csv, "utf8"), Buffer.from(`\uFEFF${csv}`, "utf8"),
    Buffer.from(`\uFEFF${csv}`, "utf16le"), Buffer.from(`\uFEFF${csv}`, "utf16le").swap16()];
  for (const bytes of encodings) {
    assert.equal(decodeVocabularyFile(bytes), csv);
    assert.equal(decodeVocabularyFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), csv);
    assert.deepEqual(parseVocabularyCsv(decodeVocabularyFile(bytes)), [
      { word: "hello", meaning: "xin chào", ipa: "/həˈləʊ/", example: "Say hello, then continue." }
    ]);
  }
  const tsv = Buffer.from("\uFEFFword\tmeaning\tipa\r\nhello\txin chào\t/həˈləʊ/", "utf16le");
  assert.deepEqual(parseVocabularyCsv(decodeVocabularyFile(tsv)), [{ word: "hello", meaning: "xin chào", ipa: "/həˈləʊ/" }]);
});

test("file decoding rejects corrupt Unicode, missing UTF-16 BOM, ANSI and oversized files", () => {
  for (const bytes of [Uint8Array.of(0xC3, 0x28), Uint8Array.of(0xFF, 0xFE, 0x61), Uint8Array.of(0xFE, 0xFF, 0x00),
    Buffer.from("word,meaning\nhello,caf\u00e9", "latin1"), Buffer.from("word,meaning\nhello,test", "utf16le")]) {
    assert.throws(() => decodeVocabularyFile(bytes), /mã hóa/);
  }
  assert.throws(() => decodeVocabularyFile(new Uint8Array(1048577)), /1 MB/);
  assert.equal(decodeVocabularyFile(new Uint8Array()), "");
});

test("Excel separator hints work with BOM, supported separators and line endings", () => {
  for (const bom of ["", "\uFEFF"]) for (const delimiter of [",", ";", "\t"]) for (const newline of ["\r\n", "\n", "\r"]) {
    const source = `${bom}sep=${delimiter}${newline}word${delimiter}meaning${newline}hello${delimiter}xin chào`;
    assert.deepEqual(parseVocabularyCsv(source), [{ word: "hello", meaning: "xin chào" }]);
    assert.deepEqual(parseVocabularyCsv(source, { delimiter }), [{ word: "hello", meaning: "xin chào" }]);
    assert.deepEqual(parseVocabularyCsv(`${bom}sep=${delimiter}${newline}hello${delimiter}xin chào`, { header: false }), [
      { word: "hello", meaning: "xin chào" }
    ]);
  }
  assert.deepEqual(parseVocabularyCsv("sep=;\nword;meaning\nhello;xin chào, hello, welcome"), [
    { word: "hello", meaning: "xin chào, hello, welcome" }
  ]);
});

test("manual delimiters override hints and ordinary cells starting with sep= remain data", () => {
  assert.deepEqual(parseVocabularyCsv("sep=;\nword,meaning\nhello,xin chào", { delimiter: "," }), [
    { word: "hello", meaning: "xin chào" }
  ]);
  assert.deepEqual(parseVocabularyCsv("sep=,separator notation", { header: false }), [
    { word: "sep=", meaning: "separator notation" }
  ]);
  assert.deepEqual(parseVocabularyCsv("word,meaning\nsep=,separator notation"), [
    { word: "sep=", meaning: "separator notation" }
  ]);
  for (const source of ["sep=,\n", "\uFEFFsep=;\r\n \r\n", "sep=|\nword|meaning\nhello|xin chào"]) {
    assert.throws(() => parseVocabularyCsv(source));
  }
  assert.throws(() => parseVocabularyCsv("sep=,\nword,meaning\nhello,xin chào", { delimiter: ";" }));
  assert.throws(() => parseVocabularyCsv("sep=,\nword,meaning\n" + Array.from({ length: 501 }, (_, i) => `word${i},meaning`).join("\n")), /500/);
});

test("CSV accepts UTF-8 BOM, flexible headers, quotes, commas and embedded newlines", () => {
  assert.deepEqual(parseVocabularyCsv('\uFEFFVí dụ,Nghĩa,Từ,IPA\r\n"Say ""hello"",\nand continue.",xin chào,hello,/hello/\r\n'), [
    { word: "hello", meaning: "xin chào", ipa: "/hello/", example: 'Say "hello",\nand continue.' }
  ]);
});

test("TSV and semicolon CSV auto-detection and headerless columns work", () => {
  assert.deepEqual(parseVocabularyCsv("word\tmeaning\nhello\txin chào"), [{ word: "hello", meaning: "xin chào" }]);
  assert.deepEqual(parseVocabularyCsv("word;meaning;ipa\nhello;xin chào;/hello/"), [{ word: "hello", meaning: "xin chào", ipa: "/hello/" }]);
  assert.deepEqual(parseVocabularyCsv("hello,xin chào", { header: false }), [{ word: "hello", meaning: "xin chào" }]);
  assert.deepEqual(parseVocabularyCsv("hello,xin chào,/hello/,Example", { header: false }), [{ word: "hello", meaning: "xin chào", ipa: "/hello/", example: "Example" }]);
});

test("CSV rejects invalid/duplicate headers, malformed quoting, mismatched columns and limits", () => {
  for (const source of ["", "word,ipa\nhello,/hello/", "word,Từ,meaning\nhello,other,test", 'word,meaning\nhello,"unterminated', "word,meaning\nhello,test,extra", "word,meaning\n"]) {
    assert.throws(() => parseVocabularyCsv(source));
  }
  assert.throws(() => parseVocabularyCsv("x".repeat(1048577)), /1 MB/);
  assert.throws(() => parseVocabularyCsv("word,meaning\n" + Array.from({ length: 501 }, (_, i) => `word${i},meaning`).join("\n")), /500/);
  assert.equal(parseVocabularyCsv("word,meaning\n" + Array.from({ length: 500 }, (_, i) => `word${i},meaning`).join("\n")).length, 500);
});

test("import defaults to skipping existing case variants and appends new cards in order", () => {
  const result = prepareVocabularyImport(change([{ word: " agenda ", meaning: "Changed" }, { word: "hello", meaning: "xin chào" }, { word: "bye", meaning: "tạm biệt" }]), catalog);
  assert.deepEqual(result.counts, { create: 2, update: 0, skip: 1 });
  assert.deepEqual(result.prepared.map(item => item.row.word), ["Agenda", "hello", "bye"]);
  assert.deepEqual(result.prepared.map(item => item.row.sort_order), [4, 5, 6]);
  assert.equal(result.prepared[0].row.ipa, "/old/");
});

test("update preserves word/progress identity and omitted optional fields, but accepts explicit clears", () => {
  const result = prepareVocabularyImport(change([{ word: "AGENDA", meaning: "Updated" }], { mode: "update" }), catalog);
  assert.equal(result.prepared[0].row.word, "Agenda");
  assert.equal(result.prepared[0].row.ipa, "/old/");
  assert.equal(result.prepared[0].row.example, "Old example.");
  assert.equal(result.prepared[0].row.sort_order, 4);
  assert.equal(result.counts.update, 1);
  const moved = prepareVocabularyImport(change([{ word: "agenda", meaning: "Updated", ipa: "", example: "" }], { mode: "update", groupId: "other" }), catalog);
  assert.equal(moved.prepared[0].row.group_id, "other");
  assert.equal(moved.prepared[0].row.ipa, "");
  assert.equal(moved.prepared[0].row.sort_order, 0);
});

test("import validates every row, duplicate normalized words, group, mode and batch limits", () => {
  for (const input of [change([]), change([{ word: "x", meaning: "" }]), change([{ word: "x", meaning: "ok", ipa: {} }]),
    change([{ word: "x", meaning: "ok" }, { word: " X ", meaning: "ok" }]), change([{ word: "x", meaning: "ok" }], { groupId: "missing" }),
    change([{ word: "x", meaning: "ok" }], { mode: "delete" }), change(Array(501).fill({ word: "x", meaning: "ok" }))]) {
    assert.throws(() => prepareVocabularyImport(input, catalog));
  }
  assert.throws(() => prepareVocabularyImport(change([{ word: "valid", meaning: "ok" }, { word: "invalid", meaning: "" }]), catalog), /Bản ghi 2/);
});

test("import calls one atomic RPC only after all validation and returns DB counts", async () => {
  const calls = [];
  const client = { rpc(name, args) { calls.push([name, args]); return { async abortSignal() { return { data: { imported: 1, skipped: 1 }, error: null }; } }; } };
  assert.deepEqual(await importVocabulary(client, change([{ word: "agenda", meaning: "ok" }, { word: "hello", meaning: "hello" }]), catalog), { imported: 1, skipped: 1 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "import_vocabulary_words");
  assert.equal(calls[0][1].p_rows[0].word, "Agenda");
  await assert.rejects(() => importVocabulary(client, change([{ word: "invalid", meaning: "" }]), catalog));
  assert.equal(calls.length, 1);
});

test("import missing migration and database failures never expose backend details", async () => {
  const client = { rpc() { return { async abortSignal() { return { error: { code: "PGRST202", message: "private detail" } }; } }; } };
  await assert.rejects(() => importVocabulary(client, change([{ word: "x", meaning: "ok" }]), catalog), /20261006_vocabulary_import.sql/);
  client.rpc = () => ({ async abortSignal() { throw new Error("private detail"); } });
  await assert.rejects(() => importVocabulary(client, change([{ word: "x", meaning: "ok" }]), catalog), error => !error.message.includes("private detail"));
});
