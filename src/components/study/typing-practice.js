"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCheck, Eye, Headphones, Keyboard, Languages, Play, RefreshCw, RotateCcw, Shuffle, TextCursorInput, X } from "lucide-react";
import PronunciationButton from "./pronunciation-button.js";
import { MAX_PRACTICE_ANSWER, PRACTICE_MODES, selectPracticeQueue } from "../../lib/study/typing-practice.js";

const icons = { meaning: Languages, listening: Headphones, cloze: TextCursorInput };

export default function TypingPractice({ data, onAnswer, onRefresh }) {
  const [mode, setMode] = useState("meaning"), [groupId, setGroupId] = useState("");
  const [onlyMistakes, setOnlyMistakes] = useState(false), [session, setSession] = useState(null);
  const [answer, setAnswer] = useState(""), [result, setResult] = useState(null), [error, setError] = useState("");
  const [audioSupported, setAudioSupported] = useState(null), [page, setPage] = useState(0);
  const input = useRef(null), nextButton = useRef(null), submitted = useRef(false);
  const records = data.practice || {};
  const available = useMemo(() => selectPracticeQueue(data.content, records, mode, groupId), [data.content, records, mode, groupId]);
  const mistakes = useMemo(() => selectPracticeQueue(data.content, records, mode, groupId, true), [data.content, records, mode, groupId]);
  const queue = onlyMistakes ? mistakes : available;
  const locked = data.contentLoading || data.practiceLoading;
  const item = session?.questions[session.index];
  const finished = session && !item;
  const pages = Math.max(1, Math.ceil(mistakes.length / 20)), position = Math.min(page, pages - 1);
  useEffect(() => { setAudioSupported("speechSynthesis" in window && "SpeechSynthesisUtterance" in window); }, []);
  useEffect(() => { if (item && !locked) (result ? nextButton : input).current?.focus(); }, [item, result, locked]);

  function resetQuestion() { setAnswer(""); setResult(null); setError(""); submitted.current = false; }
  function reset() { setSession(null); resetQuestion(); setPage(0); }
  function start(questions, shuffle = false) {
    if (!questions.length || locked || (mode === "listening" && !audioSupported)) return;
    const order = questions.slice();
    if (shuffle) for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    setSession({ questions: order, index: 0, correct: 0, wrong: 0 }); resetQuestion();
  }
  function check(reveal = false) {
    if (!item || result || submitted.current || locked) return;
    if (!reveal && !answer.trim()) { setError("Nhập đáp án trước khi kiểm tra."); input.current?.focus(); return; }
    const grade = onAnswer(item.word[0], mode, reveal ? "" : answer);
    if (!grade) { setError("Chưa lưu được câu trả lời. Hãy chờ dữ liệu tải xong rồi thử lại."); return; }
    submitted.current = true; setError(""); setResult({ ...grade, revealed: reveal });
    setSession(previous => ({ ...previous, [grade.correct ? "correct" : "wrong"]: previous[grade.correct ? "correct" : "wrong"] + 1 }));
  }
  function next() { if (!result) return; setSession(previous => ({ ...previous, index: previous.index + 1 })); resetQuestion(); }

  return <div className="typing-practice">
    <div className="practice-heading"><h2><Keyboard />Luyện gõ</h2><button type="button" className="icon-button" title="Đồng bộ luyện gõ" aria-label="Đồng bộ luyện gõ" disabled={!data.user || data.practiceLoading || data.practiceSaving} onClick={() => void onRefresh()}><RefreshCw className={data.practiceLoading || data.practiceSaving ? "spinning" : ""} /></button></div>
    <fieldset className="practice-modes"><legend className="visually-hidden">Kiểu luyện</legend>{PRACTICE_MODES.map(option => {
      const Icon = icons[option.id];
      return <label key={option.id} className={mode === option.id ? "selected" : ""}>
        <input type="radio" name="practice-mode" value={option.id} checked={mode === option.id} disabled={locked || (option.id === "listening" && audioSupported === false)} onChange={() => { setMode(option.id); reset(); }} />
        <Icon /><span>{option.label}</span>
      </label>;
    })}</fieldset>
    {audioSupported === false && <p className="muted">Thiết bị này không hỗ trợ nghe và viết.</p>}
    <div className="practice-filters"><select aria-label="Nhóm từ luyện gõ" value={groupId} disabled={locked} onChange={event => { setGroupId(event.target.value); reset(); }}>
      <option value="">Tất cả nhóm</option>{data.content.groups.map(group => <option key={group.id} value={group.id}>{group.n}</option>)}
    </select><label className="checkbox-label"><input type="checkbox" checked={onlyMistakes} disabled={locked} onChange={event => { setOnlyMistakes(event.target.checked); reset(); }} />Chỉ từ trả lời sai</label></div>
    <p className="muted practice-status" role="status">{data.practiceStatus}</p>
    {item ? <section aria-label="Câu luyện gõ">
      <div className="deck-meta"><span>{item.groupName}</span><span>{session.index + 1} / {session.questions.length} · Đúng {session.correct} · Sai {session.wrong}</span></div>
      <div className={`practice-prompt ${mode}`}>
        {mode === "listening" ? <><Headphones aria-hidden="true" /><PronunciationButton key={`${session.index}:${item.word[0]}`} word={item.word[0]} /></> : <p lang={mode === "cloze" ? "en" : "vi"}>{item.prompt}</p>}
      </div>
      <form className="practice-form" onSubmit={event => { event.preventDefault(); result ? next() : check(); }}>
        <label htmlFor="practice-answer">{mode === "cloze" ? "Từ còn thiếu" : "Từ tiếng Anh"}</label>
        <input ref={input} id="practice-answer" type="text" lang="en" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} maxLength={MAX_PRACTICE_ANSWER} value={answer} disabled={!!result || locked} aria-invalid={result ? !result.correct : undefined} aria-describedby="practice-feedback" onChange={event => { setAnswer(event.target.value); setError(""); }} />
        <div className="practice-actions"><button ref={nextButton} type="submit" className="primary-button" disabled={locked}>{result ? <><ArrowRight />{session.index + 1 === session.questions.length ? "Xem kết quả" : "Câu tiếp theo"}</> : <><Check />Kiểm tra</>}</button>
          {!result && <button type="button" disabled={locked} onClick={() => check(true)}><Eye />Xem đáp án</button>}
          <button type="button" className="icon-button" title="Về danh sách luyện gõ" aria-label="Về danh sách luyện gõ" onClick={reset}><ArrowLeft /></button>
        </div>
      </form>
      <div id="practice-feedback" className={`practice-feedback ${result ? result.correct ? "correct" : "incorrect" : ""}`} role="status">
        {result && <><strong className="practice-verdict">{result.correct ? <Check /> : <X />}{result.correct ? "Chính xác" : result.revealed ? "Đã xem đáp án · Cần luyện lại" : "Chưa đúng · Cần luyện lại"}</strong>
          <div className="practice-answer-key"><strong lang="en">{result.expected}</strong>{item.word[3] && <span className="ipa-text">{item.word[3]}</span>}{mode !== "listening" && <PronunciationButton word={item.word[0]} />}</div>
          <p>{item.word[1]}</p><p className="muted" lang="en">{item.word[2]}</p>
        </>}
      </div>
    </section> : <>
      {finished && <div className="practice-complete" role="status"><CheckCheck /><h3>Hoàn thành lượt luyện</h3><p>Đúng {session.correct} / {session.questions.length} · Cần luyện lại {session.wrong}</p></div>}
      <div className="practice-start"><span className="muted">{queue.length} từ phù hợp · {mistakes.length} từ cần luyện lại</span><div className="practice-actions">
        <button type="button" className="primary-button" disabled={locked || !queue.length} onClick={() => start(queue)}><Play />{finished ? "Luyện lượt mới" : "Bắt đầu luyện"}</button>
        <button type="button" disabled={locked || !mistakes.length} onClick={() => start(mistakes)}><RotateCcw />Luyện lại từ sai</button>
        <button type="button" className="icon-button" title="Trộn từ và bắt đầu luyện" aria-label="Trộn từ và bắt đầu luyện" disabled={locked || !queue.length} onClick={() => start(queue, true)}><Shuffle /></button>
      </div></div>
      {!queue.length && <p className="muted">{locked ? "Đang tải luyện gõ…" : onlyMistakes ? "Không có từ sai phù hợp với bộ lọc." : mode === "cloze" ? "Chưa có câu ví dụ chứa đúng từ trong nhóm này." : "Nhóm này chưa có từ vựng."}</p>}
      <h3 className="practice-list-heading">Từ cần luyện lại ({mistakes.length})</h3>
      <ul className="practice-mistakes">{mistakes.slice(position * 20, position * 20 + 20).map(entry => <li key={entry.word[0]}>
        <div><strong lang="en">{entry.word[0]}</strong> <span className="ipa-text">{entry.word[3]}</span><span>{entry.word[1]}</span><small>Đã nhập: {records[entry.word[0]].last_answer || "Chưa nhập"}</small></div>
        <button type="button" className="icon-button" title={`Luyện lại ${entry.word[0]}`} aria-label={`Luyện lại ${entry.word[0]}`} disabled={locked} onClick={() => start([entry])}><RotateCcw /></button>
      </li>)}</ul>
      {pages > 1 && <div className="management-pagination"><span>{mistakes.length} từ sai</span><div className="navigation-tools">
        <button type="button" className="icon-button" title="Trang trước" aria-label="Trang từ sai trước" disabled={position === 0} onClick={() => setPage(position - 1)}><ArrowLeft /></button><span className="deck-counter">{position + 1} / {pages}</span>
        <button type="button" className="icon-button" title="Trang sau" aria-label="Trang từ sai sau" disabled={position === pages - 1} onClick={() => setPage(position + 1)}><ArrowRight /></button>
      </div></div>}
    </>}
    <p className="error-text practice-error" role="alert">{error}</p>
  </div>;
}
