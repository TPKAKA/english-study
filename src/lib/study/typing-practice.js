import { cardId, cardMeta } from "./languages.js";

export const PRACTICE_MODES = Object.freeze([
  { id: "meaning", label: "Xem nghĩa" },
  { id: "listening", label: "Nghe và viết" },
  { id: "cloze", label: "Điền từ" }
]);
export const MAX_PRACTICE_ANSWER = 200;
const validMode = mode => PRACTICE_MODES.some(item => item.id === mode);
const isoDate = value => typeof value === "string" && value.length === 24 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export function normalizeEnglishAnswer(value) {
  return value.normalize("NFKC").replace(/[‘’]/g, "'").replace(/[‐‑–]/g, "-").trim().replace(/\s+/g, " ").toLowerCase();
}

export function makePracticeQuestion(word, mode) {
  if (!validMode(mode) || !Array.isArray(word) || typeof word[0] !== "string" || !word[0].trim()) return null;
  if (mode !== "cloze") return { mode, expected: word[0], prompt: mode === "meaning" ? word[1] : "" };
  const metadata = cardMeta(word);
  if (metadata.cloze_text && metadata.cloze_answer) return { mode, expected: metadata.cloze_answer, prompt: metadata.cloze_text };
  if (typeof word[2] !== "string" || !word[2].trim()) return null;
  const literal = word[0].trim().split(/\s+/).map(part => [...part].map(char => {
    if (/[‘’']/.test(char)) return "['‘’]";
    if (/[-‐‑–]/.test(char)) return "[-‐‑–]";
    return char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("")).join("\\s+");
  // Whole-word literal matches only: do not guess inflections or remove part of another word.
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${literal}(?![\\p{L}\\p{N}_])`, "giu");
  const matches = [...word[2].matchAll(pattern)];
  if (!matches.length) return null;
  return { mode, expected: matches[0][0], prompt: word[2].replace(pattern, "_____") };
}

export function gradePracticeAnswer(word, mode, answer) {
  const question = makePracticeQuestion(word, mode);
  if (!question || typeof answer !== "string" || answer.length > MAX_PRACTICE_ANSWER) return null;
  const normalized = normalizeEnglishAnswer(answer);
  return { correct: !!normalized && normalized === normalizeEnglishAnswer(question.expected), expected: question.expected };
}

export function selectPracticeQueue(content, records, mode, groupId = "", onlyMistakes = false) {
  const queue = [];
  for (const group of content.groups) {
    if (groupId && group.id !== groupId) continue;
    for (const word of group.w) {
      const id = cardId(word);
      if (onlyMistakes && (!Object.hasOwn(records, id) || !records[id].needs_retry)) continue;
      const question = makePracticeQuestion(word, mode);
      if (question) queue.push({ word, groupId: group.id, groupName: group.n, ...question });
    }
  }
  return queue;
}

export function normalizePracticeRecords(rows) {
  const records = {};
  for (const row of rows || []) {
    if (typeof row?.word !== "string" || !validMode(row.mode) || typeof row.needs_retry !== "boolean"
      || typeof row.last_answer !== "string" || row.last_answer.length > MAX_PRACTICE_ANSWER || !isoDate(row.answered_at)) continue;
    const value = { word: row.word, mode: row.mode, needs_retry: row.needs_retry, last_answer: row.last_answer, answered_at: row.answered_at };
    Object.defineProperty(records, row.word, { value, enumerable: true, configurable: true, writable: true });
  }
  return records;
}
