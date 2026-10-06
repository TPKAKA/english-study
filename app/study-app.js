"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCheck, ChevronDown, Cloud, CloudOff, ListChecks, LogOut, Mail, RefreshCw, RotateCcw, Shuffle, UserRound, X } from "lucide-react";
import { STUDY_CONTENT } from "../study-content.js";
import { createStudySync } from "../lib/study-sync.js";
import { getSupabaseBrowserClient } from "../lib/supabase-browser.js";
import { gradeReading } from "../lib/quiz.js";

function IconButton({ label, children, ...props }) {
  return <button type="button" className="icon-button" title={label} aria-label={label} {...props}>{children}</button>;
}

function VocabularyDeck({ group, known, onMark }) {
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
    {card ? <button type="button" className="flashcard" onClick={() => setFlipped(!flipped)} aria-label="Lật thẻ" aria-pressed={flipped} title="Lật thẻ">
      {flipped ? <><span className="flashcard-meaning">{card[1]}</span><span className="flashcard-example">{card[2]}</span></> : <span className="flashcard-word">{card[0]}</span>}
    </button> : <div className="empty-deck"><CheckCheck aria-hidden="true" /><p>Bạn đã thuộc hết nhóm này.</p><button type="button" onClick={() => { setOnlyUnknown(false); setIndex(0); }}>Xem tất cả</button></div>}
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
  const [data, setData] = useState(() => ({ content: STUDY_CONTENT, contentStatus: "", known: [], attempts: [], user: null, status: "Tiến độ trên thiết bị", connected: false, busy: false, authBusy: false, authMessage: "", storageFailed: false }));
  const [tab, setTab] = useState("vocabulary");
  const [groupId, setGroupId] = useState(STUDY_CONTENT.groups[0].id);
  const [email, setEmail] = useState("");
  const sync = useRef(null);

  useEffect(() => {
    const service = createStudySync({
      config, initialContent: STUDY_CONTENT, createClient: getSupabaseBrowserClient,
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
  const activeTab = reading ? tab : "vocabulary";
  const scope = data.user?.id || "guest";
  const contentVersion = data.content === STUDY_CONTENT ? "fallback" : "cloud";
  const titles = Object.fromEntries(data.content.readings.map(item => [item.id, item.t]));

  function signIn(event) {
    event.preventDefault();
    void sync.current?.signIn(email, window.location.origin + "/");
  }

  return <main>
    <header className="page-header"><BookOpen aria-hidden="true" /><h1>Business English</h1></header>
    <section className="account" aria-label="Tài khoản và tiến độ">
      <details>
        <summary><UserRound aria-hidden="true" /><span>Tài khoản</span><ChevronDown className="disclosure-icon" aria-hidden="true" /></summary>
        {data.user ? <div className="account-session"><p className="account-email">{data.user.email}</p><div className="account-actions">
          <IconButton label="Đồng bộ lại" disabled={data.busy || data.authBusy} onClick={() => void sync.current?.refresh()}><RefreshCw className={data.busy ? "spinning" : ""} /></IconButton>
          <button type="button" disabled={data.authBusy} onClick={() => void sync.current?.signOut()}><LogOut />Đăng xuất</button>
        </div></div> : data.connected ? <form className="auth-form" onSubmit={signIn}>
          <label htmlFor="auth-email">Email<input id="auth-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label>
          <button type="submit" disabled={data.authBusy}><Mail />{data.authBusy ? "Đang gửi…" : "Gửi liên kết đăng nhập"}</button>
        </form> : <p className="muted">{config.url ? (data.status.startsWith("Chưa kết nối") ? "Không thể kết nối tài khoản." : "Đang kết nối tài khoản…") : "Chưa cấu hình kết nối Supabase."}</p>}
        <p className="auth-message muted" role="status">{data.authMessage}</p>
      </details>
      <p className="sync-status muted" role="status">{data.connected ? <Cloud aria-hidden="true" /> : <CloudOff aria-hidden="true" />}<span>{data.status}{data.storageFailed && " · Không thể lưu trên thiết bị"}</span></p>
    </section>
    <nav className="study-tabs" aria-label="Phần học">
      <button type="button" className={activeTab === "vocabulary" ? "active" : ""} aria-pressed={activeTab === "vocabulary"} onClick={() => setTab("vocabulary")}>Từ vựng</button>
      {data.content.readings.map(item => <button type="button" key={item.id} className={activeTab === item.id ? "active" : ""} aria-pressed={activeTab === item.id} onClick={() => setTab(item.id)}>{item.t}</button>)}
    </nav>
    {data.contentStatus && <p className="content-status muted" role="status">{data.contentStatus}</p>}
    <section aria-label={reading ? reading.t : "Từ vựng"}>
      {reading ? <ReadingQuiz key={`${reading.id}:${scope}:${contentVersion}`} reading={reading} onSave={(id, answers) => sync.current?.saveAttempt(id, answers) || false} /> : <>
        <nav className="group-tabs" aria-label="Nhóm từ vựng">{data.content.groups.map(item => <button type="button" key={item.id} className={group.id === item.id ? "active" : ""} aria-pressed={group.id === item.id} onClick={() => setGroupId(item.id)}>{item.n}</button>)}</nav>
        <VocabularyDeck key={`${group.id}:${scope}:${contentVersion}`} group={group} known={known} onMark={(word, value) => sync.current?.mark(word, value)} />
      </>}
    </section>
    <details className="history"><summary><ListChecks aria-hidden="true" /><span>Lịch sử bài đọc</span><ChevronDown className="disclosure-icon" aria-hidden="true" /></summary>
      {data.attempts.length ? <ul>{data.attempts.map(attempt => <li key={attempt.id}><span>{titles[attempt.reading_id] || attempt.reading_id}</span><strong>{attempt.score} / {attempt.total}</strong><time dateTime={attempt.completed_at}>{new Date(attempt.completed_at).toLocaleString("vi-VN")}</time></li>)}</ul> : <p className="muted">Chưa có kết quả.</p>}
    </details>
  </main>;
}
