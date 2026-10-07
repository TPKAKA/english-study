import { readSupabaseConfig } from "../../../lib/supabase/supabase-config.js";
import { createSupabaseRequestClient } from "../../../lib/supabase/supabase-server.js";
import { fetchCatalog } from "../../../lib/content/content-admin.js";
import { sessionJson } from "../../../lib/auth/session-server.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const config = readSupabaseConfig(process.env);
    return sessionJson({ ok: true, catalog: await fetchCatalog(createSupabaseRequestClient(config)) });
  } catch { return sessionJson({ ok: false, error: "Chưa tải được bài học." }, 503); }
}
