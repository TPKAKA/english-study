import { withCookieSession, readJson, sessionJson } from "../auth/session-server.js";
import { fetchCatalog, toStudyContent } from "../content/content-admin.js";
import { createPracticeData } from "./practice-data.js";
import { gradePracticeAnswer, normalizePracticeRecords } from "./typing-practice.js";
import { cardId, cardMeta } from "./languages.js";

export function createPracticeHandlers(dependencies = {}) {
  const unavailable = () => sessionJson({ ok: false, error: "Chưa đồng bộ được luyện gõ. Kết quả vẫn được giữ trên thiết bị." }, 503);
  return {
    GET(request) {
      return withCookieSession(request, async (_internal, { client, user }) => {
        if (new URL(request.url).searchParams.get("owner") !== user.id) return sessionJson({ ok: false }, 409);
        try { return sessionJson({ ok: true, rows: await createPracticeData(client).loadPractice(user.id) }); }
        catch { return unavailable(); }
      }, dependencies);
    },
    POST(request) {
      return withCookieSession(request, async (internal, { client, user }) => {
        let body;
        try { body = await readJson(internal, 1024 * 1024); } catch { return sessionJson({ ok: false }, 400); }
        if (body?.owner !== user.id) return sessionJson({ ok: false }, 409);
        if (!Array.isArray(body.rows) || !body.rows.length || body.rows.length > 500) return sessionJson({ ok: false }, 400);
        let catalog;
        try { catalog = await fetchCatalog(client); } catch { return unavailable(); }
        const words = new Map(toStudyContent(catalog).groups.flatMap(group => group.w).map(card => [cardId(card), card]));
        const rows = [], seen = new Set();
        for (const input of body.rows) {
          const record = Object.values(normalizePracticeRecords([input]))[0];
          const card = record && words.get(record.word);
          // Explicit cloze answers may be inflected; legacy literal cloze remains valid after example edits.
          const mode = card && record.mode === "cloze" && cardMeta(card).cloze_answer ? "cloze" : "meaning";
          const grade = card && gradePracticeAnswer(card, mode, record.last_answer);
          if (!record || !grade || seen.has(record.word) || Date.parse(record.answered_at) < Date.UTC(2000, 0, 1)
            || Date.parse(record.answered_at) > Date.now() + 300000) return sessionJson({ ok: false, error: "Kết quả luyện gõ không hợp lệ." }, 400);
          seen.add(record.word);
          rows.push({ ...record, needs_retry: !grade.correct });
        }
        try { await createPracticeData(client).savePractice(user.id, rows); return sessionJson({ ok: true }); }
        catch { return unavailable(); }
      }, dependencies);
    }
  };
}
