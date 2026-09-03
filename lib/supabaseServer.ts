import "server-only";
import { createClient } from "@supabase/supabase-js";

// Public data only; do not bypass row-level security for highlight reads.
export function supabaseServer() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
