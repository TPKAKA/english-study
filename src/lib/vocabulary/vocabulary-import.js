import { contentError, validateContent } from "../content/content-admin.js";

export const IMPORT_LIMIT = 500;
export const IMPORT_BYTES = 1024 * 1024;
const normalizeWord = value => value.trim().toLowerCase();

export function prepareVocabularyImport({ rows, groupId, mode }, catalog) {
  if (!["skip", "update"].includes(mode)) throw new Error("Hãy chọn cách xử lý từ đã tồn tại.");
  if (!Array.isArray(rows) || !rows.length || rows.length > IMPORT_LIMIT) {
    throw new Error(`Mỗi lần import cần từ 1 đến ${IMPORT_LIMIT} thẻ.`);
  }
  if (new TextEncoder().encode(JSON.stringify(rows)).length > IMPORT_BYTES) throw new Error("Dữ liệu import tối đa 1 MB.");
  if (!catalog.groups.some(group => group.id === groupId)) throw new Error("Hãy chọn nhóm từ hợp lệ.");
  const existing = new Map(catalog.words.map(row => [normalizeWord(row.word), row]));
  const seen = new Set();
  let nextOrder = catalog.words.filter(row => row.group_id === groupId).reduce((max, row) => Math.max(max, row.sort_order + 1), 0);
  const counts = { create: 0, update: 0, skip: 0 };
  const prepared = rows.map((source, index) => {
    try {
      if (!source || typeof source !== "object" || Array.isArray(source) || typeof source.word !== "string") throw new Error("Từ vựng không hợp lệ.");
      const normalized = normalizeWord(source.word);
      if (seen.has(normalized)) throw new Error("Từ bị lặp trong dữ liệu import.");
      seen.add(normalized);
      const old = existing.get(normalized);
      const status = old ? mode === "skip" ? "skip" : "update" : "create";
      for (const field of ["meaning", "ipa", "example"]) {
        if (source[field] !== undefined && typeof source[field] !== "string") throw new Error(`Trường ${field} phải là văn bản.`);
      }
      const row = validateContent("words", {
        word: old?.word || source.word, group_id: groupId, meaning: source.meaning,
        ipa: source.ipa ?? old?.ipa ?? "", example: source.example ?? old?.example ?? "",
        sort_order: old && (status === "skip" || old.group_id === groupId) ? old.sort_order : nextOrder++
      }, old?.word, catalog);
      counts[status]++;
      return { row, status };
    } catch (error) { throw new Error(`Bản ghi ${index + 1}: ${error.message}`); }
  });
  return { prepared, counts };
}

export async function importVocabulary(client, change, catalog) {
  const { prepared } = prepareVocabularyImport(change, catalog);
  let result;
  try {
    result = await client.rpc("import_vocabulary_words", {
      p_rows: prepared.map(item => item.row), p_mode: change.mode
    }).abortSignal(AbortSignal.timeout(30000));
  } catch { throw new Error("Chưa xác nhận được kết quả import. Hãy tải lại danh sách trước khi thử lại."); }
  if (result.error) {
    if (["42883", "PGRST202"].includes(result.error.code)) throw new Error("Cần chạy migration 20261006_vocabulary_import.sql trên Supabase trước khi import.");
    throw new Error(contentError(result.error));
  }
  return result.data;
}
