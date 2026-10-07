import { createProgressHandlers } from "../../../lib/study/progress-server.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request) { return createProgressHandlers().GET(request); }
export async function POST(request) { return createProgressHandlers().POST(request); }
