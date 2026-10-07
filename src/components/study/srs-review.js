"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, CheckCheck, CircleHelp, List, Play, RefreshCw, RotateCcw, Zap } from "lucide-react";
import PronunciationButton from "./pronunciation-button.js";
import { intervalLabel, previewSrs, selectSrsQueue } from "../../lib/study/srs.js";
import { cardId, cardMeta, cardPronunciation } from "../../lib/study/languages.js";

const icons = { again: RotateCcw, hard: CircleHelp, good: Check, easy: Zap };
const localDay = date => new Date(date).toLocaleDateString("sv-SE");
const dueTime = date => new Date(date).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function SrsReview({ data, language, now, onReview, onRefresh }) {
  const [groupId, setGroupId] = useState("");
  const [active, setActive] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const records = data.srs || {};
  const queue = useMemo(() => selectSrsQueue(data.content, records, now, groupId), [data.content, records, now, groupId]);
  const scheduled = queue.filter(item => !item.isNew).length;
  const fresh = queue.length - scheduled;
  const wordSet = new Set(data.content.groups.flatMap(group => group.w.map(cardId)));
  const reviewedToday = Object.values(records).filter(row => wordSet.has(row.word) && localDay(row.reviewed_at) === localDay(now) && (!groupId || data.content.groups.find(group => group.id === groupId)?.w.some(word => cardId(word) === row.word))).length;
  const item = queue.find(item => cardId(item.word) === active);
  const card = item?.word;
  const outcomes = useMemo(() => item ? previewSrs(item.record?.card, now) : [], [item, now]);
  const locked = data.srsLoading || data.contentLoading;
  const future = data.content.groups.filter(group => !groupId || group.id === groupId).flatMap(group => group.w)
    .map(word => Object.hasOwn(records, cardId(word)) ? records[cardId(word)].card.due : null).filter(due => due && Date.parse(due) > now).sort();
  const pages = Math.max(1, Math.ceil(queue.length / 20));
  const position = Math.min(page, pages - 1);

  function choose(word) { setActive(word); setFlipped(false); setError(""); }
  function rate(rating, label) {
    if (!item || !flipped || locked) return;
    if (!onReview(cardId(card), rating)) { setError("Chưa lưu được đánh giá. Hãy kiểm tra lịch ôn và thử lại."); return; }
    setMessage(`Đã ôn “${card[0]}” · ${label}`);
    const next = queue.find(next => cardId(next.word) !== cardId(card));
    choose(next ? cardId(next.word) : null);
  }

  return <div className="srs-review">
    <div className="srs-heading"><h2><CalendarDays />Ôn tập</h2><button type="button" className="icon-button" title="Đồng bộ lịch ôn" aria-label="Đồng bộ lịch ôn" disabled={data.srsLoading || data.srsSaving || !data.user} onClick={() => void onRefresh()}><RefreshCw className={data.srsLoading || data.srsSaving ? "spinning" : ""} /></button></div>
    <dl className="srs-stats"><div><dt>Đến hạn</dt><dd>{scheduled}</dd></div><div><dt>Từ mới</dt><dd>{fresh}</dd></div><div><dt>Đã ôn hôm nay</dt><dd>{reviewedToday}</dd></div></dl>
    <div className="srs-controls"><select aria-label="Nhóm từ ôn tập" value={groupId} disabled={locked} onChange={event => { setGroupId(event.target.value); setActive(null); setPage(0); setMessage(""); }}>
      <option value="">Tất cả nhóm</option>{data.content.groups.map(group => <option key={group.id} value={group.id}>{group.n}</option>)}
    </select>{!card && queue.length > 0 && <button type="button" className="primary-button" disabled={locked} onClick={() => choose(cardId(queue[0].word))}><Play />Bắt đầu ôn</button>}</div>
    <p className="muted srs-status" role="status">{data.srsStatus}</p>
    {card ? <section aria-label="Thẻ ôn tập">
      <div className="deck-meta"><span>{item.groupName}</span><span>{item.isNew ? "Từ mới" : "Đến hạn ôn"} · {queue.length} còn lại</span></div>
      <button type="button" className="flashcard" title="Lật thẻ" aria-label={`Lật thẻ ôn: ${card[0]}`} aria-pressed={flipped} onClick={() => setFlipped(!flipped)}>
        <span className="flashcard-word" lang={language?.code}>{card[0]}</span>
        {flipped && <><span className="flashcard-meaning">{card[1]}</span><span className="flashcard-example">{card[2]}</span></>}
        {cardPronunciation(card) && <span className="flashcard-ipa">{cardPronunciation(card)}</span>}
        {cardMeta(card).romanization && <span className="flashcard-romanization">{cardMeta(card).romanization}</span>}
      </button>
      <div className="srs-card-tools"><PronunciationButton word={card[0]} language={language} /><button type="button" className="icon-button" title="Về danh sách ôn" aria-label="Về danh sách ôn" onClick={() => choose(null)}><List /></button></div>
      {!flipped && <button type="button" className="srs-reveal" onClick={() => setFlipped(true)}>Hiện đáp án</button>}
      <div className="srs-ratings">{outcomes.map(({ rating, label, tone, due }) => {
        const Icon = icons[tone];
        return <button type="button" key={rating} className={`srs-rating ${tone}`} disabled={locked || !flipped} aria-label={`Đánh giá ${label}`} onClick={() => rate(rating, label)}>
          <span><Icon />{label}</span><small>{intervalLabel(due, now)}</small>
        </button>;
      })}</div>
    </section> : queue.length ? <>
      <h3 className="srs-list-heading">Danh sách đến hạn ({queue.length})</h3>
      <ul className="srs-list">{queue.slice(position * 20, position * 20 + 20).map(item => <li key={cardId(item.word)}>
        <button type="button" className="srs-word" disabled={locked} onClick={() => choose(cardId(item.word))}><strong lang={language?.code}>{item.word[0]}</strong><span className="ipa-text">{cardPronunciation(item.word) || cardMeta(item.word).romanization}</span></button>
        <span className="srs-list-meta">{item.groupName}<small>{item.isNew ? "Từ mới" : dueTime(item.record.card.due)}</small></span>
      </li>)}</ul>
      <div className="management-pagination"><span>{queue.length} từ</span><div className="navigation-tools">
        <button type="button" className="icon-button" title="Trang trước" aria-label="Trang ôn trước" disabled={position === 0} onClick={() => setPage(position - 1)}><ArrowLeft /></button>
        <span className="deck-counter">{position + 1} / {pages}</span>
        <button type="button" className="icon-button" title="Trang sau" aria-label="Trang ôn sau" disabled={position === pages - 1} onClick={() => setPage(position + 1)}><ArrowRight /></button>
      </div></div>
    </> : <div className="empty-deck srs-complete"><CheckCheck /><p>{locked ? "Đang tải lịch ôn…" : "Không còn từ đến hạn ôn."}</p>{!locked && future[0] && <span className="muted">Lần ôn tiếp theo: {dueTime(future[0])}</span>}</div>}
    <p className="srs-message" role="status">{message}</p><p className="error-text srs-message" role="alert">{error}</p>
  </div>;
}
