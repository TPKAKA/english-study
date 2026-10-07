"use client";

import { useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Pencil, Plus, RefreshCw, Save, Search, Trash2, Upload, UserRound, X } from "lucide-react";
import Modal from "../ui/content-dialog.js";
import VocabularyImporter from "./vocabulary-importer.js";
import IpaSuggestion from "./ipa-suggestion.js";
import { cardId } from "../../lib/study/languages.js";
import { multilingualCatalog } from "../../lib/content/content-admin.js";

const TYPES = { words: "Từ vựng", groups: "Nhóm từ", readings: "Bài đọc", languages: "Ngôn ngữ" };
const rowKey = (entity, row) => entity === "words" ? cardId(row) : entity === "languages" ? row.code : row.id;
const PAGE_SIZE = 20;
const newQuestion = () => ({ prompt: "", options: ["", "", "", ""], answer_index: -1, explanation: "" });

function Tool({ label, children, ...props }) {
  return <button type="button" className="icon-button" title={label} aria-label={label} {...props}>{children}</button>;
}

function Field({ label, multiline = false, wide = false, ...props }) {
  return <label className={"editor-field" + (wide ? " field-wide" : "")}><span>{label}</span>
    {multiline ? <textarea {...props} /> : <input {...props} />}
  </label>;
}

