import { createClient } from "@supabase/supabase-js";
import { createSessionCookieStorage } from "./session-cookie-storage.js";

let client;
let clientConfig;

export function createSupabaseBrowserClient(config, browser = window, fetchRequest = globalThis.fetch) {
  const storageKey = `sb-${new URL(config.url).hostname.split(".")[0]}-auth-token`;
  return createClient(config.url, config.publishableKey, {
    global: { fetch: fetchRequest },
    auth: {
      storageKey, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
      storage: createSessionCookieStorage({
        document: browser.document, secure: browser.location.protocol === "https:", sessionKey: storageKey,
        legacyStorage: () => browser.localStorage
      })
    }
  });
}

export function getSupabaseBrowserClient(config) {
  if (!client || clientConfig.url !== config.url || clientConfig.publishableKey !== config.publishableKey) {
    client = createSupabaseBrowserClient(config);
    clientConfig = config;
  }
  return client;
}
