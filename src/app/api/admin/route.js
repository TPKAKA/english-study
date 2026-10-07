import { createAdminHandlers } from "../../../lib/admin/admin-server.js";
import { createSupabaseRequestClient } from "../../../lib/supabase/supabase-server.js";
import { withCookieSession, readJson, sessionJson } from "../../../lib/auth/session-server.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function handlers() {
  return createAdminHandlers({ env: process.env, createClient: createSupabaseRequestClient });
}

export async function GET(request) { return withCookieSession(request, internal => handlers().GET(internal)); }
export async function POST(request) {
  return withCookieSession(request, async internal => {
    let body;
    try { body = await readJson(internal, 2 * 1024 * 1024); } catch { return sessionJson({ ok: false, error: "Dữ liệu không hợp lệ hoặc quá lớn." }, 400); }
    return handlers().POST(new Request(internal.url, { method: "POST", headers: internal.headers, body: JSON.stringify(body) }));
  });
}
