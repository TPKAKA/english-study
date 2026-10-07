import assert from "node:assert/strict";
import { decodeVocabularyFile, parseVocabularyCsv } from "../lib/vocabulary-csv.js";
import { vocabularyXlsxToCsv } from "../lib/vocabulary-xlsx.js";

const origin = process.env.TEST_URL || "http://localhost:3000";
const response = await fetch(origin, { signal: AbortSignal.timeout(30000) });
assert.equal(response.status, 200);
const html = await response.text();
assert.match(html, /<h1>Business English<\/h1>/);
assert.match(html, /reschedule/);
assert.match(html, /Từ vựng/);
assert.ok(html.includes("/ˌriːˈʃedjuːl/"));
assert.match(html, /Quản lý thẻ/);
assert.match(html, /Thêm thẻ/);
assert.match(html, /Import thẻ/);
assert.ok(!html.includes("supabase-config.js"));
assert.ok(!html.includes("sb_secret_"));
console.log("PASS: Next.js renders the study page with the original lessons");

const assets = new Set(Array.from(html.matchAll(/(?:src|href)="([^"\s]*\/_next\/[^"\s]+)"/g), match => match[1].replace(/&amp;/g, "&")));
assert.ok(assets.size > 0);
for (const asset of assets) {
  const assetResponse = await fetch(new URL(asset, origin), { signal: AbortSignal.timeout(30000) });
  assert.equal(assetResponse.status, 200, asset);
  assert.ok((await assetResponse.arrayBuffer()).byteLength > 0, asset);
}
console.log("PASS: all " + assets.size + " referenced Next.js assets load");

const template = await fetch(new URL("/api/vocabulary-template", origin));
assert.equal(template.status, 200);
assert.match(template.headers.get("content-type"), /charset=utf-16le/);
assert.match(template.headers.get("content-disposition"), /vocabulary-excel.csv/);
const templateBytes = new Uint8Array(await template.arrayBuffer());
assert.deepEqual([...templateBytes.subarray(0, 2)], [0xFF, 0xFE]);
const templateSource = decodeVocabularyFile(templateBytes);
assert.match(templateSource, /^sep=,\r\nword,meaning,ipa,example/);
const templateRows = parseVocabularyCsv(templateSource);
assert.equal(templateRows.length, 2);
assert.equal(templateRows[0].meaning, "hợp tác");
assert.equal(templateRows[0].ipa, "/kəˈlæbəreɪt/");
assert.equal(templateRows[1].example, "Please check the invoice, then send it to finance.");
console.log("PASS: Excel Unicode CSV template downloads and re-imports without losing Vietnamese or IPA");
const standard = await fetch(new URL("/templates/vocabulary.csv", origin));
assert.equal(standard.status, 200);
assert.deepEqual(parseVocabularyCsv(decodeVocabularyFile(await standard.arrayBuffer())), templateRows);
console.log("PASS: standard UTF-8 CSV stays compatible");

const excel = await fetch(new URL("/templates/vocabulary.xlsx", origin));
assert.equal(excel.status, 200);
const excelBytes = new Uint8Array(await excel.arrayBuffer());
assert.deepEqual([...excelBytes.subarray(0, 4)], [0x50, 0x4B, 0x03, 0x04]);
assert.deepEqual(parseVocabularyCsv(await vocabularyXlsxToCsv(excelBytes)), templateRows);
console.log("PASS: native XLSX template downloads and imports exact Vietnamese and IPA");

const legacy = await fetch(new URL("/business-english.html", origin), { redirect: "manual", signal: AbortSignal.timeout(10000) });
assert.equal(legacy.status, 308);
assert.equal(new URL(legacy.headers.get("location"), origin).pathname, "/");
console.log("PASS: the legacy HTML address redirects to the Next.js home page");

for (const path of ["/api/admin", "/api/admin/password"]) for (const method of ["GET", "POST"]) {
  const admin = await fetch(new URL(path, origin), {
    method, signal: AbortSignal.timeout(10000),
    ...(method === "POST" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity: "groups", action: "delete", key: "any" }) } : {})
  });
  assert.equal(admin.status, 401);
  assert.match(admin.headers.get("cache-control"), /no-store/);
  assert.equal((await admin.json()).canEdit, false);
}
console.log("PASS: admin CRUD and default password endpoints reject anonymous requests");
