import { createAuthHandlers } from "../../../../lib/auth/auth-server.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request) { return createAuthHandlers().GET(request); }
export async function POST(request) { return createAuthHandlers().POST(request); }
