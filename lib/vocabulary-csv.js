import Papa from "papaparse";
import { IMPORT_BYTES, IMPORT_LIMIT } from "./vocabulary-import.js";

const FIELDS = ["word", "meaning", "ipa", "example"];
const ALIASES = {
  word: "word", tu: "word", tuvung: "word", term: "word",
  meaning: "meaning", nghia: "meaning", nghiatiengviet: "meaning", definition: "meaning",
  ipa: "ipa", phienam: "ipa", pronunciation: "ipa",
  example: "example", vidu: "example", sentence: "example"
};
const headerName = value => ALIASES[value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[\s_-]/g, "")];

export function parseVocabularyCsv(source, { header = true, delimiter = "" } = {}) {
  if (typeof source !== "string" || !source.trim()) throw new Error("Chưa có dữ liệu import.");
  if (new TextEncoder().encode(source).length > IMPORT_BYTES) throw new Error("File hoặc dữ liệu dán tối đa 1 MB.");
  if (!["", ",", ";", "\t"].includes(delimiter)) throw new Error("Dấu phân cách không hợp lệ.");
  const result = Papa.parse(source, { delimiter, delimitersToGuess: [",", "\t", ";"],
    skipEmptyLines: "greedy", dynamicTyping: false, preview: IMPORT_LIMIT + 2 });
  if (result.errors.length) throw new Error("CSV/TSV không hợp lệ. Kiểm tra dấu phân cách và dấu ngoặc kép.");
  const values = result.data;
  const columns = header ? values.shift().map(headerName) : FIELDS;
  if (header && (!columns.includes("word") || !columns.includes("meaning"))) throw new Error("Dòng tiêu đề cần cột word (Từ) và meaning (Nghĩa).");
  const recognized = columns.filter(Boolean);
  if (new Set(recognized).size !== recognized.length) throw new Error("Dòng tiêu đề có cột bị lặp.");
  if (!values.length || values.length > IMPORT_LIMIT) throw new Error(`Mỗi lần import cần từ 1 đến ${IMPORT_LIMIT} thẻ.`);
  return values.map((cells, index) => {
    if (header ? cells.length !== columns.length : cells.length < 2 || cells.length > 4) throw new Error(`Bản ghi ${index + 1}: số cột không khớp.`);
    const row = {};
    cells.forEach((value, i) => { if (columns[i]) row[columns[i]] = value; });
    return row;
  });
}
