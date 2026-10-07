export function createSrsData(client) {
  return {
    async loadSrs(owner) {
      const rows = [];
      for (let offset = 0; ; offset += 500) {
        const result = await client.from("vocabulary_srs").select("word,card,rating,reviewed_at")
          .eq("user_id", owner).order("word", { ascending: true }).range(offset, offset + 499).abortSignal(AbortSignal.timeout(15000));
        if (result.error) throw result.error;
        rows.push(...result.data);
        if (result.data.length < 500) return rows;
      }
    },
    async saveSrs(owner, rows) {
      const result = await client.rpc("save_vocabulary_srs", { p_rows: rows }).abortSignal(AbortSignal.timeout(15000));
      if (result.error) throw result.error;
    }
  };
}
