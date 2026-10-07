import assert from "node:assert/strict";
import test from "node:test";
import { readSupabaseConfig } from "../src/lib/supabase/supabase-config.js";
import { gradeReading } from "../src/lib/study/quiz.js";
import { STUDY_CONTENT } from "../src/data/study-content.js";

const env = { url_db: "https://test-project.supabase.co", publishableKey: "sb_publishable_browser_test_key_long" };
const jwt = role => Buffer.from('{}').toString("base64url") + "." + Buffer.from(JSON.stringify({ role })).toString("base64url") + ".signature";

test("reads the exact Vercel variable names and normalizes the Project URL", () => {
  assert.deepEqual(readSupabaseConfig({ ...env, url_db: "  " + env.url_db + "/ ", publishableKey: " " + env.publishableKey + " " }), { url: env.url_db, publishableKey: env.publishableKey });
});

test("production configuration requires both variables, including the correct case", () => {
  assert.throws(() => readSupabaseConfig({}), /url_db, publishableKey/);
  assert.throws(() => readSupabaseConfig({ url_db: env.url_db, publishablekey: env.publishableKey }), /publishableKey/);
  assert.throws(() => readSupabaseConfig({ url_db: env.url_db }, { allowMissing: true }), /publishableKey/);
  assert.deepEqual(readSupabaseConfig({}, { allowMissing: true }), { url: "", publishableKey: "" });
});

test("rejects invalid URLs without logging the value", () => {
  for (const url_db of ["not-a-url", "http://project.supabase.co", "https://user:password@project.supabase.co", "https://project.supabase.co/rest/v1", "https://project.supabase.co?secret=private", "https://project.supabase.co#fragment"]) {
    assert.throws(() => readSupabaseConfig({ ...env, url_db }), error => error.message.startsWith("url_db must") && !error.message.includes(url_db));
  }
});

test("rejects privileged keys before they can be sent to a Client Component", () => {
  for (const publishableKey of ["sb_secret_do_not_ship_this", jwt("service_role"), "not-a-key"]) {
    assert.throws(() => readSupabaseConfig({ ...env, publishableKey }), error => error.message.startsWith("publishableKey must") && !error.message.includes(publishableKey));
  }
  assert.equal(readSupabaseConfig({ ...env, publishableKey: jwt("anon") }).publishableKey, jwt("anon"));
});

test("all original lessons and IDs survive the Next.js migration", () => {
  assert.equal(STUDY_CONTENT.groups.length, 6);
  assert.equal(STUDY_CONTENT.groups.flatMap(group => group.w).length, 42);
  assert.deepEqual(STUDY_CONTENT.readings.map(reading => reading.id), ["remote-work", "meetings"]);
  assert.equal(STUDY_CONTENT.readings.flatMap(reading => reading.q).length, 8);
});

test("quiz scoring validates complete answers and supports edited question counts", () => {
  const reading = STUDY_CONTENT.readings[0];
  assert.equal(gradeReading(reading, [1, null, 1, 1]), null);
  assert.equal(gradeReading(reading, [1]), null);
  assert.equal(gradeReading(reading, [1, 9, 1, 1]), null);
  assert.deepEqual(gradeReading(reading, [1, 2, 1, 1]), { score: 4, total: 4 });
  assert.deepEqual(gradeReading(reading, [0, 2, 1, 1]), { score: 3, total: 4 });
  assert.deepEqual(gradeReading({ q: [{ o: ["A", "B"], a: 1 }] }, [1]), { score: 1, total: 1 });
});
