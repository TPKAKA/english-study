import { createClient } from "@supabase/supabase-js";

export function createSupabaseRequestClient(config, token, fetchRequest = globalThis.fetch) {
  // Never share a session-bearing client between server requests.
  return createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: token ? { Authorization: "Bearer " + token } : {},
      fetch: (input, init) => fetchRequest(input, { ...init, cache: "no-store", signal: init?.signal || AbortSignal.timeout(15000) })
    }
  });
}
