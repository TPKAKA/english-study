import { readSupabaseConfig } from "./supabase-config.js";

export function readAdminEmail(env) {
  const email = (env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (email && (email.length > 254 || !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email))) throw new Error("ADMIN_EMAIL must be a single valid email address");
  return email;
}

export function privateJson(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });
}

export async function verifyAdminIdentity(request, { env, createClient }) {
  const token = /^Bearer ([^\s]+)$/i.exec(request.headers.get("authorization") || "")?.[1];
  if (!token || token.length > 16384) return { response: privateJson({ ok: false, canEdit: false, error: "Hãy đăng nhập lại để quản lý tài khoản/nội dung." }, 401) };
  let adminEmail, config, client;
  try {
    adminEmail = readAdminEmail(env);
    if (!adminEmail) throw new Error("Missing admin email");
    config = readSupabaseConfig(env);
    client = createClient(config, token);
  } catch {
    return { response: privateJson({ ok: false, canEdit: false, error: "Chưa cấu hình đúng ADMIN_EMAIL hoặc kết nối Supabase trên server." }, 503) };
  }
  let user;
  try {
    // Supabase verifies the JWT; browser-supplied email/metadata is not authority.
    const result = await client.auth.getUser(token);
    if (result.error || !result.data?.user) throw new Error("Invalid session");
    user = result.data.user;
  } catch {
    return { response: privateJson({ ok: false, canEdit: false, error: "Không xác thực được phiên đăng nhập. Hãy thử đăng nhập lại." }, 401) };
  }
  if (!user.email_confirmed_at || user.is_anonymous || user.email?.trim().toLowerCase() !== adminEmail) {
    return { response: privateJson({ ok: false, canEdit: false, error: "Tài khoản này không phải quản trị viên của website." }, 403) };
  }
  return { client, config, token, user };
}
