import { readCardRows } from "./card-storage.js";

export function createPracticeData(client) {
  return {
    async loadPractice(owner) {
      const rows = [];
      for (let offset = 0; ; offset += 500) {
        const data = await readCardRows(client, "vocabulary_practice", "mode,needs_retry,last_answer,answered_at", owner, offset);
        rows.push(...data);
        if (data.length < 500) return rows;
      }
    },
    async savePractice(owner, rows) {
      const result = await client.rpc("save_vocabulary_practice", { p_rows: rows }).abortSignal(AbortSignal.timeout(15000));
      if (result.error) throw result.error;
    }
  };
}
