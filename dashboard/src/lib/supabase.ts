import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { IS_DEMO, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/** Null in demo mode: the dashboard runs entirely on sample data. */
export const supabase: SupabaseClient | null =
  !IS_DEMO && SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
