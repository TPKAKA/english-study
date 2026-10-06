import { createAdminHandlers } from "../../../lib/admin-server.js";
import { createSupabaseRequestClient } from "../../../lib/supabase-server.js";

export const runtime = "nodejs";

function handlers() {
  return createAdminHandlers({ env: process.env, createClient: createSupabaseRequestClient });
}

export async function GET(request) { return handlers().GET(request); }
export async function POST(request) { return handlers().POST(request); }
