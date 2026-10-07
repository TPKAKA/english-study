"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

export default function PronunciationButton({ word }) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(null);
  useEffect(() => {
    setSupported("speechSynthesis" in window && "SpeechSynthesisUtterance" in window);
    return () => { active.current = null; if ("speechSynthesis" in window) window.speechSynthesis.cancel(); };
  }, []);
  useEffect(() => {
    setSpeaking(false); setError("");
    return () => { active.current = null; if ("speechSynthesis" in window) window.speechSynthesis.cancel(); };
  }, [word]);
  function pronounce() {
    if (!supported || !word) return;
    active.current = null; window.speechSynthesis.cancel();
    if (speaking) { setSpeaking(false); return; }
    const utterance = new window.SpeechSynthesisUtterance(word);
    utterance.lang = "en-GB"; utterance.rate = 0.9;
    const voice = window.speechSynthesis.getVoices().find(item => item.lang.toLowerCase().replace("_", "-") === "en-gb");
    if (voice) utterance.voice = voice;
    active.current = utterance; setError(""); setSpeaking(true);
    utterance.onend = () => { if (active.current === utterance) { active.current = null; setSpeaking(false); } };
    utterance.onerror = () => { if (active.current === utterance) { active.current = null; setSpeaking(false); setError("Không phát được âm thanh trên thiết bị này."); } };
    try { window.speechSynthesis.speak(utterance); }
    catch { active.current = null; setSpeaking(false); setError("Không phát được âm thanh trên thiết bị này."); }
  }
  const label = supported ? speaking ? "Dừng phát âm" : "Nghe phát âm Anh-Anh" : "Thiết bị không hỗ trợ phát âm";
  return <div className="pronunciation-tools"><button type="button" className="icon-button" title={label} aria-label={label} disabled={!word || !supported} onClick={pronounce}>
    {speaking ? <VolumeX /> : <Volume2 />}
  </button>{error && <span className="error-text" role="status">{error}</span>}</div>;
}
