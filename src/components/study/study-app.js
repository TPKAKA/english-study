"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCheck, ChevronDown, Cloud, CloudOff, KeyRound, ListChecks, LogIn, LogOut, Mail, Pencil, Plus, RefreshCw, RotateCcw, Settings2, Shuffle, Trash2, Upload, UserRound, Volume2, VolumeX, X } from "lucide-react";
import { STUDY_CONTENT } from "../../data/study-content.js";
import { createStudySync } from "../../lib/study/study-sync.js";
import { getStudyApiClient } from "../../lib/api/api-client.js";
import { requestIpaSuggestions } from "../../lib/admin/admin-browser.js";
import { gradeReading } from "../../lib/study/quiz.js";
import ContentManager from "../admin/content-manager.js";
import DefaultPasswordSetup from "../auth/default-password-setup.js";

function IconButton({ label, children, ...props }) {
  return <button type="button" className="icon-button" title={label} aria-label={label} {...props}>{children}</button>;
}

function PronunciationButton({ word }) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(null);
  useEffect(() => {
    setSupported("speechSynthesis" in window && "SpeechSynthesisUtterance" in window);
    return () => { active.current = null; if ("speechSynthesis" in window) window.speechSynthesis.cancel(); };
  }, []);
  useEffect(() => {
    setSpeaking(false);
    setError("");
    return () => { active.current = null; if ("speechSynthesis" in window) window.speechSynthesis.cancel(); };
  }, [word]);

  function pronounce() {
    if (!supported || !word) return;
    active.current = null;
    window.speechSynthesis.cancel();
    if (speaking) { setSpeaking(false); return; }
    const utterance = new window.SpeechSynthesisUtterance(word);
    utterance.lang = "en-GB";
    utterance.rate = 0.9;
    const voice = window.speechSynthesis.getVoices().find(item => item.lang.toLowerCase().replace("_", "-") === "en-gb");
    if (voice) utterance.voice = voice;
    active.current = utterance;
    setError("");
    setSpeaking(true);
    utterance.onend = () => { if (active.current === utterance) { active.current = null; setSpeaking(false); } };
    utterance.onerror = () => { if (active.current === utterance) { active.current = null; setSpeaking(false); setError("Không phát được âm thanh trên thiết bị này."); } };
    try { window.speechSynthesis.speak(utterance); }
    catch { active.current = null; setSpeaking(false); setError("Không phát được âm thanh trên thiết bị này."); }
  }
  return <div className="pronunciation-tools"><IconButton label={supported ? speaking ? "Dừng phát âm" : "Nghe phát âm Anh-Anh" : "Thiết bị không hỗ trợ phát âm"} disabled={!word || !supported} onClick={pronounce}>
    {speaking ? <VolumeX /> : <Volume2 />}
  </IconButton>{error && <span className="error-text" role="status">{error}</span>}</div>;
}

function VocabularyDeck({ group, known, onMark, canEdit, editBusy, onManage }) {
  const [order, setOrder] = useState(() => group.w.slice());
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [onlyUnknown, setOnlyUnknown] = useState(false);
  const deck = onlyUnknown ? order.filter(word => !known.has(word[0])) : order;
  const position = deck.length ? Math.min(index, deck.length - 1) : 0;
  const card = deck[position];
  const completed = group.w.filter(word => known.has(word[0])).length;

  function move(delta) {
    if (!deck.length) return;
    setIndex((position + delta + deck.length) % deck.length);
    setFlipped(false);
  }

  function mark(value) {
    if (!card) return;
    onMark(card[0], value);
    if (!onlyUnknown) setIndex((position + 1) % deck.length);
    setFlipped(false);
  }

  function shuffle() {
    const shuffled = order.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setOrder(shuffled);
    setIndex(0);
    setFlipped(false);
  }

  return <>
    <div className="deck-meta"><span>{group.n}</span><span>{completed} / {group.w.length} đã thuộc</span></div>
    {card ? <button type="button" className="flashcard" onClick={() => setFlipped(!flipped)} aria-label={`Lật thẻ: ${card[0]}. ${flipped ? card[1] + ". " + card[2] + ". " : ""}${card[3] || ""}`} aria-pressed={flipped} title="Lật thẻ">
      {flipped ? <><span className="flashcard-meaning">{card[1]}</span><span className="flashcard-example">{card[2]}</span></> : <span className="flashcard-word">{card[0]}</span>}
      {card[3] && <span className="flashcard-ipa" lang="en-GB">{card[3]}</span>}
    </button> : <div className="empty-deck"><CheckCheck aria-hidden="true" /><p>{group.w.length ? "Bạn đã thuộc hết nhóm này." : "Nhóm này chưa có từ vựng."}</p>{group.w.length > 0 && <button type="button" onClick={() => { setOnlyUnknown(false); setIndex(0); }}>Xem tất cả</button>}</div>}
    <div className="card-tools"><PronunciationButton word={card?.[0]} />
      {canEdit && card && <div className="row-tools">
        <IconButton label={`Sửa thẻ ${card[0]}`} disabled={editBusy} onClick={() => onManage("edit", card[0])}><Pencil /></IconButton>
        <IconButton label={`Xóa thẻ ${card[0]}`} disabled={editBusy} onClick={() => onManage("delete", card[0])}><Trash2 /></IconButton>
      </div>}
    </div>
    <div className="deck-actions">
      <div className="navigation-tools">
        <IconButton label="Thẻ trước" disabled={!card} onClick={() => move(-1)}><ArrowLeft /></IconButton>
        <span className="deck-counter">{card ? position + 1 : 0} / {deck.length}</span>
        <IconButton label="Thẻ sau" disabled={!card} onClick={() => move(1)}><ArrowRight /></IconButton>
      </div>
      <div className="mark-actions">
        <button type="button" className="known-button" disabled={!card} onClick={() => mark(true)}><Check />Đã thuộc</button>
        <button type="button" disabled={!card} onClick={() => mark(false)}><X />Chưa thuộc</button>
      </div>
    </div>
    <div className="deck-options">
      <label className="checkbox-label"><input type="checkbox" checked={onlyUnknown} onChange={event => { setOnlyUnknown(event.target.checked); setIndex(0); setFlipped(false); }} />Chỉ thẻ chưa thuộc</label>
      <IconButton label="Trộn thẻ" onClick={shuffle}><Shuffle /></IconButton>
    </div>
  </>;
}

