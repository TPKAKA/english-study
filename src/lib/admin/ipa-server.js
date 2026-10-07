import { createAdminHandlers } from "./admin-server.js";
import { privateJson } from "./admin-auth.js";
import { readJson } from "../auth/session-server.js";
import { createIpaLookup, validateIpaWords } from "../vocabulary/ipa-suggestions.js";

export function createIpaHandlers({ env, createClient, lookup = createIpaLookup() }) {
  const admin = createAdminHandlers({ env, createClient });
  return {
    async POST(request) {
      const permission = await admin.GET(request);
      if (!permission.ok) return permission;
      let body, words;
      try { body = await readJson(request, 16384); }
      catch { return privateJson({ ok: false, error: "Danh sách từ không hợp lệ." }, 400); }
      try { words = validateIpaWords(body?.words); }
      catch (error) { return privateJson({ ok: false, error: error.message }, 400); }
      try { return privateJson({ ok: true, results: await lookup(words) }); }
      catch { return privateJson({ ok: false, error: "Chưa tra được IPA. Hãy thử lại hoặc nhập phiên âm thủ công." }, 503); }
    }
  };
}
