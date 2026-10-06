const path = require("node:path");
const { pathToFileURL } = require("node:url");

async function main() {
  const { readSupabaseConfig } = await import(pathToFileURL(path.join(__dirname, "..", "lib", "supabase-config.js")).href);
  const config = readSupabaseConfig(process.env);
  const tables = ["vocabulary_groups", "vocabulary_words", "reading_passages", "reading_questions"];
  for (const table of tables) {
    const response = await fetch(config.url + "/rest/v1/" + table + "?select=*&limit=1", {
      headers: { apikey: config.publishableKey }, signal: AbortSignal.timeout(10000)
    });
    const data = await response.json();
    if (!response.ok) {
      console.log(table + ": HTTP " + response.status + " (" + (data.code || "error") + ") " + (data.message || ""));
      process.exitCode = 1;
    } else {
      console.log(table + ": connected, " + (data.length ? "contains lesson data" : "empty; run seed.sql"));
    }
  }
}

main().catch(error => { console.error("Connection check failed:", error.message, error.cause ? error.cause.code : ""); process.exitCode = 1; });
