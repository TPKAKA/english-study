import { randomBytes, timingSafeEqual } from "node:crypto";
import { parse, serialize } from "cookie";
import { createServerClient } from "@supabase/ssr";
import { readSupabaseConfig } from "../supabase/supabase-config.js";

export const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

export function requestOrigin(request, env = process.env) {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  // Next.js may expose its internal hostname in request.url; Host is the browser's authority.
  if (host) {
    if (/[\s\/@?#\\,]/.test(host)) throw new Error("Invalid host");
  }
  // Vercel sets this forwarding header itself. Do not trust it on arbitrary local servers.
  const protocol = env.VERCEL === "1" && request.headers.get("x-forwarded-proto") === "https" ? "https:" : url.protocol;
  return new URL(protocol + "//" + (host || url.host)).origin;
}

export function sessionNames(config, request, env = process.env) {
  const project = new URL(config.url).hostname.split(".")[0];
  const secure = new URL(requestOrigin(request, env)).protocol === "https:";
  const prefix = secure ? "__Host-" : "";
  return { session: `${prefix}es-${project}`, csrf: `${prefix}es-csrf-${project}`, legacy: `sb-${project}-auth-token`, secure };
}

export function sessionJson(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" } });
}

export async function readJson(request, limit = 65536) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) throw new Error("Invalid content type");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("Body too large");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { await reader.cancel().catch(() => {}); }
}

export function createCookieSession(request, { env = process.env, fetchRequest = globalThis.fetch } = {}) {
  const config = readSupabaseConfig(env);
  const origin = requestOrigin(request, env);
  const names = sessionNames(config, request, env);
  const incoming = parse(request.headers.get("cookie") || "");
  const cookies = new Map(Object.entries(incoming));
  const writes = new Map(), cacheHeaders = {};
  const options = { path: "/", httpOnly: true, secure: names.secure, sameSite: "lax", maxAge: SESSION_MAX_AGE };
  let csrf = /^[a-f0-9]{64}$/.test(incoming[names.csrf] || "") ? incoming[names.csrf] : "";
  const sessionCookie = name => name === names.session || name.startsWith(names.session + ".");

  function write(name, value, maxAge = SESSION_MAX_AGE) {
    writes.set(name, { value, options: { ...options, maxAge } });
    if (maxAge === 0) cookies.delete(name); else cookies.set(name, value);
  }

  const client = createServerClient(config.url, config.publishableKey, {
    cookieOptions: { ...options, name: names.session },
    cookies: {
      getAll: () => Array.from(cookies, ([name, value]) => ({ name, value })),
      setAll(items, headers) {
        for (const { name, value, options: itemOptions } of items) write(name, value, itemOptions.maxAge === 0 ? 0 : SESSION_MAX_AGE);
        Object.assign(cacheHeaders, headers);
      }
    },
    global: { fetch: (input, init) => fetchRequest(input, { ...init, cache: "no-store", signal: init?.signal || AbortSignal.timeout(15000) }) }
  });

  function clear() {
    for (const name of cookies.keys()) if (sessionCookie(name) || name.startsWith(names.session + "-")) write(name, "", 0);
  }

  function csrfToken(rotate = false) {
    if (!csrf || rotate) { csrf = randomBytes(32).toString("hex"); write(names.csrf, csrf); }
    return csrf;
  }

  function checkCsrf() {
    const suppliedOrigin = request.headers.get("origin");
    const site = request.headers.get("sec-fetch-site");
    const supplied = request.headers.get("x-csrf-token") || "";
    return suppliedOrigin === origin && (!site || site === "same-origin") &&
      /^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "") &&
      !!csrf && /^[a-f0-9]{64}$/.test(supplied) && timingSafeEqual(Buffer.from(supplied), Buffer.from(csrf));
  }

  async function identity() {
    if (![...cookies.keys()].some(sessionCookie)) return null;
    const { data, error } = await client.auth.getUser();
    if (error) {
      if ([400, 401, 403].includes(error.status) || error.name === "AuthSessionMissingError") { clear(); return null; }
      throw new Error("Auth temporarily unavailable");
    }
    if (!data?.user || data.user.is_anonymous || !data.user.email_confirmed_at) { clear(); return null; }
    return data.user;
  }

  function finish(response) {
    // Old JavaScript-readable sessions are deliberately retired, not copied into the new trust boundary.
    for (const name of Object.keys(incoming)) {
      if (name === names.legacy || name.startsWith(names.legacy + ".") || name.startsWith(names.legacy + "-")) write(name, "", 0);
    }
    for (const [key, value] of Object.entries(cacheHeaders)) response.headers.set(key, value);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vary", "Cookie");
    for (const [name, item] of writes) response.headers.append("Set-Cookie", serialize(name, item.value, item.options));
    return response;
  }

  return { client, config, names, origin, identity, clear, csrfToken, checkCsrf, finish };
}

export async function withCookieSession(request, handle, dependencies = {}) {
  let session;
  try {
    session = createCookieSession(request, dependencies);
    const user = await session.identity();
    if (!user) return session.finish(sessionJson({ ok: false, canEdit: false, error: "Hãy đăng nhập lại." }, 401));
    if (request.method !== "GET" && !session.checkCsrf()) return session.finish(sessionJson({ ok: false, error: "Yêu cầu không hợp lệ. Hãy tải lại trang." }, 403));
    const { data, error } = await session.client.auth.getSession();
    if (error || !data.session?.access_token) return session.finish(sessionJson({ ok: false, error: "Hãy đăng nhập lại." }, 401));
    // Existing admin checks run on a server-derived JWT, never a browser Authorization header.
    const headers = new Headers(request.headers);
    headers.set("Authorization", "Bearer " + data.session.access_token);
    // Next may proxy Request objects; copying them with native Request breaks its private state.
    const internal = { url: request.url, method: request.method, headers,
      get body() { return request.body; }, json: () => request.json() };
    return session.finish(await handle(internal, { ...session, user }));
  } catch {
    const response = sessionJson({ ok: false, canEdit: false, error: "Chưa kết nối được tài khoản. Hãy thử lại." }, 503);
    return session ? session.finish(response) : response;
  }
}
