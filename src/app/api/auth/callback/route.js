import { handleAuthCallback } from "../../../../lib/auth/auth-server.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request) { return handleAuthCallback(request); }
