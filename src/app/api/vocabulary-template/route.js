import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function GET() {
  const source = await readFile(join(process.cwd(), "public/templates/vocabulary.csv"), "utf8");
  const csv = source.replace(/^\uFEFF/, "").replace(/\r\n|\r|\n/g, "\r\n");
  // Excel can ignore a UTF-8 BOM when a sep= hint is present. Use UTF-16 for this download.
  const bytes = Buffer.from(`\uFEFFsep=,\r\n${csv}`, "utf16le");
  return new Response(bytes, {
    headers: {
      "Content-Type": "text/csv; charset=utf-16le",
      "Content-Disposition": 'attachment; filename="vocabulary-excel.csv"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
