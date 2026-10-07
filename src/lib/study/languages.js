export const DEFAULT_LANGUAGES = Object.freeze([
  { code: "en", name: "Tiếng Anh", speech_locale: "en-GB", pronunciation_mode: "ipa", sort_order: 0 },
  { code: "ko", name: "Tiếng Hàn", speech_locale: "ko-KR", pronunciation_mode: "reading", sort_order: 1 }
]);

// The original four vocabulary columns stay compatible; named metadata carries the stable ID.
export const cardId = card => Array.isArray(card) ? card[4]?.id || card[0] : card.id || card.word;
export const cardMeta = card => Array.isArray(card) ? card[4] || {} : card;
export const cardLanguage = card => cardMeta(card).language_code || "en";
export const cardPronunciation = card => (cardMeta(card).pronunciation_mode || (cardLanguage(card) === "en" ? "ipa" : "reading")) === "ipa" ? card[3] : cardMeta(card).reading || card[3];
export const normalizedWord = value => value.trim().toLowerCase();

export function languagesFor(content) {
  return content.languages ?? [DEFAULT_LANGUAGES[0]];
}

export function languageContent(content, code) {
  return { ...content, groups: content.groups.filter(group => (group.language_code || "en") === code),
    readings: content.readings.filter(reading => (reading.language_code || "en") === code) };
}

export function speechLanguage(content, code) {
  return languagesFor(content).find(language => language.code === code) || DEFAULT_LANGUAGES.find(language => language.code === code) || DEFAULT_LANGUAGES[0];
}
