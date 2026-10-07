"use client";

import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Search } from "lucide-react";
import { ipaCandidateLabel } from "../../lib/vocabulary/ipa-review.js";

export default function IpaSuggestion({ word, value, disabled, onSuggest, onApply }) {
  const [lookup, setLookup] = useState(null);
  const [choice, setChoice] = useState("");
  const version = useRef(0);
  useEffect(() => {
    setLookup(null); setChoice("");
    return () => { version.current++; };
  }, [word]);
  const current = lookup?.word === word ? lookup : null;
  const candidates = current?.result?.candidates || [];

  async function search() {
    if (disabled || current?.busy || !word.trim()) return;
    const request = ++version.current;
    setChoice("");
    setLookup({ word, busy: true });
    try {
      const response = await onSuggest([word]);
      if (request !== version.current) return;
      const result = response.results?.[0];
      setLookup({ word, busy: false, result, error: !response.ok ? response.error : !result ? "Chưa nhận được gợi ý IPA." : "" });
    } catch {
      if (request === version.current) setLookup({ word, busy: false, error: "Chưa tra được IPA. Hãy thử lại." });
    }
  }

  return <div className="ipa-lookup field-wide">
    <button type="button" disabled={disabled || current?.busy || !word.trim()} onClick={() => void search()}>
      {current?.busy ? <LoaderCircle className="spinning" /> : <Search />}Tra IPA
    </button>
    {current?.busy && <span className="muted" role="status">Đang tra phiên âm…</span>}
    {candidates.length > 0 && <>
      <div className="ipa-choice-row">
        <label className="editor-field"><span>Phiên âm gợi ý</span>
          <select aria-label="Phiên âm gợi ý" value={choice} disabled={disabled} onChange={event => setChoice(event.target.value)}>
            <option value="">Chọn phiên âm</option>{candidates.map((candidate, index) => <option key={index} value={index}>{ipaCandidateLabel(candidate)}</option>)}
          </select>
        </label>
        <button type="button" disabled={disabled || choice === ""} onClick={() => onApply(candidates[Number(choice)].ipa)}>
          <Check />{value?.trim() ? "Thay IPA" : "Áp dụng IPA"}
        </button>
      </div>
      <small className="muted">{candidates.some(candidate => candidate.source === "dictionary")
        ? <a href="https://dictionaryapi.dev/" target="_blank" rel="noreferrer">Dictionary API</a> : "Bộ từ mẫu · UK"}</small>
    </>}
    {current?.result?.status === "not-found" && <p className="muted ipa-status" role="status">Chưa tìm thấy phiên âm cho từ/cụm từ này.</p>}
    {(current?.error || current?.result?.status === "unavailable") && <p className="error-text ipa-status" role="alert">{current.error || "Từ điển tạm thời không khả dụng. Có thể nhập IPA thủ công."}</p>}
  </div>;
}
