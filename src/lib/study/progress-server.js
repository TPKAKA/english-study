import { withCookieSession, readJson, sessionJson } from "../auth/session-server.js";
import { createStudyData } from "./study-data.js";
import { toStudyContent } from "../content/content-admin.js";
import { gradeReading } from "./quiz.js";
import { cardId } from "./languages.js";

const timestamp = value => typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);

export function createProgressHandlers(dependencies = {}) {
  return {
    GET(request) {
      return withCookieSession(request, async (_internal, { client, user }) => {
        if (new URL(request.url).searchParams.get("owner") !== user.id) return sessionJson({ ok: false, error: "Phiên đăng nhập đã thay đổi." }, 409);
        return sessionJson({ ok: true, ...await createStudyData(client).loadProgress(user.id) });
      }, dependencies);
    },
    POST(request) {
      return withCookieSession(request, async (internal, { client, user }) => {
        let body;
        try { body = await readJson(internal, 1024 * 1024); } catch { return sessionJson({ ok: false }, 400); }
        if (body?.owner !== user.id) return sessionJson({ ok: false, error: "Phiên đăng nhập đã thay đổi." }, 409);
        if (!["words", "attempts"].includes(body.type) || !Array.isArray(body.rows) || !body.rows.length || body.rows.length > 500) return sessionJson({ ok: false }, 400);
        const repository = createStudyData(client);
        const catalog = await repository.getCatalog();
        const words = new Set(catalog.words.map(cardId));
        const readings = toStudyContent(catalog).readings;
        const rows = [], seen = new Set();
        for (const row of body.rows) {
          if (!row || typeof row !== "object") return sessionJson({ ok: false }, 400);
          if (body.type === "words") {
            if (!words.has(row.word) || typeof row.is_known !== "boolean" || !timestamp(row.updated_at) || seen.has(row.word)) return sessionJson({ ok: false }, 400);
            seen.add(row.word);
            rows.push({ word: row.word, is_known: row.is_known, updated_at: row.updated_at });
          } else {
            const reading = readings.find(item => item.id === row.reading_id);
            const grade = reading && gradeReading(reading, row.answers);
            if (!uuid(row.id) || !grade || !timestamp(row.completed_at) || seen.has(row.id)) return sessionJson({ ok: false }, 400);
            seen.add(row.id);
            rows.push({ id: row.id, reading_id: row.reading_id, answers: row.answers, ...grade, completed_at: row.completed_at });
          }
        }
        if (body.type === "words") await repository.saveWords(user.id, rows);
        else await repository.saveAttempts(user.id, rows);
        return sessionJson({ ok: true });
      }, dependencies);
    }
  };
}
