"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, Eye, LoaderCircle, Search, Square, Upload } from "lucide-react";
import ContentDialog from "../ui/content-dialog.js";
import { decodeVocabularyFile, parseVocabularyCsv } from "../../lib/vocabulary/vocabulary-csv.js";
import { IMPORT_BYTES, prepareVocabularyImport } from "../../lib/vocabulary/vocabulary-import.js";
import { applyImportIpa, IPA_BATCH_SIZE, ipaCandidateLabel, missingImportIpa } from "../../lib/vocabulary/ipa-review.js";

const STATUS = { create: "Thêm mới", update: "Cập nhật", skip: "Bỏ qua" };

export default function VocabularyImporter({ catalog, language, initialGroup, busy, onSave, onClose, onSuggestIpa }) {
  const [groupId, setGroupId] = useState(() => catalog.groups.some(group => group.id === initialGroup) ? initialGroup : catalog.groups[0]?.id || "");
  const [source, setSource] = useState("");
  const [fileName, setFileName] = useState("");
  const [header, setHeader] = useState(true);
  const [delimiter, setDelimiter] = useState("");
  const [mode, setMode] = useState("skip");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [suggestions, setSuggestions] = useState({});
  const [choices, setChoices] = useState({});
  const [looking, setLooking] = useState(false);
  const [ipaMessage, setIpaMessage] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const lookupVersion = useRef(0);
  useEffect(() => {
    setLooking(false); setSuggestions({}); setChoices({}); setIpaMessage("");
    return () => { lookupVersion.current++; };
  }, [catalog]);
  const fileInput = useRef(null);
  const locked = busy || working;
  const preview = useMemo(() => {
    if (!rows) return null;
    try { return prepareVocabularyImport({ rows, groupId, mode }, catalog); }
    catch (error) { return { error: error.message }; }
  }, [rows, groupId, mode, catalog]);
  const missing = useMemo(() => missingImportIpa(preview, catalog), [preview, catalog]);
  const missingKeys = new Set(missing.map(word => word.trim().toLowerCase()));
  const selectedCount = Object.entries(choices).filter(([word, choice]) => missingKeys.has(word) && choice !== "" && suggestions[word]?.candidates?.[Number(choice)]).length;
  const approvedIpa = () => new Map(Object.entries(choices).filter(([, choice]) => choice !== "").map(([word, choice]) => [word, suggestions[word]?.candidates?.[Number(choice)]?.ipa]));

  function resetSuggestions() {
    lookupVersion.current++;
    setLooking(false); setSuggestions({}); setChoices({}); setIpaMessage("");
  }
  function invalidate() { resetSuggestions(); setRows(null); setError(""); }
  function inspect() {
    resetSuggestions();
    setError("");
    try { setRows(parseVocabularyCsv(source, { header, delimiter })); }
    catch (error) { setRows(null); setError(error.message); }
  }
  async function suggestIpa() {
    if (locked || looking) return;
    const words = missing.filter(word => suggestions[word.trim().toLowerCase()]?.status !== "found");
    if (!words.length) return;
    const version = ++lookupVersion.current;
    setLooking(true); setError(""); setIpaMessage(""); setProgress({ done: 0, total: words.length });
    try {
      for (let offset = 0; offset < words.length; offset += IPA_BATCH_SIZE) {
        const batch = words.slice(offset, offset + IPA_BATCH_SIZE);
        const response = await onSuggestIpa(batch);
        if (version !== lookupVersion.current) return;
        if (!response.ok) { setError(response.error); return; }
        const results = new Map((response.results || []).map(result => [result.word.trim().toLowerCase(), result]));
        setSuggestions(previous => ({ ...previous, ...Object.fromEntries(batch.map(word => {
          const key = word.trim().toLowerCase();
          return [key, results.get(key) || { status: "unavailable", candidates: [] }];
        })) }));
        setProgress({ done: offset + batch.length, total: words.length });
      }
      setIpaMessage("Đã tra xong IPA.");
    } catch {
      if (version === lookupVersion.current) setError("Chưa tra được IPA. Hãy thử lại hoặc nhập phiên âm trong file.");
    } finally { if (version === lookupVersion.current) setLooking(false); }
  }
  function applySuggestions() {
    if (locked || looking || !selectedCount) return;
    const next = applyImportIpa(rows, preview, catalog, approvedIpa());
    setIpaMessage(`Đã áp dụng ${next.filter((row, index) => row !== rows[index]).length} phiên âm vào bản xem trước.`);
    setRows(next); setChoices({});
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
        const { vocabularyXlsxToCsv } = await import("../../lib/vocabulary/vocabulary-xlsx.js");
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
    if (locked || looking || !preview || preview.error) return;
    setWorking(true);
    setError("");
    try {
      const result = await onSave({ entity: "words", action: "import", rows: applyImportIpa(rows, preview, catalog, approvedIpa()), groupId, mode });
      if (result.ok) onClose(); else setError(result.error);
    } catch { setError("Chưa xác nhận được kết quả import. Hãy tải lại danh sách trước khi thử lại."); }
    finally { setWorking(false); }
  }

  return <ContentDialog title="Import thẻ" busy={locked} onClose={onClose}>
    <form onSubmit={submit}>
      <fieldset className="editor-fields" disabled={locked}>
        <label className="editor-field"><span>Nhóm từ</span><select required value={groupId} onChange={event => { resetSuggestions(); setGroupId(event.target.value); }}>
          <option value="" disabled>Chọn nhóm</option>{catalog.groups.map(group => <option key={group.id} value={group.id}>{group.title}</option>)}
        </select></label>
        <label className="editor-field"><span>Từ đã tồn tại</span><select value={mode} onChange={event => { resetSuggestions(); setMode(event.target.value); }}>
          <option value="skip">Bỏ qua</option><option value="update">Cập nhật</option>
        </select></label>
        <div className="import-file-tools field-wide">
          <input ref={fileInput} type="file" accept=".xlsx,.csv,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/tab-separated-values" hidden onChange={event => void readFile(event)} />
          <button type="button" onClick={() => fileInput.current.click()}><Upload />Chọn file</button>
          <a className="template-link" href={language.code === "en" ? "/templates/vocabulary.xlsx" : `/api/vocabulary-template?language=${encodeURIComponent(language.code)}&mode=${language.pronunciation_mode}&format=xlsx`} download={`vocabulary-${language.code}.xlsx`}><Download />Mẫu Excel</a>
          <a className="template-link" href={language.code === "en" ? "/templates/vocabulary.csv" : `/api/vocabulary-template?language=${encodeURIComponent(language.code)}&mode=${language.pronunciation_mode}`} download={`vocabulary-${language.code}.csv`}><Download />Mẫu CSV</a>
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
        {language.code === "en" && <div className="import-ipa-tools">
          <button type="button" disabled={locked || looking || !missing.some(word => suggestions[word.trim().toLowerCase()]?.status !== "found")} onClick={() => void suggestIpa()}>
            {looking ? <LoaderCircle className="spinning" /> : <Search />}Gợi ý IPA ({missing.length})
          </button>
          {looking && <button type="button" onClick={() => { lookupVersion.current++; setLooking(false); setIpaMessage("Đã dừng tra IPA."); }}><Square />Dừng tra</button>}
          <button type="button" disabled={locked || looking || !selectedCount} onClick={applySuggestions}><Check />Áp dụng {selectedCount} gợi ý</button>
        </div>}
        <p className="ipa-status muted" role="status">{looking ? `Đang tra IPA: ${progress.done} / ${progress.total}` : ipaMessage}</p>
        <div className="import-table-scroll" tabIndex={0} aria-label="Danh sách thẻ xem trước"><table>
          <thead><tr><th>Từ / {language.pronunciation_mode === "ipa" ? "IPA" : "Cách đọc"}</th><th>Nghĩa</th><th>Trạng thái</th></tr></thead>
          <tbody>{preview.prepared.map(({ row, status }) => {
            const key = row.word.trim().toLowerCase();
            const result = missingKeys.has(key) ? suggestions[key] : null;
            return <tr key={row.word}>
              <td><strong lang={language.code}>{row.word}</strong><span className="ipa-text">{row.ipa || row.reading || row.romanization}</span>
                {result?.candidates?.length > 0 && <label className="editor-field import-ipa-choice"><span>Gợi ý IPA</span>
                  <select aria-label={`Gợi ý IPA: ${row.word}`} disabled={locked || looking} value={Object.hasOwn(choices, key) ? choices[key] : ""} onChange={event => setChoices(previous => ({ ...previous, [key]: event.target.value }))}>
                    <option value="">Không dùng gợi ý</option>{result.candidates.map((candidate, index) => <option key={index} value={index}>{ipaCandidateLabel(candidate)}</option>)}
                  </select>
                </label>}
                {result?.status === "not-found" && <small className="muted">Chưa có phiên âm</small>}
                {result?.status === "unavailable" && <small className="error-text">Chưa tra được</small>}
              </td><td>{row.meaning}</td><td>{STATUS[status]}</td>
            </tr>;
          })}</tbody>
        </table></div>
        {Object.values(suggestions).some(result => result.status === "found") && <small className="muted ipa-source"><a href="https://dictionaryapi.dev/" target="_blank" rel="noreferrer">Dictionary API</a> · Bộ từ mẫu UK</small>}
      </section>}
      <p className="editor-error error-text" role="alert">{error || preview?.error}</p>
      <footer className="dialog-actions"><button type="button" disabled={locked} onClick={onClose}>Hủy</button>
        <button type="submit" className="primary-button" disabled={locked || looking || !preview?.prepared}><Upload />{locked ? "Đang xử lý…" : "Import thẻ"}</button>
      </footer>
    </form>
  </ContentDialog>;
}
