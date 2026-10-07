import Papa from "papaparse";
import { unzipSync } from "fflate";
import { Parser } from "saxen";
import { readSheet } from "read-excel-file/universal";
import { IMPORT_BYTES, IMPORT_LIMIT } from "./vocabulary-import.js";

const SHEET_ROWS = 2000;
const SHEET_COLUMNS = 32;
const WORKBOOK_BYTES = 8 * 1024 * 1024;
const WORKBOOK_TOO_LARGE = "File Excel giải nén quá lớn. Chỉ giữ trang tính chứa thẻ cần import.";
const INVALID_FILE = "Không đọc được file Excel. Chọn file .xlsx hợp lệ, không có mật khẩu bảo vệ.";
const SHEET_TOO_LARGE = "Trang tính quá lớn. Giữ dữ liệu trong 2000 dòng đầu và 32 cột đầu, tối đa 500 thẻ.";

function checkWorkbook(bytes) {
  let expanded = 0;
  let entries = 0;
  // Check ZIP sizes before extraction and sparse cell addresses before the reader allocates rows.
  unzipSync(bytes, { filter(file) {
    expanded += file.originalSize;
    if (++entries > 256 || expanded > WORKBOOK_BYTES) throw new Error(WORKBOOK_TOO_LARGE);
    return false;
  } });
  const sheets = unzipSync(bytes, { filter: file => file.name.endsWith(".xml") });
  for (const xml of Object.values(sheets)) {
    let rowCount = 0;
    let cellCount = 0;
    let worksheet = false;
    const parser = new Parser();
    parser.on("error", () => { throw new Error(INVALID_FILE); });
    parser.on("openTag", (name, attributes) => {
      const tag = name.split(":").pop();
      if (tag === "worksheet") worksheet = true;
      if (!worksheet) return;
      if (tag === "row") {
        cellCount = 0;
        if (++rowCount > SHEET_ROWS || Number(attributes().r) > SHEET_ROWS) throw new Error(SHEET_TOO_LARGE);
      } else if (tag === "c") {
        if (++cellCount > SHEET_COLUMNS) throw new Error(SHEET_TOO_LARGE);
        const address = /^([A-Z]+)(\d+)$/.exec(attributes().r || "");
        if (!address) throw new Error(INVALID_FILE);
        const column = [...address[1]].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
        if (column > SHEET_COLUMNS || Number(address[2]) > SHEET_ROWS) throw new Error(SHEET_TOO_LARGE);
      }
    });
    parser.parse(new TextDecoder("utf-8", { fatal: true }).decode(xml));
  }
}

export function vocabularySheetToCsv(sheet) {
  const rows = sheet.filter(row => row.some(value => value != null && String(value).trim()));
  if (!rows.length) throw new Error("Chưa có dữ liệu import.");
  if (rows.length > IMPORT_LIMIT + 1) throw new Error(`Mỗi lần import tối đa ${IMPORT_LIMIT} thẻ.`);
  const width = Math.max(...rows.map(row => row.length));
  if (width > SHEET_COLUMNS) throw new Error(SHEET_TOO_LARGE);
  const cells = rows.map((row, rowIndex) => Array.from({ length: width }, (_, column) => {
    const value = row[column];
    if (value == null) return "";
    if (typeof value !== "string") throw new Error(`Dòng ${rowIndex + 1}, cột ${column + 1}: cần dữ liệu văn bản, không phải số, ngày hoặc giá trị logic.`);
    return value;
  }));
  const csv = Papa.unparse(cells, { delimiter: ",", newline: "\r\n" });
  if (new TextEncoder().encode(csv).length > IMPORT_BYTES) throw new Error("Dữ liệu import tối đa 1 MB.");
  return csv;
}

export async function vocabularyXlsxToCsv(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength > IMPORT_BYTES) throw new Error("File tối đa 1 MB.");
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4B) throw new Error(INVALID_FILE);
  try { checkWorkbook(bytes); }
  catch (error) {
    throw new Error([SHEET_TOO_LARGE, WORKBOOK_TOO_LARGE].includes(error.message) ? error.message : INVALID_FILE);
  }
  let sheet;
  try { sheet = await readSheet(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), 1, { trim: false }); }
  catch { throw new Error(INVALID_FILE); }
  return vocabularySheetToCsv(sheet);
}
