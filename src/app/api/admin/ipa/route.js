import { createIpaHandlers } from "../../../../lib/admin/ipa-server.js";
import { withCookieSession } from "../../../../lib/auth/session-server.js";
import { createSupabaseRequestClient } from "../../../../lib/supabase/supabase-server.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handlers = createIpaHandlers({ env: process.env, createClient: createSupabaseRequestClient });

export function POST(request) {
  return withCookieSession(request, internal => handlers.POST(internal));
}
