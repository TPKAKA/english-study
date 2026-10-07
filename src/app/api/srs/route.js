import { createSrsHandlers } from "../../../lib/study/srs-server.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request) { return createSrsHandlers().GET(request); }
export function POST(request) { return createSrsHandlers().POST(request); }
