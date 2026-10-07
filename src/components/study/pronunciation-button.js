"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useSpeechVoice } from "./use-speech-voice.js";

export default function PronunciationButton({ word, language }) {
  const locale = language?.speech_locale || "en-GB";
  const { supported, voice } = useSpeechVoice(locale);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(null);
  useEffect(() => {
    return () => { active.current = null; if ("speechSynthesis" in window) window.speechSynthesis.cancel(); };
  }, []);
  useEffect(() => {
    setSpeaking(false); setError("");
    return () => { active.current = null; if ("speechSynthesis" in window) window.speechSynthesis.cancel(); };
  }, [word, locale]);
  function pronounce() {
    if (!supported || !word) return;
    active.current = null; window.speechSynthesis.cancel();
    if (speaking) { setSpeaking(false); return; }
    const utterance = new window.SpeechSynthesisUtterance(word);
    utterance.lang = locale; utterance.rate = 0.9;
    if (voice) utterance.voice = voice;
    active.current = utterance; setError(""); setSpeaking(true);
    utterance.onend = () => { if (active.current === utterance) { active.current = null; setSpeaking(false); } };
    utterance.onerror = () => { if (active.current === utterance) { active.current = null; setSpeaking(false); setError("Không phát được âm thanh trên thiết bị này."); } };
    try { window.speechSynthesis.speak(utterance); }
    catch { active.current = null; setSpeaking(false); setError("Không phát được âm thanh trên thiết bị này."); }
  }
  const label = supported ? speaking ? "Dừng phát âm" : locale === "en-GB" ? "Nghe phát âm Anh-Anh" : `Nghe phát âm ${language?.name || locale}` : "Thiết bị không hỗ trợ giọng đọc này";
  return <div className="pronunciation-tools"><button type="button" className="icon-button" title={label} aria-label={label} disabled={!word || !supported} onClick={pronounce}>
    {speaking ? <VolumeX /> : <Volume2 />}
  </button>{error && <span className="error-text" role="status">{error}</span>}</div>;
}
