export const IPA_BATCH_SIZE = 20;
const key = word => word.trim().toLowerCase();

export function ipaCandidateLabel(candidate) {
  const accent = candidate.accent === "uk" ? "UK" : candidate.accent === "us" ? "US" : "Chưa rõ giọng";
  return `${candidate.ipa} · ${accent}`;
}

export function missingImportIpa(preview, catalog) {
  return (preview?.prepared || []).filter(({ row, status }) => status !== "skip" && (catalog.groups.find(group => group.id === row.group_id)?.language_code || "en") === "en" && !row.ipa.trim() && !catalog.words.find(old => (!(catalog.multilingual ?? !!catalog.languages) || old.group_id === row.group_id) && key(old.word) === key(row.word))?.ipa?.trim())
    .map(({ row }) => row.word);
}

export function applyImportIpa(rows, preview, catalog, suggestions) {
  const eligible = new Set(missingImportIpa(preview, catalog).map(key));
  return rows.map(row => {
    const ipa = suggestions.get(key(row.word));
    return eligible.has(key(row.word)) && !row.ipa?.trim() && typeof ipa === "string" && ipa.trim()
      ? { ...row, ipa } : row;
  });
}
