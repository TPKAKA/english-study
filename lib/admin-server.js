import { contentError, fetchCatalog, mutateContent } from "./content-admin.js";
import { importVocabulary } from "./vocabulary-import.js";
import { privateJson as json, verifyAdminIdentity } from "./admin-auth.js";
export { readAdminEmail } from "./admin-auth.js";

export function createAdminHandlers({ env, createClient }) {
  async function authorize(request) {
    const identity = await verifyAdminIdentity(request, { env, createClient });
    if (identity.response) return identity;
    const { user, client } = identity;
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
      const importing = change?.action === "import" && change.entity === "words";
      if (!change || !["words", "groups", "readings"].includes(change.entity) || (!importing && !["create", "update", "delete"].includes(change.action))
        || (!importing && change.action !== "delete" && (!change.draft || typeof change.draft !== "object" || Array.isArray(change.draft)))) {
        return json({ ok: false, error: "Thao tác hoặc nội dung không hợp lệ." }, 400);
      }
      let catalog;
      try { catalog = await fetchCatalog(access.client); }
      catch { return json({ ok: false, error: "Chưa tải được nội dung Supabase. Hãy thử lại." }, 503); }
      try {
        if (importing) return json({ ok: true, ...await importVocabulary(access.client, change, catalog) });
        await mutateContent(access.client, change, catalog);
        return json({ ok: true });
      } catch (error) {
        return json({ ok: false, error: error.message || "Không lưu được thay đổi." }, 400);
      }
    }
  };
}
