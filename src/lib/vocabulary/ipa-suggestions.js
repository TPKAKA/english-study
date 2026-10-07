import { BRITISH_IPA } from "../study/pronunciation.js";
import { readJson } from "../auth/session-server.js";
import { IPA_BATCH_SIZE } from "./ipa-review.js";

export { IPA_BATCH_SIZE } from "./ipa-review.js";
const DICTIONARY_URL = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const normalize = word => word.trim().replace(/\s+/g, " ").toLowerCase();

export function validateIpaWords(words) {
  if (!Array.isArray(words) || !words.length || words.length > IPA_BATCH_SIZE || words.some(word =>
    typeof word !== "string" || !word.trim() || word.length > 200)) {
    throw new Error(`Mỗi lượt tra tối đa ${IPA_BATCH_SIZE} từ/cụm từ, mỗi từ tối đa 200 ký tự.`);
  }
  if (words.some(word => !/^[\p{L}\p{M}\p{N} '’.,&+()/:-]+$/u.test(word) || /^(?:https?:|\/|\.\.\/)/i.test(word.trim()))) {
    throw new Error("Từ cần tra không hợp lệ. Không dùng URL hoặc ký tự điều khiển.");
  }
  return words.map(word => word.trim());
}

function cleanIpa(text) {
  if (typeof text !== "string") return "";
  const ipa = text.trim().replace(/^\/+|\/+$/g, "");
  if (!ipa || ipa.length > 498 || /[\p{Cc}<>]/u.test(ipa)) return "";
  return `/${ipa}/`;
}

function accentFromAudio(audio) {
  if (typeof audio !== "string") return "unknown";
  try {
    const url = new URL(audio, "https://api.dictionaryapi.dev");
    if (url.protocol !== "https:") return "unknown";
    if (/(?:-uk|_gb_)\d*\.mp3$/i.test(url.pathname)) return "uk";
    if (/(?:-us|_us_)\d*\.mp3$/i.test(url.pathname)) return "us";
  } catch { /* Missing audio does not establish an accent. */ }
  return "unknown";
}

export function dictionaryIpaCandidates(entries, word) {
  if (!Array.isArray(entries)) return [];
  const candidates = [];
  for (const entry of entries.slice(0, 30)) {
    if (typeof entry?.word !== "string" || normalize(entry.word) !== normalize(word)) continue;
    for (const phonetic of (Array.isArray(entry.phonetics) ? entry.phonetics.slice(0, 30) : [])) {
      const ipa = cleanIpa(phonetic?.text);
      if (ipa) candidates.push({ ipa, accent: accentFromAudio(phonetic.audio), source: "dictionary" });
    }
    const ipa = cleanIpa(entry.phonetic);
    if (ipa && !candidates.some(candidate => candidate.ipa === ipa)) candidates.push({ ipa, accent: "unknown", source: "dictionary" });
  }
  const rank = { uk: 0, unknown: 1, us: 2 };
  return candidates.filter((candidate, index) => candidates.findIndex(other => other.ipa === candidate.ipa && other.accent === candidate.accent) === index)
    .sort((a, b) => rank[a.accent] - rank[b.accent]).slice(0, 8);
}

export function createIpaLookup({ fetchRequest = globalThis.fetch, now = Date.now, timeoutMs = 5000, cacheSize = 500 } = {}) {
  const cache = new Map();
  async function lookup(word) {
    const key = normalize(word);
    if (Object.hasOwn(BRITISH_IPA, key)) return { status: "found", candidates: [{ ipa: BRITISH_IPA[key], accent: "uk", source: "starter" }] };
    const cached = cache.get(key);
    if (cached && cached.expires > now()) return cached.result;
    cache.delete(key);
    let result;
    try {
      const response = await fetchRequest(DICTIONARY_URL + encodeURIComponent(key), {
        headers: { Accept: "application/json" }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(timeoutMs)
      });
      if (response.status === 404) { await response.body?.cancel(); result = { status: "not-found", candidates: [] }; }
      else {
        if (!response.ok) { await response.body?.cancel(); throw new Error("Dictionary unavailable"); }
        const entries = await readJson(response, 128 * 1024);
        if (!Array.isArray(entries)) throw new Error("Invalid dictionary response");
        const candidates = dictionaryIpaCandidates(entries, key);
        result = { status: candidates.length ? "found" : "not-found", candidates };
      }
    } catch { return { status: "unavailable", candidates: [] }; }
    if (cache.size >= cacheSize) cache.delete(cache.keys().next().value);
    cache.set(key, { result, expires: now() + (result.status === "found" ? 3600000 : 600000) });
    return result;
  }
  return async words => {
    const valid = validateIpaWords(words);
    const keys = [...new Set(valid.map(normalize))];
    const results = new Map();
    let index = 0;
    // Bound upstream concurrency so a large import does not flood the dictionary.
    await Promise.all(Array.from({ length: Math.min(4, keys.length) }, async () => {
      while (index < keys.length) { const key = keys[index++]; results.set(key, await lookup(key)); }
    }));
    return valid.map(word => ({ word, ...results.get(normalize(word)) }));
  };
}
