export function readSupabaseConfig(env, { allowMissing = false } = {}) {
  const url = (env.url_db || "").trim();
  const publishableKey = (env.publishableKey || "").trim();
  if (allowMissing && !url && !publishableKey) return { url: "", publishableKey: "" };

  const missing = [!url && "url_db", !publishableKey && "publishableKey"].filter(Boolean);
  if (missing.length) throw new Error("Missing environment variable(s): " + missing.join(", "));

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("url_db must be the HTTPS Supabase Project URL");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new Error("url_db must be the HTTPS Supabase Project URL, without credentials, query or extra path");
  }

  let publicKey = /^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(publishableKey);
  if (!publicKey && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(publishableKey)) {
    try {
      const payload = publishableKey.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      publicKey = JSON.parse(atob(payload)).role === "anon";
    } catch {}
  }
  if (!publicKey) throw new Error("publishableKey must be a publishable or legacy anon key, never a secret or service_role key");
  return { url: parsed.origin, publishableKey };
}
