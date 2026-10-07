import { readCardRows } from "./card-storage.js";

export function createSrsData(client) {
  return {
    async loadSrs(owner) {
      const rows = [];
      for (let offset = 0; ; offset += 500) {
        const data = await readCardRows(client, "vocabulary_srs", "card,rating,reviewed_at", owner, offset);
        rows.push(...data);
        if (data.length < 500) return rows;
      }
    },
    async saveSrs(owner, rows) {
      const result = await client.rpc("save_vocabulary_srs", { p_rows: rows }).abortSignal(AbortSignal.timeout(15000));
      if (result.error) throw result.error;
    }
  };
}
