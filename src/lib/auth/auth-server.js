import { createCookieSession, readJson, sessionJson, requestOrigin } from "./session-server.js";

const publicUser = user => user ? { id: user.id, email: user.email } : null;
const emailValid = email => typeof email === "string" && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export function createAuthHandlers(dependencies = {}) {
  async function run(request, mutation) {
    let session;
    try {
      session = createCookieSession(request, dependencies);
      const respond = (body, status = 200) => session.finish(sessionJson({ ...body, csrfToken: session.csrfToken() }, status));
      if (!mutation) return respond({ ok: true, user: publicUser(await session.identity()) });
      if (!session.checkCsrf()) return respond({ ok: false, code: "csrf_failed", error: "Yêu cầu không hợp lệ. Hãy cho phép cookie và tải lại trang." }, 403);
      let body;
      try { body = await readJson(request); } catch { return respond({ ok: false, error: "Dữ liệu không hợp lệ." }, 400); }
      if (!body || typeof body !== "object") return respond({ ok: false }, 400);
      const { action, email, password, token } = body;
      let result;
      if (action === "password" && emailValid(email) && typeof password === "string" && password.length > 0 && password.length <= 128) {
        result = await session.client.auth.signInWithPassword({ email, password });
      } else if (action === "send-code" && emailValid(email)) {
        result = await session.client.auth.signInWithOtp({ email, options: { emailRedirectTo: new URL("/api/auth/callback", session.origin).href } });
      } else if (action === "verify-code" && emailValid(email) && typeof token === "string" && /^[0-9]{6,10}$/.test(token)) {
        result = await session.client.auth.verifyOtp({ email, token, type: "email" });
      } else if (action === "password-update" || action === "sign-out") {
        const user = await session.identity();
        if (!user) return respond({ ok: false, error: "Hãy đăng nhập lại." }, 401);
        if (action === "password-update") {
          if (typeof password !== "string" || password.length < 8 || password.length > 128) return respond({ ok: false }, 400);
          result = await session.client.auth.updateUser({ password });
        } else {
          result = await session.client.auth.signOut({ scope: "local" });
          if (!result.error) { session.clear(); session.csrfToken(true); return respond({ ok: true, user: null }); }
        }
      } else return respond({ ok: false, error: "Dữ liệu không hợp lệ." }, 400);
      if (result.error) {
        const code = ["email_not_confirmed", "weak_password", "over_request_rate_limit", "over_email_send_rate_limit"].includes(result.error.code) ? result.error.code : "authentication_failed";
        return respond({ ok: false, code, error: "Không thực hiện được xác thực. Hãy kiểm tra thông tin và thử lại." }, 400);
      }
      if (action === "send-code") return respond({ ok: true });
      const user = await session.identity();
      if (!user) { session.clear(); return respond({ ok: false, error: "Hãy xác thực email trước." }, 401); }
      session.csrfToken(true);
      return respond({ ok: true, user: publicUser(user) });
    } catch {
      const response = sessionJson({ ok: false, error: "Chưa kết nối được tài khoản. Hãy thử lại." }, 503);
      return session ? session.finish(response) : response;
    }
  }
  return { GET: request => run(request, false), POST: request => run(request, true) };
}

export async function handleAuthCallback(request, dependencies = {}) {
  let session;
  const target = new URL("/", requestOrigin(request, dependencies.env));
  try {
    session = createCookieSession(request, dependencies);
    const code = new URL(request.url).searchParams.get("code");
    if (!code || code.length > 4096) throw new Error("Invalid code");
    const { error } = await session.client.auth.exchangeCodeForSession(code);
    if (error || !await session.identity()) throw new Error("Invalid session");
    session.csrfToken(true);
  } catch { target.searchParams.set("auth_error", "retry"); }
  const response = new Response(null, { status: 303, headers: { Location: target.href, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  return session ? session.finish(response) : response;
}
