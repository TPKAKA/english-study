"use client";

import { useMemo, useRef, useState } from "react";
import { Download, Eye, Upload } from "lucide-react";
import ContentDialog from "./content-dialog.js";
import { decodeVocabularyFile, parseVocabularyCsv } from "../lib/vocabulary-csv.js";
import { IMPORT_BYTES, prepareVocabularyImport } from "../lib/vocabulary-import.js";

const STATUS = { create: "Thêm mới", update: "Cập nhật", skip: "Bỏ qua" };

export default function VocabularyImporter({ catalog, initialGroup, busy, onSave, onClose }) {
  const [groupId, setGroupId] = useState(() => catalog.groups.some(group => group.id === initialGroup) ? initialGroup : catalog.groups[0]?.id || "");
  const [source, setSource] = useState("");
  const [fileName, setFileName] = useState("");
  const [header, setHeader] = useState(true);
  const [delimiter, setDelimiter] = useState("");
  const [mode, setMode] = useState("skip");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const fileInput = useRef(null);
  const locked = busy || working;
  const preview = useMemo(() => {
    if (!rows) return null;
    try { return prepareVocabularyImport({ rows, groupId, mode }, catalog); }
    catch (error) { return { error: error.message }; }
  }, [rows, groupId, mode, catalog]);

  function invalidate() { setRows(null); setError(""); }
  function inspect() {
    setError("");
    try { setRows(parseVocabularyCsv(source, { header, delimiter })); }
    catch (error) { setRows(null); setError(error.message); }
  }
  async function readFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || locked) return;
    invalidate();
    setSource("");
    setFileName("");
    if (file.size > IMPORT_BYTES) { setError("File tối đa 1 MB."); return; }
    if (!/\.(xlsx|csv|tsv)$/i.test(file.name)) { setError("Chọn file .xlsx, .csv hoặc .tsv."); return; }
    setWorking(true);
    try {
      const buffer = await file.arrayBuffer();
      if (/\.xlsx$/i.test(file.name)) {
        const { vocabularyXlsxToCsv } = await import("../lib/vocabulary-xlsx.js");
        setSource(await vocabularyXlsxToCsv(buffer));
        setDelimiter(",");
      } else {
        setSource(decodeVocabularyFile(buffer));
        setDelimiter("");
      }
      setFileName(file.name);
    }
    catch (error) { setError(error.message || "Không đọc được file. Hãy chọn lại file .xlsx, .csv hoặc .tsv."); }
    finally { setWorking(false); }
  }
  async function submit(event) {
    event.preventDefault();
    if (locked || !preview || preview.error) return;
    setWorking(true);
    setError("");
    try {
      const result = await onSave({ entity: "words", action: "import", rows, groupId, mode });
      if (result.ok) onClose(); else setError(result.error);
    } catch { setError("Chưa xác nhận được kết quả import. Hãy tải lại danh sách trước khi thử lại."); }
    finally { setWorking(false); }
  }

  return <ContentDialog title="Import thẻ" busy={locked} onClose={onClose}>
    <form onSubmit={submit}>
      <fieldset className="editor-fields" disabled={locked}>
        <label className="editor-field"><span>Nhóm từ</span><select required value={groupId} onChange={event => setGroupId(event.target.value)}>
          <option value="" disabled>Chọn nhóm</option>{catalog.groups.map(group => <option key={group.id} value={group.id}>{group.title}</option>)}
        </select></label>
        <label className="editor-field"><span>Từ đã tồn tại</span><select value={mode} onChange={event => setMode(event.target.value)}>
          <option value="skip">Bỏ qua</option><option value="update">Cập nhật</option>
        </select></label>
        <div className="import-file-tools field-wide">
          <input ref={fileInput} type="file" accept=".xlsx,.csv,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/tab-separated-values" hidden onChange={event => void readFile(event)} />
          <button type="button" onClick={() => fileInput.current.click()}><Upload />Chọn file</button>
          <a className="template-link" href="/templates/vocabulary.xlsx" download="vocabulary.xlsx"><Download />Mẫu Excel</a>
          <a className="template-link" href="/templates/vocabulary.csv" download="vocabulary.csv"><Download />Mẫu CSV</a>
          {fileName && <span className="muted">{fileName}</span>}
        </div>
        <label className="editor-field field-wide"><span>Dữ liệu</span><textarea rows={6} value={source}
          onChange={event => { setSource(event.target.value); setFileName(""); invalidate(); }} /></label>
        <label className="editor-field"><span>Dấu phân cách</span><select value={delimiter} onChange={event => { setDelimiter(event.target.value); invalidate(); }}>
          <option value="">Tự nhận diện</option><option value=",">Dấu phẩy</option><option value=";">Dấu chấm phẩy</option><option value={"\t"}>Tab</option>
        </select></label>
        <label className="checkbox-label import-header"><input type="checkbox" checked={header} onChange={event => { setHeader(event.target.checked); invalidate(); }} />Có dòng tiêu đề</label>
        <div className="field-wide"><button type="button" disabled={!source.trim()} onClick={inspect}><Eye />Xem trước</button></div>
      </fieldset>
      {preview?.prepared && <section className="import-preview" aria-label="Thẻ sẽ import">
        <p className="import-counts" role="status">{preview.counts.create} thêm mới · {preview.counts.update} cập nhật · {preview.counts.skip} bỏ qua</p>
        <div className="import-table-scroll" tabIndex={0} aria-label="Danh sách thẻ xem trước"><table>
          <thead><tr><th>Từ / IPA</th><th>Nghĩa</th><th>Trạng thái</th></tr></thead>
          <tbody>{preview.prepared.map(({ row, status }) => <tr key={row.word}>
            <td><strong>{row.word}</strong><span className="ipa-text">{row.ipa}</span></td><td>{row.meaning}</td><td>{STATUS[status]}</td>
          </tr>)}</tbody>
        </table></div>
      </section>}
      <p className="editor-error error-text" role="alert">{error || preview?.error}</p>
      <footer className="dialog-actions"><button type="button" disabled={locked} onClick={onClose}>Hủy</button>
        <button type="submit" className="primary-button" disabled={locked || !preview?.prepared}><Upload />{locked ? "Đang xử lý…" : "Import thẻ"}</button>
      </footer>
    </form>
  </ContentDialog>;
}
