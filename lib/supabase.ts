import { createClient } from "@supabase/supabase-js";

// These are public client-side values; data access is enforced by
// Row Level Security policies in the database (see supabase/setup.sql).
export const SUPABASE_URL = "https://wiuvciwquwijbxmeuiex.supabase.co";
export const SUPABASE_KEY = "sb_publishable_zHIuKEru3Nv8Nb5iFtWFFw_YDCTAP-g";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
