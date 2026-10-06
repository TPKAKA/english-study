async function requestAuthenticated(client, path, change, fetchRequest) {
  try {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session?.access_token) return { ok: false, canEdit: false, error: "Hãy đăng nhập lại để quản lý nội dung." };
    const response = await fetchRequest(path, {
      method: change ? "POST" : "GET", cache: "no-store",
      headers: { Authorization: "Bearer " + data.session.access_token, ...(change ? { "Content-Type": "application/json" } : {}) },
      ...(change ? { body: JSON.stringify(change) } : {}), signal: AbortSignal.timeout(60000)
    });
    const result = await response.json();
    if (!response.ok || result.ok !== true) return { ok: false, canEdit: false, error: result.error || "Chưa kiểm tra được quyền quản lý. Hãy thử lại." };
    return result;
  } catch {
    return { ok: false, canEdit: false, error: "Không kết nối được API quản trị. Kiểm tra mạng và thử lại." };
  }
}

export function requestAdmin(client, change, fetchRequest = globalThis.fetch) {
  return requestAuthenticated(client, "/api/admin", change, fetchRequest);
}

export function requestDefaultPassword(client, apply = false, fetchRequest = globalThis.fetch) {
  return requestAuthenticated(client, "/api/admin/password", apply ? { confirm: true } : undefined, fetchRequest);
}
