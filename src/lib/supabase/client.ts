import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./env";

/** Cliente Supabase para Client Components (sessão via cookies). */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