function ReadingQuiz({ reading, onSave }) {
  const [answers, setAnswers] = useState(() => reading.q.map(() => null));
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  const lastSubmission = useRef(null);

  function submit(event) {
    event.preventDefault();
    const grade = gradeReading(reading, answers);
    if (!grade) { setMessage("Hãy trả lời tất cả câu hỏi trước khi kiểm tra."); return; }
    setMessage("");
    setResult(grade);
    const signature = JSON.stringify(answers);
    if (signature !== lastSubmission.current && onSave(reading.id, answers)) lastSubmission.current = signature;
  }

  function reset() {
    setAnswers(reading.q.map(() => null));
    setResult(null);
    setMessage("");
    lastSubmission.current = null;
  }

  return <>
    <div className="reading-meta"><BookOpen aria-hidden="true" /><span>Mục tiêu thời gian: {reading.time}</span></div>
    <article className="passage">{reading.p}</article>
    <form className="reading-quiz" onSubmit={submit}>
      {reading.q.map((question, index) => <fieldset className="question" key={index}>
        <legend>{index + 1}. {question.q}</legend>
        {question.o.map((option, optionIndex) => {
          const feedback = result ? (optionIndex === question.a ? "correct" : answers[index] === optionIndex ? "incorrect" : "") : "";
          return <label className={"answer-option " + feedback} key={optionIndex}>
            <input type="radio" name={"question-" + index} value={optionIndex} checked={answers[index] === optionIndex} onChange={() => { setAnswers(previous => previous.map((answer, i) => i === index ? optionIndex : answer)); setResult(null); setMessage(""); }} />
            <span>{option}</span>
            {feedback === "correct" && <Check className="answer-feedback" aria-label="Đáp án đúng" />}
            {feedback === "incorrect" && <X className="answer-feedback" aria-label="Đáp án chưa đúng" />}
          </label>;
        })}
        {result && <p className="explanation">{question.e}</p>}
      </fieldset>)}
      <div className="quiz-actions"><button type="submit" className="primary-button"><ListChecks />Kiểm tra đáp án</button><IconButton label="Làm lại bài đọc" onClick={reset}><RotateCcw /></IconButton></div>
      <p className={"quiz-result " + (message ? "error-text" : "")} role="status">{message || (result && `Đúng ${result.score} / ${result.total}`)}</p>
    </form>
  </>;
}

