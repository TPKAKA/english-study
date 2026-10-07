import { withCookieSession, readJson, sessionJson } from "../auth/session-server.js";
import { createSrsData } from "./srs-data.js";
import { fetchCatalog } from "../content/content-admin.js";
import { reviewSrsCard } from "./srs.js";

export function createSrsHandlers(dependencies = {}) {
  const errorResponse = () => sessionJson({ ok: false, error: "Chưa đồng bộ được lịch ôn. Lịch vẫn được giữ trên thiết bị." }, 503);
  return {
    GET(request) {
      return withCookieSession(request, async (_internal, { client, user }) => {
        if (new URL(request.url).searchParams.get("owner") !== user.id) return sessionJson({ ok: false }, 409);
        try { return sessionJson({ ok: true, rows: await createSrsData(client).loadSrs(user.id) }); }
        catch { return errorResponse(); }
      }, dependencies);
    },
    POST(request) {
      return withCookieSession(request, async (internal, { client, user }) => {
        let body;
        try { body = await readJson(internal, 1024 * 1024); } catch { return sessionJson({ ok: false }, 400); }
        if (body?.owner !== user.id) return sessionJson({ ok: false }, 409);
        if (!Array.isArray(body.rows) || !body.rows.length || body.rows.length > 500) return sessionJson({ ok: false }, 400);
        let words;
        try { words = new Set((await fetchCatalog(client)).words.map(row => row.word)); }
        catch { return errorResponse(); }
        const rows = [], seen = new Set();
        try {
          for (const row of body.rows) {
            if (!words.has(row?.word) || seen.has(row.word) || Date.parse(row.reviewed_at) > Date.now() + 300000 || Date.parse(row.reviewed_at) < Date.UTC(2000, 0, 1)) throw new Error("Invalid review");
            seen.add(row.word);
            rows.push({ word: row.word, rating: row.rating, reviewed_at: row.reviewed_at,
              card: reviewSrsCard(row.previous_card, row.rating, row.reviewed_at) });
          }
        } catch { return sessionJson({ ok: false, error: "Đánh giá ôn tập không hợp lệ." }, 400); }
        try { await createSrsData(client).saveSrs(user.id, rows); return sessionJson({ ok: true }); }
        catch { return errorResponse(); }
      }, dependencies);
    }
  };
}
