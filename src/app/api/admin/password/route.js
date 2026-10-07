import { createPasswordHandlers } from "../../../../lib/admin/admin-password.js";
import { createSupabaseRequestClient } from "../../../../lib/supabase/supabase-server.js";
import { withCookieSession, readJson, sessionJson } from "../../../../lib/auth/session-server.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handlers = () => createPasswordHandlers({ env: process.env, createClient: createSupabaseRequestClient });
export async function GET(request) { return withCookieSession(request, internal => handlers().GET(internal)); }
export async function POST(request) {
  return withCookieSession(request, async internal => {
    let body;
    try { body = await readJson(internal); } catch { return sessionJson({ ok: false }, 400); }
    return handlers().POST(new Request(internal.url, { method: "POST", headers: internal.headers, body: JSON.stringify(body) }));
  });
}
