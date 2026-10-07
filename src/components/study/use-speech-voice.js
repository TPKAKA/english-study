"use client";

import { useEffect, useState } from "react";

export function useSpeechVoice(locale = "en-GB") {
  const [available, setAvailable] = useState(false), [voices, setVoices] = useState([]);
  useEffect(() => {
    if (!("speechSynthesis" in window && "SpeechSynthesisUtterance" in window)) return;
    const synth = window.speechSynthesis;
    const update = () => setVoices(synth.getVoices());
    setAvailable(true); update(); synth.addEventListener?.("voiceschanged", update);
    return () => synth.removeEventListener?.("voiceschanged", update);
  }, []);
  const normalize = value => value.toLowerCase().replace(/_/g, "-");
  const language = normalize(locale);
  const voice = voices.find(item => normalize(item.lang) === language) || voices.find(item => normalize(item.lang).split("-")[0] === language.split("-")[0]);
  return { supported: available && (!!voice || language === "en-gb"), voice };
}
