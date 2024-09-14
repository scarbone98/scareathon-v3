import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_API_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase URL or API key is not set");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
