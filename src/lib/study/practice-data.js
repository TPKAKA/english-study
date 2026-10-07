export function createPracticeData(client) {
  return {
    async loadPractice(owner) {
      const rows = [];
      for (let offset = 0; ; offset += 500) {
        const result = await client.from("vocabulary_practice").select("word,mode,needs_retry,last_answer,answered_at")
          .eq("user_id", owner).order("word", { ascending: true }).range(offset, offset + 499).abortSignal(AbortSignal.timeout(15000));
        if (result.error) throw result.error;
        rows.push(...result.data);
        if (result.data.length < 500) return rows;
      }
    },
    async savePractice(owner, rows) {
      const result = await client.rpc("save_vocabulary_practice", { p_rows: rows }).abortSignal(AbortSignal.timeout(15000));
      if (result.error) throw result.error;
    }
  };
}
