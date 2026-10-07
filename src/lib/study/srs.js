import { createEmptyCard, fsrs, Rating } from "ts-fsrs";
import { cardId } from "./languages.js";

export const SRS_RATINGS = Object.freeze([
  { rating: Rating.Again, label: "Quên", tone: "again" },
  { rating: Rating.Hard, label: "Khó", tone: "hard" },
  { rating: Rating.Good, label: "Nhớ", tone: "good" },
  { rating: Rating.Easy, label: "Dễ", tone: "easy" }
]);
// Deterministic intervals let offline previews and server calculations agree.
const scheduler = fsrs({ request_retention: 0.9, maximum_interval: 36500, enable_fuzz: false,
  enable_short_term: true, learning_steps: ["1m", "10m"], relearning_steps: ["10m"] });
const fields = ["stability", "difficulty", "elapsed_days", "scheduled_days", "learning_steps", "reps", "lapses", "state"];
const isoDate = value => typeof value === "string" && value.length === 24 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export function restoreSrsCard(value, at = new Date()) {
  if (value == null) return createEmptyCard(at);
  if (typeof value !== "object" || Array.isArray(value) || !isoDate(value.due)
    || (value.last_review != null && !isoDate(value.last_review))) throw new Error("Invalid SRS date");
  for (const field of fields) {
    if (typeof value[field] !== "number" || !Number.isFinite(value[field]) || value[field] < 0 || value[field] > 1000000) throw new Error("Invalid SRS field");
    if (!["stability", "difficulty"].includes(field) && !Number.isInteger(value[field])) throw new Error("Invalid SRS counter");
  }
  if (value.difficulty > 10 || value.state > 3 || value.lapses > value.reps
    || (value.reps > 0 && !value.last_review) || (value.last_review && Date.parse(value.due) < Date.parse(value.last_review))) throw new Error("Invalid SRS card");
  return { ...Object.fromEntries(fields.map(field => [field, value[field]])), due: new Date(value.due),
    ...(value.last_review ? { last_review: new Date(value.last_review) } : {}) };
}

export function serializeSrsCard(card) {
  return { ...Object.fromEntries(fields.map(field => [field, card[field]])), due: card.due.toISOString(),
    ...(card.last_review ? { last_review: card.last_review.toISOString() } : {}) };
}

export function reviewSrsCard(previous, rating, reviewedAt) {
  if (!SRS_RATINGS.some(item => item.rating === rating) || !isoDate(reviewedAt)) throw new Error("Invalid SRS review");
  const at = new Date(reviewedAt), card = restoreSrsCard(previous, at);
  if (card.last_review && card.last_review > at) throw new Error("SRS review predates last review");
  return serializeSrsCard(scheduler.next(card, at, rating).card);
}

export function previewSrs(previous, at) {
  const time = new Date(at), card = restoreSrsCard(previous, time);
  if (card.last_review && card.last_review > time) return [];
  const outcomes = scheduler.repeat(card, time);
  return SRS_RATINGS.map(item => ({ ...item, due: outcomes[item.rating].card.due.toISOString() }));
}

export function selectSrsQueue(content, records, at, groupId = "") {
  const queue = [];
  for (const group of content.groups) {
    if (groupId && group.id !== groupId) continue;
    for (const word of group.w) {
      const id = cardId(word);
      const record = Object.hasOwn(records, id) ? records[id] : null;
      if (!record || Date.parse(record.card.due) <= at) queue.push({ word, groupId: group.id, groupName: group.n, isNew: !record, record });
    }
  }
  return queue.sort((a, b) => Number(a.isNew) - Number(b.isNew) || (a.isNew ? 0 : Date.parse(a.record.card.due) - Date.parse(b.record.card.due)));
}

export function normalizeSrsRecords(rows) {
  const records = {};
  for (const row of rows || []) {
    try {
      if (typeof row?.word !== "string" || !SRS_RATINGS.some(item => item.rating === row.rating) || !isoDate(row.reviewed_at) || row.card == null) continue;
      const card = serializeSrsCard(restoreSrsCard(row.card));
      if (card.reps < 1 || card.last_review !== row.reviewed_at) continue;
      if (row.previous_card != null) restoreSrsCard(row.previous_card);
      Object.defineProperty(records, row.word, { value: { ...row, card }, enumerable: true, configurable: true, writable: true });
    } catch { /* Corrupt cached entries must not crash the remaining lessons. */ }
  }
  return records;
}

export function intervalLabel(due, at) {
  const minutes = Math.max(1, Math.round((Date.parse(due) - at) / 60000));
  if (minutes < 60) return `${minutes} phút`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} giờ`;
  return `${Math.round(minutes / 1440)} ngày`;
}