function Editor({ entity, row, catalog, language, initialGroup, busy, onSave, onClose, onSuggestIpa }) {
  const upgraded = multilingualCatalog(catalog);
  const groups = catalog.groups.filter(group => (group.language_code || "en") === language.code);
  const [draft, setDraft] = useState(() => {
    if (row) return entity === "readings" ? { ...row, questions: catalog.questions.filter(question => question.reading_id === row.id)
      .map(question => ({ ...question, options: question.options.slice() })) } : { ...row };
    const nextOrder = list => list.reduce((max, item) => Math.max(max, item.sort_order + 1), 0);
    if (entity === "words") {
      const group_id = groups.some(group => group.id === initialGroup) ? initialGroup : groups[0]?.id || "";
      return { ...(upgraded ? { id: crypto.randomUUID() } : {}), word: "", ipa: "", reading: "", romanization: "", cloze_text: "", cloze_answer: "", group_id, meaning: "", example: "", sort_order: nextOrder(catalog.words.filter(word => word.group_id === group_id)) };
    }
    const id = crypto.randomUUID();
    if (entity === "languages") return { code: "", name: "", speech_locale: "", pronunciation_mode: "reading", sort_order: nextOrder(catalog.languages || []) };
    if (entity === "groups") return { id, title: "", language_code: language.code, sort_order: nextOrder(groups) };
    return { id, title: "", language_code: language.code, time_label: "", passage: "", sort_order: nextOrder(catalog.readings), questions: [newQuestion()] };
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const locked = busy || submitting;
  const set = (name, value) => setDraft(previous => ({ ...previous, [name]: value }));
  const change = name => event => set(name, event.target.value);
  const key = row ? rowKey(entity, row) : undefined;

  function updateQuestion(index, changes) {
    setDraft(previous => ({ ...previous, questions: previous.questions.map((question, i) => i === index ? { ...question, ...changes } : question) }));
  }
  function removeOption(question, index, optionIndex) {
    updateQuestion(index, { options: question.options.filter((_, i) => i !== optionIndex),
      answer_index: question.answer_index === optionIndex ? -1 : question.answer_index > optionIndex ? question.answer_index - 1 : question.answer_index });
  }
  function moveQuestion(index, delta) {
    const questions = draft.questions.slice();
    [questions[index], questions[index + delta]] = [questions[index + delta], questions[index]];
    set("questions", questions);
  }
  async function submit(event) {
    event.preventDefault();
    if (locked) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await onSave({ entity, action: row ? "update" : "create", key, draft });
      if (!result.ok) setError(result.error);
      else onClose();
    } catch { setError("Không lưu được thay đổi. Vui lòng thử lại."); }
    finally { setSubmitting(false); }
  }

  return <Modal title={`${row ? "Sửa" : "Thêm"} ${TYPES[entity].toLocaleLowerCase("vi")}`} busy={locked} onClose={onClose}>
    <form onSubmit={submit}>
      <fieldset className="editor-fields" disabled={locked}>
        {entity === "words" ? <>
          <Field label="Từ / cụm từ" lang={language.code} required maxLength={200} value={draft.word} readOnly={!!row && !upgraded} onChange={change("word")} autoFocus={!row} />
          <label className="editor-field"><span>Nhóm từ</span><select required value={draft.group_id} onChange={change("group_id")}>
            <option value="" disabled>Chọn nhóm</option>{groups.map(group => <option key={group.id} value={group.id}>{group.title}</option>)}
          </select></label>
          <Field label="Nghĩa tiếng Việt" required maxLength={2000} value={draft.meaning} onChange={change("meaning")} wide autoFocus={!!row} />
          {language.pronunciation_mode === "ipa" ? <Field label="Phiên âm IPA" maxLength={500} placeholder="/…/" value={draft.ipa ?? ""} onChange={change("ipa")} /> : <Field label="Cách đọc" maxLength={500} lang={language.code} value={draft.reading ?? ""} onChange={change("reading")} />}
          <Field label="Thứ tự" type="number" min={0} max={2147483647} step={1} required value={draft.sort_order} onChange={change("sort_order")} />
          {language.code === "en" && <IpaSuggestion word={draft.word} value={draft.ipa} disabled={locked} onSuggest={onSuggestIpa} onApply={ipa => set("ipa", ipa)} />}
          {upgraded && language.code !== "en" && <Field label="Phiên âm Latin" maxLength={500} value={draft.romanization ?? ""} onChange={change("romanization")} wide />}
          <Field label="Ví dụ" multiline rows={3} maxLength={5000} value={draft.example} onChange={change("example")} wide />
          {upgraded && <><Field label="Câu điền từ (chỗ trống _____)" multiline rows={2} maxLength={5000} lang={language.code} value={draft.cloze_text ?? ""} onChange={change("cloze_text")} wide /><Field label="Đáp án điền từ" maxLength={200} lang={language.code} value={draft.cloze_answer ?? ""} onChange={change("cloze_answer")} wide /></>}
        </> : entity === "languages" ? <>
          <Field label="Tên ngôn ngữ" required maxLength={100} value={draft.name} onChange={change("name")} autoFocus wide />
          <Field label="Mã ngôn ngữ" required placeholder="ja" maxLength={35} readOnly={!!row} value={draft.code} onChange={change("code")} />
          <Field label="Mã giọng đọc" required placeholder="ja-JP" maxLength={35} value={draft.speech_locale} onChange={change("speech_locale")} />
          <label className="editor-field"><span>Kiểu phiên âm</span><select value={draft.pronunciation_mode} onChange={change("pronunciation_mode")}><option value="reading">Cách đọc / Latin</option><option value="ipa">IPA</option></select></label>
          <Field label="Thứ tự" type="number" min={0} max={2147483647} step={1} required value={draft.sort_order} onChange={change("sort_order")} />
        </> : <>
          <Field label={entity === "groups" ? "Tên nhóm" : "Tiêu đề"} required maxLength={200} value={draft.title} onChange={change("title")} wide autoFocus />
          {entity === "readings" && <Field label="Thời gian mục tiêu" maxLength={100} value={draft.time_label} onChange={change("time_label")} />}
          <Field label="Thứ tự" type="number" min={0} max={2147483647} step={1} required value={draft.sort_order} onChange={change("sort_order")} />
          {entity === "readings" && <Field label="Nội dung bài đọc" multiline rows={9} required maxLength={100000} value={draft.passage} onChange={change("passage")} wide />}
        </>}
      </fieldset>
      {entity === "readings" && <fieldset className="question-editor" disabled={locked}>
        <legend>Câu hỏi ({draft.questions.length})</legend>
        {draft.questions.map((question, index) => <section className="question-edit-row" key={index} aria-label={`Câu hỏi ${index + 1}`}>
          <div className="question-edit-heading"><h3>Câu {index + 1}</h3><div className="row-tools">
            <Tool label={`Chuyển câu ${index + 1} lên`} disabled={locked || index === 0} onClick={() => moveQuestion(index, -1)}><ArrowUp /></Tool>
            <Tool label={`Chuyển câu ${index + 1} xuống`} disabled={locked || index === draft.questions.length - 1} onClick={() => moveQuestion(index, 1)}><ArrowDown /></Tool>
            <Tool label={`Xóa câu ${index + 1}`} disabled={locked || draft.questions.length === 1} onClick={() => set("questions", draft.questions.filter((_, i) => i !== index))}><Trash2 /></Tool>
          </div></div>
          <Field label="Câu hỏi" required maxLength={2000} value={question.prompt} onChange={event => updateQuestion(index, { prompt: event.target.value })} />
          <p className="option-label">Lựa chọn · Đáp án đúng</p>
          {question.options.map((option, optionIndex) => <div className="option-edit-row" key={optionIndex}>
            <input type="radio" name={`correct-${index}`} aria-label={`Đáp án đúng: lựa chọn ${optionIndex + 1}, câu ${index + 1}`} checked={question.answer_index === optionIndex}
              onChange={() => updateQuestion(index, { answer_index: optionIndex })} />
            <input aria-label={`Lựa chọn ${optionIndex + 1}, câu ${index + 1}`} required maxLength={2000} value={option}
              onChange={event => updateQuestion(index, { options: question.options.map((value, i) => i === optionIndex ? event.target.value : value) })} />
            <Tool label={`Xóa lựa chọn ${optionIndex + 1}, câu ${index + 1}`} disabled={locked || question.options.length <= 2} onClick={() => removeOption(question, index, optionIndex)}><X /></Tool>
          </div>)}
          <button type="button" disabled={locked || question.options.length >= 10} onClick={() => updateQuestion(index, { options: [...question.options, ""] })}><Plus />Lựa chọn</button>
          <Field label="Giải thích" multiline rows={2} maxLength={5000} value={question.explanation} onChange={event => updateQuestion(index, { explanation: event.target.value })} />
        </section>)}
        <button type="button" disabled={locked || draft.questions.length >= 100} onClick={() => set("questions", [...draft.questions, newQuestion()])}><Plus />Câu hỏi</button>
      </fieldset>}
      <p className="editor-error error-text" role="alert">{error}</p>
      <footer className="dialog-actions"><button type="button" disabled={locked} onClick={onClose}>Hủy</button>
        <button type="submit" className="primary-button" disabled={locked}><Save />{locked ? "Đang lưu…" : "Lưu"}</button></footer>
    </form>
  </Modal>;
}

function DeleteDialog({ entity, row, questionCount, busy, onDelete, onClose }) {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const locked = busy || submitting;
  async function confirm() {
    if (locked) return;
    setSubmitting(true);
    try {
      const result = await onDelete({ entity, action: "delete", key: rowKey(entity, row) });
      if (result.ok) onClose(); else setError(result.error);
    } catch { setError("Không xóa được. Vui lòng thử lại."); }
    finally { setSubmitting(false); }
  }
  return <Modal title={`Xóa ${TYPES[entity].toLocaleLowerCase("vi")}`} busy={locked} onClose={onClose}>
    <p className="delete-message">Xóa “{row.word || row.title || row.name}"{entity === "readings" ? ` và ${questionCount} câu hỏi` : ""}? Thao tác này không thể hoàn tác.</p>
    <p className="editor-error error-text" role="alert">{error}</p>
    <footer className="dialog-actions"><button type="button" autoFocus disabled={locked} onClick={onClose}>Hủy</button>
      <button type="button" className="danger-button" disabled={locked} onClick={() => void confirm()}><Trash2 />{locked ? "Đang xóa…" : "Xóa"}</button></footer>
  </Modal>;
}

export default function ContentManager({ data, language, initialAction, onSave, onReload, onRefreshPermission, onSignIn, onSuggestIpa }) {
  const [entity, setEntity] = useState("words");
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState(initialAction?.groupId || "");
  const [page, setPage] = useState(0);
  const [dialog, setDialog] = useState(initialAction ? { mode: initialAction.mode, row: initialAction.row || null } : null);
  const [message, setMessage] = useState("");
  const { catalog, canEdit, adminBusy, contentLoading } = data;
  const locked = adminBusy || contentLoading;

  if (!data.user || !canEdit) return <div className="management-empty">
    <h2>Quản lý nội dung</h2><p className="muted" role="status">{data.user ? data.editorStatus : "Đăng nhập bằng tài khoản được cấp quyền quản lý."}</p>
    <div className="account-actions"><button type="button" onClick={onSignIn}><UserRound />{data.user ? "Tài khoản" : "Đăng nhập"}</button>
      {data.user && <button type="button" onClick={() => void onRefreshPermission()}><RefreshCw />Kiểm tra quyền</button>}</div>
  </div>;
  if (!catalog) return <div className="management-empty"><p className="muted">Chưa tải được dữ liệu Supabase.</p><button type="button" disabled={locked} onClick={() => void onReload()}><RefreshCw />Tải lại</button></div>;

  const query = search.trim().toLocaleLowerCase("vi");
  const groups = catalog.groups.filter(group => (group.language_code || "en") === language.code);
  const groupIds = new Set(groups.map(group => group.id));
  const source = entity === "languages" ? catalog.languages || [] : entity === "groups" ? groups : entity === "words" ? catalog.words.filter(word => groupIds.has(word.group_id)) : catalog.readings.filter(row => (row.language_code || "en") === language.code);
  const filtered = source.filter(row => {
    if (entity === "words" && groupFilter && row.group_id !== groupFilter) return false;
    return [row.word, row.title, row.name, row.code, row.meaning, row.ipa, row.reading, row.romanization].filter(Boolean).join(" ").toLocaleLowerCase("vi").includes(query);
  });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const position = Math.min(page, pages - 1);
  const rows = filtered.slice(position * PAGE_SIZE, (position + 1) * PAGE_SIZE);
  const groupNames = Object.fromEntries(catalog.groups.map(group => [group.id, group.title]));

  async function save(change) {
    setMessage("");
    const result = await onSave(change);
    if (result.ok) setMessage((change.action === "import" ? `Đã lưu ${result.imported} thẻ; bỏ qua ${result.skipped} thẻ.` : change.action === "delete" ? "Đã xóa nội dung." : "Đã lưu nội dung.") + (result.warning ? " " + result.warning : ""));
    return result;
  }
  function switchEntity(next) { setEntity(next); setPage(0); setSearch(""); setGroupFilter(""); setMessage(""); }

  return <div className="content-manager">
    <div className="management-heading"><h2>Quản lý nội dung</h2><div className="row-tools">
      <Tool label="Tải lại nội dung" disabled={locked} onClick={() => void onReload()}><RefreshCw className={contentLoading ? "spinning" : ""} /></Tool>
      {entity === "words" && <button type="button" disabled={locked || !groups.length} onClick={() => setDialog({ mode: "import" })}><Upload />Import thẻ</button>}
      <button type="button" className="primary-button" disabled={locked || (entity === "words" && !groups.length) || (entity === "languages" && !multilingualCatalog(catalog))} onClick={() => setDialog({ mode: "edit", row: null })}><Plus />{entity === "words" ? "Thêm thẻ" : "Thêm"}</button>
    </div></div>
    <nav className="management-tabs" aria-label="Loại nội dung">{Object.entries(TYPES).map(([value, title]) => <button type="button" key={value} className={entity === value ? "active" : ""} aria-pressed={entity === value} disabled={adminBusy} onClick={() => switchEntity(value)}>{title}</button>)}</nav>
    <div className="management-filters"><label className="search-field"><Search aria-hidden="true" /><input type="search" aria-label="Tìm nội dung" placeholder="Tìm nội dung" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} /></label>
      {entity === "words" && <select aria-label="Lọc nhóm từ" value={groupFilter} onChange={event => { setGroupFilter(event.target.value); setPage(0); }}><option value="">Tất cả nhóm</option>{groups.map(group => <option key={group.id} value={group.id}>{group.title}</option>)}</select>}
    </div>
    <p className="management-message" role="status">{message}</p>
    {rows.length ? <ul className="content-list">{rows.map(row => {
      const key = rowKey(entity, row);
      const wordCount = entity === "groups" ? catalog.words.filter(word => word.group_id === row.id).length : 0;
      const questionCount = entity === "readings" ? catalog.questions.filter(question => question.reading_id === row.id).length : 0;
      const childCount = entity === "languages" ? catalog.groups.filter(group => group.language_code === row.code).length + catalog.readings.filter(reading => reading.language_code === row.code).length : wordCount;
      const title = row.word || row.title || row.name;
      return <li key={key}><div className="content-row-text"><strong>{title}</strong>
        {entity === "words" ? <><span className="ipa-text">{row.ipa || row.reading || row.romanization || "—"}</span><span>{row.meaning}</span><small>{groupNames[row.group_id]}</small></>
          : <small>{entity === "languages" ? `${row.code} · ${row.speech_locale}` : entity === "groups" ? `${wordCount} từ` : `${questionCount} câu hỏi${row.time_label ? " · " + row.time_label : ""}`}</small>}
      </div><div className="row-tools">
        <Tool label={`Sửa ${title}`} disabled={locked} onClick={() => setDialog({ mode: "edit", row })}><Pencil /></Tool>
        <Tool label={childCount ? "Xóa hoặc chuyển hết nội dung con trước" : `Xóa ${title}`} disabled={locked || childCount > 0} onClick={() => setDialog({ mode: "delete", row, questionCount })}><Trash2 /></Tool>
      </div></li>;
    })}</ul> : <p className="management-empty muted">{query || groupFilter ? "Không tìm thấy nội dung." : "Chưa có nội dung."}</p>}
    <div className="management-pagination"><span>{filtered.length} {entity === "words" ? "từ" : entity === "groups" ? "nhóm" : entity === "languages" ? "ngôn ngữ" : "bài đọc"}</span><div className="navigation-tools">
      <Tool label="Trang trước" disabled={position === 0} onClick={() => setPage(position - 1)}><ArrowLeft /></Tool><span className="deck-counter">{position + 1} / {pages}</span><Tool label="Trang sau" disabled={position === pages - 1} onClick={() => setPage(position + 1)}><ArrowRight /></Tool>
    </div></div>
    {dialog?.mode === "edit" && <Editor entity={entity} row={dialog.row} catalog={catalog} language={language} initialGroup={groupFilter} busy={adminBusy} onSave={save} onSuggestIpa={onSuggestIpa} onClose={() => setDialog(null)} />}
    {dialog?.mode === "delete" && <DeleteDialog entity={entity} row={dialog.row} questionCount={dialog.questionCount} busy={adminBusy} onDelete={save} onClose={() => setDialog(null)} />}
    {dialog?.mode === "import" && <VocabularyImporter catalog={{ ...catalog, groups }} language={language} initialGroup={groupFilter} busy={adminBusy} onSave={save} onSuggestIpa={onSuggestIpa} onClose={() => setDialog(null)} />}
  </div>;
}
