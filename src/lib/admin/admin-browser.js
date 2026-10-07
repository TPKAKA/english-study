async function requestAuthenticated(client, path, change, fetchRequest) {
  try {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session?.user) return { ok: false, canEdit: false, error: "Hãy đăng nhập lại để quản lý nội dung." };
    return await client.request(path, change, fetchRequest);
  } catch (error) {
    return { ok: false, canEdit: false, error: error.public ? error.message : "Không kết nối được API quản trị. Kiểm tra mạng và thử lại." };
  }
}

export function requestAdmin(client, change, fetchRequest = globalThis.fetch) {
  return requestAuthenticated(client, "/api/admin", change, fetchRequest);
}

export function requestDefaultPassword(client, apply = false, fetchRequest = globalThis.fetch) {
  return requestAuthenticated(client, "/api/admin/password", apply ? { confirm: true } : undefined, fetchRequest);
}

export function requestIpaSuggestions(client, words, fetchRequest = globalThis.fetch) {
  return requestAuthenticated(client, "/api/admin/ipa", { words }, fetchRequest);
}
