import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { strToU8, unzipSync, zipSync } from "fflate";
import { parseVocabularyCsv, decodeVocabularyFile } from "../lib/vocabulary-csv.js";
import { prepareVocabularyImport } from "../lib/vocabulary-import.js";
import { vocabularySheetToCsv, vocabularyXlsxToCsv } from "../lib/vocabulary-xlsx.js";

const template = readFileSync(new URL("../public/templates/vocabulary.xlsx", import.meta.url));
const standard = readFileSync(new URL("../public/templates/vocabulary.csv", import.meta.url));
const expected = parseVocabularyCsv(decodeVocabularyFile(standard));
const parseSheet = (sheet, options) => parseVocabularyCsv(vocabularySheetToCsv(sheet), options);

test("native Excel template round-trips every Vietnamese, IPA and example character", async () => {
  assert.deepEqual([...template.subarray(0, 4)], [0x50, 0x4B, 0x03, 0x04]);
  for (const input of [template, template.buffer.slice(template.byteOffset, template.byteOffset + template.byteLength)]) {
    const rows = parseVocabularyCsv(await vocabularyXlsxToCsv(input));
    assert.deepEqual(rows, expected);
    assert.deepEqual(prepareVocabularyImport({ rows, groupId: "g", mode: "skip" }, { groups: [{ id: "g" }], words: [] }).counts,
      { create: 2, update: 0, skip: 0 });
  }
});

test("Excel rows preserve quoted examples, whitespace, Unicode aliases and column order", () => {
  const example = 'Say "hello",\nthen continue.';
  assert.deepEqual(parseSheet([["Ví dụ", "Nghĩa", "Từ", "Phiên âm"], [example, " xin chào ", "hello", "/həˈləʊ/"]]), [
    { word: "hello", meaning: " xin chào ", ipa: "/həˈləʊ/", example }
  ]);
});

test("Excel padding handles empty cells without losing optional-field semantics", () => {
  const blanks = parseSheet([["word", "meaning", "ipa", "example"], ["agenda", "chương trình"], [null, null, null, null]]);
  const omitted = parseSheet([["word", "meaning"], ["agenda", "chương trình"]]);
  assert.deepEqual(blanks, [{ word: "agenda", meaning: "chương trình", ipa: "", example: "" }]);
  assert.deepEqual(omitted, [{ word: "agenda", meaning: "chương trình" }]);
  const catalog = { groups: [{ id: "g" }], words: [{ word: "agenda", group_id: "g", meaning: "old", ipa: "/old/", example: "old", sort_order: 0 }] };
  assert.equal(prepareVocabularyImport({ rows: blanks, groupId: "g", mode: "update" }, catalog).prepared[0].row.ipa, "");
  assert.equal(prepareVocabularyImport({ rows: omitted, groupId: "g", mode: "update" }, catalog).prepared[0].row.ipa, "/old/");
  assert.deepEqual(parseSheet([["hello", "xin chào", null, null]], { header: false }), [{ word: "hello", meaning: "xin chào", ipa: "", example: "" }]);
});

test("Excel row validation rejects empty data, typed cells, bad headers and limits", () => {
  assert.throws(() => vocabularySheetToCsv([[null, null], [" ", ""]]), /Chưa có/);
  for (const value of [123, true, new Date()]) {
    assert.throws(() => parseSheet([["word", "meaning"], ["hello", value]]), /văn bản/);
  }
  for (const head of [["word", "ipa"], ["word", "Từ", "meaning"]]) {
    assert.throws(() => parseSheet([head, ["hello", "xin chào", "other"]]));
  }
  assert.throws(() => parseSheet([["word", "meaning"], ["hello", "x".repeat(1048577)]]), /1 MB/);
  assert.throws(() => parseSheet([Array(33).fill("word")]), /32 cột/);
  assert.equal(parseSheet([["word", "meaning"], ...Array.from({ length: 500 }, (_, i) => [`word${i}`, "meaning"])]).length, 500);
  assert.throws(() => parseSheet([["word", "meaning"], ...Array.from({ length: 501 }, (_, i) => [`word${i}`, "meaning"])]), /500/);
  assert.throws(() => parseSheet(Array.from({ length: 501 }, (_, i) => [`word${i}`, "meaning"]), { header: false }), /500/);
});

test("Excel reader rejects non-XLSX, corrupt archives, oversized files and ZIP bombs", async () => {
  for (const bytes of [new Uint8Array(), strToU8("word,meaning\nhello,test"), Uint8Array.of(0x50, 0x4B, 0, 0)]) {
    await assert.rejects(() => vocabularyXlsxToCsv(bytes), /file Excel/);
  }
  await assert.rejects(() => vocabularyXlsxToCsv(new Uint8Array(1048577)), /1 MB/);
  const bomb = zipSync({ "big.xml": new Uint8Array(8 * 1024 * 1024 + 1) });
  assert.ok(bomb.length < 1048576);
  await assert.rejects(() => vocabularyXlsxToCsv(bomb), /giải nén quá lớn/);
  const manyEntries = zipSync(Object.fromEntries(Array.from({ length: 257 }, (_, i) => [`part${i}`, new Uint8Array()])));
  await assert.rejects(() => vocabularyXlsxToCsv(manyEntries), /giải nén quá lớn/);
});

test("Excel reader rejects sparse row/column coordinates before allocating a large sheet", async () => {
  const original = unzipSync(template);
  const name = Object.keys(original).find(name => /^xl\/worksheets\/[^/]+\.xml$/.test(name));
  for (const xml of [
    '<worksheet><sheetData><row r="1048576"><c r="A1048576" t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>',
    '<worksheet><sheetData><row r="1"><c r="XFD1" t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>'
  ]) {
    const bytes = zipSync({ ...original, [name]: strToU8(xml) });
    await assert.rejects(() => vocabularyXlsxToCsv(bytes), /Trang tính quá lớn/);
    const customPath = zipSync({ ...original, "xl/custom/sheet.xml": strToU8(xml) });
    await assert.rejects(() => vocabularyXlsxToCsv(customPath), /Trang tính quá lớn/);
  }
});
