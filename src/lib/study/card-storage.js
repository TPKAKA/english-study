export const missingCardColumn = error => ["42703", "PGRST204"].includes(error?.code);

// Legacy API/cache rows call this field `word`; its value is now the immutable card ID.
export async function readCardRows(client, table, fields, owner, offset = 0, limit = 500) {
  const query = column => client.from(table).select(`word:${column},${fields}`).eq("user_id", owner)
    .order(column, { ascending: true }).range(offset, offset + limit - 1).abortSignal(AbortSignal.timeout(15000));
  let result = await query("card_id");
  if (missingCardColumn(result.error)) result = await client.from(table).select(`word,${fields}`).eq("user_id", owner)
    .order("word", { ascending: true }).range(offset, offset + limit - 1).abortSignal(AbortSignal.timeout(15000));
  if (result.error) throw result.error;
  return result.data;
}

export async function readAllCardRows(client, table, fields, owner) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const batch = await readCardRows(client, table, fields, owner, offset);
    rows.push(...batch);
    if (batch.length < 500) return rows;
  }
}
