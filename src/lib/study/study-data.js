import { fetchCatalog } from "../content/content-admin.js";

export function createStudyData(client) {
  return {
    getCatalog: () => fetchCatalog(client),
    async loadProgress(owner) {
      const [progress, history] = await Promise.all([
        client.from("vocabulary_progress").select("word,is_known,updated_at").eq("user_id", owner).abortSignal(AbortSignal.timeout(15000)),
        client.from("reading_attempts").select("id,reading_id,answers,score,total,completed_at").eq("user_id", owner).order("completed_at", { ascending: false }).limit(30).abortSignal(AbortSignal.timeout(15000))
      ]);
      if (progress.error) throw progress.error;
      if (history.error) throw history.error;
      return { words: progress.data, attempts: history.data };
    },
    async saveWords(owner, rows) {
      const { error } = await client.from("vocabulary_progress").upsert(rows.map(row => ({ ...row, user_id: owner })), { onConflict: "user_id,word" }).abortSignal(AbortSignal.timeout(15000));
      if (error) throw error;
    },
    async saveAttempts(owner, rows) {
      const { error } = await client.from("reading_attempts").upsert(rows.map(row => ({ ...row, user_id: owner })), { onConflict: "id", ignoreDuplicates: true }).abortSignal(AbortSignal.timeout(15000));
      if (error) throw error;
    }
  };
}
