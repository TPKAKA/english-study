import { readSupabaseConfig } from "./supabase-config.js";
import { contentError, fetchCatalog, mutateContent } from "./content-admin.js";

export function readAdminEmail(env) {
  const email = (env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (email && (email.length > 254 || !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email))) {
    throw new Error("ADMIN_EMAIL must be a single valid email address");
  }
  return email;
}

function json(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });
}

export function createAdminHandlers({ env, createClient }) {
  async function authorize(request) {
    const token = /^Bearer ([^\s]+)$/i.exec(request.headers.get("authorization") || "")?.[1];
    if (!token || token.length > 16384) return { response: json({ ok: false, canEdit: false, error: "Hãy đăng nhập lại để quản lý nội dung." }, 401) };
    let adminEmail, client;
    try {
      adminEmail = readAdminEmail(env);
      if (!adminEmail) throw new Error("Missing admin email");
      client = createClient(readSupabaseConfig(env), token);
    } catch {
      return { response: json({ ok: false, canEdit: false, error: "Chưa cấu hình đúng ADMIN_EMAIL hoặc kết nối Supabase trên server." }, 503) };
    }
    let user;
    try {
      // Validate with Supabase Auth; never trust an email/role supplied by the browser.
      const result = await client.auth.getUser(token);
      if (result.error || !result.data?.user) throw new Error("Invalid session");
      user = result.data.user;
    } catch {
      return { response: json({ ok: false, canEdit: false, error: "Không xác thực được phiên đăng nhập. Hãy thử đăng nhập lại." }, 401) };
    }
    if (!user.email_confirmed_at || user.is_anonymous || user.email?.trim().toLowerCase() !== adminEmail) {
      return { response: json({ ok: false, canEdit: false, error: "Tài khoản này không phải quản trị viên của website." }, 403) };
    }
    try {
      const result = await client.from("content_editors").select("user_id").eq("user_id", user.id).limit(1)
        .abortSignal(AbortSignal.timeout(15000));
      if (result.error) return { response: json({ ok: false, canEdit: false, error: contentError(result.error) }, 503) };
      if (!result.data?.length) return { response: json({ ok: false, canEdit: false, error: "Email quản trị chưa được cấp quyền trong content_editors trên Supabase." }, 403) };
    } catch {
      return { response: json({ ok: false, canEdit: false, error: "Chưa kiểm tra được quyền Supabase. Hãy thử lại." }, 503) };
    }
    return { client };
  }

  return {
    async GET(request) {
      const access = await authorize(request);
      return access.response || json({ ok: true, canEdit: true });
    },
    async POST(request) {
      const access = await authorize(request);
      if (access.response) return access.response;
      let change;
      try { change = await request.json(); } catch { return json({ ok: false, error: "Nội dung gửi lên không hợp lệ." }, 400); }
      if (!change || !["words", "groups", "readings"].includes(change.entity) || !["create", "update", "delete"].includes(change.action)
        || (change.action !== "delete" && (!change.draft || typeof change.draft !== "object" || Array.isArray(change.draft)))) {
        return json({ ok: false, error: "Thao tác hoặc nội dung không hợp lệ." }, 400);
      }
      let catalog;
      try { catalog = await fetchCatalog(access.client); }
      catch { return json({ ok: false, error: "Chưa tải được nội dung Supabase. Hãy thử lại." }, 503); }
      try {
        await mutateContent(access.client, change, catalog);
        return json({ ok: true });
      } catch (error) {
        return json({ ok: false, error: error.message || "Không lưu được thay đổi." }, 400);
      }
    }
  };
}
