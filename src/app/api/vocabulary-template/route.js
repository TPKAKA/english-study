import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { templateCsv, templateXlsx, vocabularyTemplateRows } from "../../../lib/vocabulary/vocabulary-template.js";

export async function GET(request) {
  const params = new URL(request?.url || "http://localhost/api/vocabulary-template").searchParams;
  const code = params.get("language") || "en", format = params.get("format") || "csv";
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(code) || code.length > 35 || !["csv", "xlsx"].includes(format)) return new Response(null, { status: 400 });
  const rows = vocabularyTemplateRows(code, params.get("mode") === "ipa" ? "ipa" : "reading");
  if (format === "xlsx") {
    const bytes = code === "en" ? await readFile(join(process.cwd(), "public/templates/vocabulary.xlsx")) : templateXlsx(rows);
    return new Response(bytes, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="vocabulary-${code}.xlsx"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }
  const source = code === "en" ? await readFile(join(process.cwd(), "public/templates/vocabulary.csv"), "utf8") : templateCsv(rows);
  const csv = source.replace(/^\uFEFF/, "").replace(/\r\n|\r|\n/g, "\r\n");
  // Excel can ignore a UTF-8 BOM when a sep= hint is present. Use UTF-16 for this download.
  const bytes = Buffer.from(`\uFEFFsep=,\r\n${csv}`, "utf16le");
  return new Response(bytes, {
    headers: {
      "Content-Type": "text/csv; charset=utf-16le",
      "Content-Disposition": `attachment; filename="${code === "en" ? "vocabulary-excel" : "vocabulary-" + code}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
