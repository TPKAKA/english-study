import { fetchCatalog } from "../content/content-admin.js";
import { missingCardColumn, readAllCardRows } from "./card-storage.js";

export function createStudyData(client) {
  return {
    getCatalog: () => fetchCatalog(client),
    async loadProgress(owner) {
      const [progress, history] = await Promise.all([
        readAllCardRows(client, "vocabulary_progress", "is_known,updated_at", owner).then(data => ({ data })),
        client.from("reading_attempts").select("id,reading_id,answers,score,total,completed_at").eq("user_id", owner).order("completed_at", { ascending: false }).limit(30).abortSignal(AbortSignal.timeout(15000))
      ]);
      if (progress.error) throw progress.error;
      if (history.error) throw history.error;
      return { words: progress.data, attempts: history.data };
    },
    async saveWords(owner, rows) {
      let result = await client.from("vocabulary_progress").upsert(rows.map(({ word, ...row }) => ({ ...row, card_id: word, user_id: owner })), { onConflict: "user_id,card_id" }).abortSignal(AbortSignal.timeout(15000));
      if (missingCardColumn(result.error)) result = await client.from("vocabulary_progress").upsert(rows.map(row => ({ ...row, user_id: owner })), { onConflict: "user_id,word" }).abortSignal(AbortSignal.timeout(15000));
      if (result.error) throw result.error;
    },
    async saveAttempts(owner, rows) {
      const { error } = await client.from("reading_attempts").upsert(rows.map(row => ({ ...row, user_id: owner })), { onConflict: "id", ignoreDuplicates: true }).abortSignal(AbortSignal.timeout(15000));
      if (error) throw error;
    }
  };
}
