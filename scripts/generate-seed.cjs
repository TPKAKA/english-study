const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
async function main() {
const { STUDY_CONTENT } = await import(pathToFileURL(path.join(root, "study-content.js")).href);
const { groups, readings } = STUDY_CONTENT;
const quote = value => "'" + String(value).replace(/'/g, "''") + "'";
const insert = (table, columns, rows, conflict) =>
  "insert into public." + table + " (" + columns + ") values\n" +
  rows.map(row => "  (" + row.join(", ") + ")").join(",\n") +
  "\non conflict (" + conflict + ") do nothing;\n";

const statements = [
  "-- Generated from study-content.js by node scripts/generate-seed.cjs.\n-- Existing lesson edits are preserved when this script is rerun.\nbegin;\n",
  insert("vocabulary_groups", "id, title, sort_order", groups.map((group, index) => [quote(group.id), quote(group.n), index]), "id"),
  insert("vocabulary_words", "word, group_id, meaning, example, sort_order", groups.flatMap(group =>
    group.w.map((word, index) => [quote(word[0]), quote(group.id), quote(word[1]), quote(word[2]), index])
  ), "word"),
  insert("reading_passages", "id, title, time_label, passage, sort_order", readings.map((reading, index) =>
    [quote(reading.id), quote(reading.t), quote(reading.time), quote(reading.p), index]
  ), "id"),
  insert("reading_questions", "reading_id, sort_order, prompt, options, answer_index, explanation", readings.flatMap(reading =>
    reading.q.map((question, index) => [quote(reading.id), index, quote(question.q),
      "ARRAY[" + question.o.map(quote).join(", ") + "]::text[]", question.a, quote(question.e)])
  ), "reading_id, sort_order"),
  "commit;\n"
];
fs.writeFileSync(path.join(root, "supabase", "seed.sql"), statements.join("\n"));
console.log("Generated seed: " + groups.length + " groups, " + groups.reduce((total, group) => total + group.w.length, 0) + " words, " + readings.length + " readings, " + readings.reduce((total, reading) => total + reading.q.length, 0) + " questions");
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