export default function StudyApp({ config }) {
  const [data, setData] = useState(() => ({ content: STUDY_CONTENT, contentStatus: "", contentRevision: 0, catalog: null, canEdit: false, editorStatus: "", adminBusy: false, contentLoading: false, known: [], attempts: [], user: null, status: "Tiến độ trên thiết bị", connected: false, busy: false, authBusy: false, authMessage: "", storageFailed: false }));
  const [tab, setTab] = useState("vocabulary");
  const [groupId, setGroupId] = useState(STUDY_CONTENT.groups[0].id);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [code, setCode] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [manageIntent, setManageIntent] = useState(null);
  const sync = useRef(null);
  const account = useRef(null);
  const managementRequest = useRef(0);

  useEffect(() => {
    const service = createStudySync({
      config, initialContent: STUDY_CONTENT, createClient: getStudyApiClient,
      storage: { getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value) },
      onChange: setData
    });
    sync.current = service;
    const online = () => void service.refresh();
    window.addEventListener("online", online);
    void service.start();
    return () => { service.stop(); window.removeEventListener("online", online); if (sync.current === service) sync.current = null; };
  }, [config.url, config.publishableKey]);

  const known = useMemo(() => new Set(data.known), [data.known]);
  const group = data.content.groups.find(item => item.id === groupId) || data.content.groups[0];
  const reading = data.content.readings.find(item => item.id === tab);
  const managing = tab === "manage";
  const activeTab = managing ? "manage" : reading ? tab : "vocabulary";
  const scope = data.user?.id || "guest";
  const contentVersion = data.contentRevision;
  const titles = Object.fromEntries(data.content.readings.map(item => [item.id, item.t]));

  useEffect(() => {
    setPassword(""); setNewPassword(""); setConfirmPassword(""); setPasswordError(""); setCode(""); setOtpEmail("");
  }, [scope]);

  async function signIn(event) {
    event.preventDefault();
    const result = await sync.current?.signInWithPassword(email, password);
    if (result?.ok) setPassword("");
  }
  async function sendCode() {
    if (!account.current.querySelector("#auth-email")?.reportValidity()) return;
    const address = email.trim();
    const result = await sync.current?.signIn(address);
    if (result?.ok) { setOtpEmail(address); setCode(""); }
  }
  async function verifyCode(event) {
    event.preventDefault();
    const result = await sync.current?.verifyEmailCode(otpEmail, code);
    if (result?.ok) { setCode(""); setOtpEmail(""); }
  }
  async function changePassword(event) {
    event.preventDefault();
    setPasswordError("");
    if (newPassword !== confirmPassword) { setPasswordError("Mật khẩu nhập lại không khớp."); return; }
    const result = await sync.current?.setPassword(newPassword);
    if (result?.ok) { setNewPassword(""); setConfirmPassword(""); }
  }

  function openAccount() {
    account.current.open = true;
    account.current.scrollIntoView({ block: "start" });
    (account.current.querySelector("input") || account.current.querySelector("summary")).focus();
  }
  function manageCards(mode, word) {
    const row = word ? data.catalog?.words.find(item => item.word === word) : null;
    if (word && !row) return;
    setManageIntent({ mode, row, groupId: group?.id || "", request: ++managementRequest.current });
    setTab("manage");
  }

  return <main>
    <header className="page-header"><BookOpen aria-hidden="true" /><h1>Business English</h1></header>
    <section className="account" aria-label="Tài khoản và tiến độ">
      <details ref={account}>
        <summary><UserRound aria-hidden="true" /><span>Tài khoản</span><ChevronDown className="disclosure-icon" aria-hidden="true" /></summary>
        {data.user ? <><div className="account-session"><p className="account-email">{data.user.email}</p><div className="account-actions">
          <IconButton label="Đồng bộ lại" disabled={data.busy || data.authBusy} onClick={() => void sync.current?.refresh()}><RefreshCw className={data.busy ? "spinning" : ""} /></IconButton>
          <button type="button" disabled={data.authBusy || data.adminBusy} onClick={() => void sync.current?.signOut()}><LogOut />Đăng xuất</button>
        </div></div><details className="password-settings"><summary><KeyRound />Đặt / đổi mật khẩu<ChevronDown className="disclosure-icon" /></summary>
          <DefaultPasswordSetup key={scope} config={config} busy={data.authBusy} />
          <form className="auth-form" onSubmit={event => void changePassword(event)}>
            <label htmlFor="new-password">Mật khẩu mới<input id="new-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} disabled={data.authBusy}
              value={newPassword} onChange={event => { setNewPassword(event.target.value); setPasswordError(""); }} /></label>
            <label htmlFor="confirm-password">Nhập lại mật khẩu<input id="confirm-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} disabled={data.authBusy}
              value={confirmPassword} onChange={event => { setConfirmPassword(event.target.value); setPasswordError(""); }} /></label>
            <button type="submit" disabled={data.authBusy}><KeyRound />{data.authBusy ? "Đang xử lý…" : "Lưu mật khẩu"}</button>
          </form><p className="error-text auth-message" role="alert">{passwordError}</p>
        </details></> : data.connected ? <><form className="auth-form" onSubmit={event => void signIn(event)}>
          <label htmlFor="auth-email">Email<input id="auth-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label>
          <label htmlFor="auth-password">Mật khẩu<input id="auth-password" type="password" autoComplete="current-password" required maxLength={128} disabled={data.authBusy} value={password} onChange={event => setPassword(event.target.value)} /></label>
          <button type="submit" className="primary-button" disabled={data.authBusy}><LogIn />{data.authBusy ? "Đang xử lý…" : "Đăng nhập"}</button>
        </form><details className="alternate-login" open={!!otpEmail}><summary><Mail />Mã xác thực email<ChevronDown className="disclosure-icon" /></summary>
          <div className="account-actions"><button type="button" disabled={data.authBusy} onClick={() => void sendCode()}><Mail />{otpEmail ? "Gửi lại mã" : "Gửi mã xác thực"}</button></div>
          {otpEmail && <><p className="muted">{otpEmail}</p><form className="auth-form" onSubmit={event => void verifyCode(event)}>
            <label htmlFor="auth-code">Mã xác thực<input id="auth-code" type="text" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6,10}" maxLength={10}
              disabled={data.authBusy} value={code} onChange={event => setCode(event.target.value)} /></label>
            <button type="submit" disabled={data.authBusy}><Check />Xác nhận</button>
          </form></>}
        </details></> : <p className="muted">{config.url ? (data.status.startsWith("Chưa kết nối") ? "Không thể kết nối tài khoản." : "Đang kết nối tài khoản…") : "Chưa cấu hình kết nối Supabase."}</p>}
        <p className="auth-message muted" role="status">{data.authMessage}</p>
        {data.user && <p className="muted" role="status">{data.editorStatus}</p>}
      </details>
      <p className="sync-status muted" role="status">{data.connected ? <Cloud aria-hidden="true" /> : <CloudOff aria-hidden="true" />}<span>{data.status}{data.storageFailed && " · Không thể lưu trên thiết bị"}</span></p>
    </section>
    <nav className="study-tabs" aria-label="Phần học">
      <button type="button" className={activeTab === "vocabulary" ? "active" : ""} aria-pressed={activeTab === "vocabulary"} onClick={() => setTab("vocabulary")}>Từ vựng</button>
      {data.content.readings.map(item => <button type="button" key={item.id} className={activeTab === item.id ? "active" : ""} aria-pressed={activeTab === item.id} onClick={() => setTab(item.id)}>{item.t}</button>)}
      <button type="button" className={managing ? "active" : ""} aria-pressed={managing} onClick={() => { setManageIntent(null); setTab("manage"); }}><Settings2 />Quản lý thẻ</button>
    </nav>
    {data.contentStatus && <p className="content-status muted" role="status">{data.contentStatus}</p>}
    <section aria-label={managing ? "Quản lý nội dung" : reading ? reading.t : "Từ vựng"}>
      {managing ? <ContentManager key={`${scope}:${manageIntent?.request || 0}`} data={data} initialAction={manageIntent} onSignIn={openAccount} onSave={change => sync.current.editContent(change)} onSuggestIpa={words => requestIpaSuggestions(getStudyApiClient(config), words)} onReload={() => sync.current?.reloadContent()} onRefreshPermission={() => sync.current?.refreshPermission()} /> : reading ? <ReadingQuiz key={`${reading.id}:${scope}:${contentVersion}`} reading={reading} onSave={(id, answers) => sync.current?.saveAttempt(id, answers) || false} /> : <>
        <div className="vocabulary-toolbar"><button type="button" onClick={() => manageCards("edit")} disabled={data.adminBusy}><Plus />Thêm thẻ</button>
          <button type="button" onClick={() => manageCards("import")} disabled={data.adminBusy}><Upload />Import thẻ</button></div>
        {group ? <><nav className="group-tabs" aria-label="Nhóm từ vựng">{data.content.groups.map(item => <button type="button" key={item.id} className={group.id === item.id ? "active" : ""} aria-pressed={group.id === item.id} onClick={() => setGroupId(item.id)}>{item.n}</button>)}</nav>
          <VocabularyDeck key={`${group.id}:${scope}:${contentVersion}`} group={group} known={known} onMark={(word, value) => sync.current?.mark(word, value)} canEdit={data.canEdit && !!data.catalog} editBusy={data.adminBusy || data.contentLoading} onManage={manageCards} />
        </> : <p className="muted">Chưa có từ vựng.</p>}
      </>}
    </section>
    {!managing && <details className="history"><summary><ListChecks aria-hidden="true" /><span>Lịch sử bài đọc</span><ChevronDown className="disclosure-icon" aria-hidden="true" /></summary>
      {data.attempts.length ? <ul>{data.attempts.map(attempt => <li key={attempt.id}><span>{titles[attempt.reading_id] || attempt.reading_id}</span><strong>{attempt.score} / {attempt.total}</strong><time dateTime={attempt.completed_at}>{new Date(attempt.completed_at).toLocaleString("vi-VN")}</time></li>)}</ul> : <p className="muted">Chưa có kết quả.</p>}
    </details>}
  </main>;
}
