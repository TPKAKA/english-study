import { createPracticeHandlers } from "../../../lib/study/practice-server.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request) { return createPracticeHandlers().GET(request); }
export function POST(request) { return createPracticeHandlers().POST(request); }
