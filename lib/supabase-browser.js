import { createClient } from "@supabase/supabase-js";

let client;
let clientConfig;

export function getSupabaseBrowserClient(config) {
  if (!client || clientConfig.url !== config.url || clientConfig.publishableKey !== config.publishableKey) {
    client = createClient(config.url, config.publishableKey);
    clientConfig = config;
  }
  return client;
}
