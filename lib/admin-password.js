import { privateJson as json, verifyAdminIdentity } from "./admin-auth.js";

export function readAdminPassword(env) {
  const password = env.ADMIN_PASSWORD || "";
  if (password && (password.length < 8 || password.length > 128)) throw new Error("Invalid ADMIN_PASSWORD configuration");
  return password;
}

export function createPasswordHandlers({ env, createClient, fetchRequest = globalThis.fetch }) {
  async function authorize(request) {
    const access = await verifyAdminIdentity(request, { env, createClient });
    if (access.response) return access;
    try { return { ...access, password: readAdminPassword(env) }; }
    catch { return { response: json({ ok: false, error: "ADMIN_PASSWORD cần từ 8 đến 128 ký tự." }, 503) }; }
  }
  return {
    async GET(request) {
      const access = await authorize(request);
      return access.response || json({ ok: true, enabled: !!access.password });
    },
    async POST(request) {
      const access = await authorize(request);
      if (access.response) return access.response;
      if (!access.password) return json({ ok: false, error: "Chưa cấu hình ADMIN_PASSWORD trên server." }, 503);
      let body;
      try { body = await request.json(); } catch { return json({ ok: false, error: "Yêu cầu không hợp lệ." }, 400); }
      if (body?.confirm !== true) return json({ ok: false, error: "Cần xác nhận đặt mật khẩu mặc định." }, 400);
      try {
        // Update the verified caller's own Auth account, not an admin override.
        // The stateless server SDK has no refresh session; use its Auth HTTP endpoint.
        const response = await fetchRequest(access.config.url + "/auth/v1/user", {
          method: "PUT", headers: { Authorization: "Bearer " + access.token, apikey: access.config.publishableKey, "Content-Type": "application/json" },
          body: JSON.stringify({ password: access.password }), cache: "no-store", signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) return json({ ok: false, error: "Supabase chưa chấp nhận mật khẩu. Hãy xác thực email lại và kiểm tra chính sách mật khẩu." }, 400);
        return json({ ok: true });
      } catch { return json({ ok: false, error: "Chưa xác nhận được kết quả. Hãy thử đăng nhập bằng mật khẩu trước khi đặt lại." }, 503); }
    }
  };
}
