import Papa from "papaparse";
import { strToU8, zipSync } from "fflate";
import { KOREAN_CONTENT } from "../../data/korean-content.js";

export function vocabularyTemplateRows(code, mode = "reading") {
  const header = mode === "ipa" ? ["word", "meaning", "ipa", "example", "cloze_text", "cloze_answer"] :
    ["word", "meaning", "reading", "romanization", "example", "cloze_text", "cloze_answer"];
  if (code !== "ko") return [header];
  return [header, ...KOREAN_CONTENT.groups[0].w.slice(2, 4).map(card => {
    const meta = card[4];
    return mode === "ipa" ? [card[0], card[1], card[3], card[2], meta.cloze_text, meta.cloze_answer] :
      [card[0], card[1], meta.reading, meta.romanization, card[2], meta.cloze_text, meta.cloze_answer];
  })];
}

export const templateCsv = rows => Papa.unparse(rows, { newline: "\r\n" });
const xml = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]);

export function templateXlsx(rows) {
  const sheet = rows.map((row, index) => `<row r="${index + 1}">${row.map((value, col) => `<c r="${String.fromCharCode(65 + col)}${index + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`).join("")}</row>`).join("");
  // Literal inline strings preserve Unicode and never interpret values as formulas.
  const files = {
    "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "_rels/.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Vocabulary" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="24" customWidth="1"/><col min="2" max="4" width="24" customWidth="1"/><col min="5" max="7" width="40" customWidth="1"/></cols><sheetData>${sheet}</sheetData></worksheet>`
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, body]) => [name, strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + body)])));
}
