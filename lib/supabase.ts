import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Faltam as variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
    }
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

// Só cria o cliente na primeira chamada (em runtime), nunca durante o build.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const c = getClient() as any;
    const v = c[prop];
    return typeof v === "function" ? v.bind(c) : v;
  },
});
