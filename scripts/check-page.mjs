import assert from "node:assert/strict";

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

const template = await fetch(new URL("/templates/vocabulary.csv", origin));
assert.equal(template.status, 200);
assert.match(await template.text(), /^word,meaning,ipa,example/);
console.log("PASS: import CSV template loads");

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
