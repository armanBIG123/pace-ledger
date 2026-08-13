import { createClient } from '@supabase/supabase-js';

// This is your project's public/"publishable" key — it's designed to be
// embedded in client-side code. It has no power on its own; access is
// controlled entirely by the Row Level Security policies in
// supabase-schema.sql. Nothing sensitive is exposed by shipping this in
// the built site.
const SUPABASE_URL = 'https://ifiqjixvvexaiooozjaa.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_81KcqnQ8_GB9QnCIDwDAcg_D7bLj7zc';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
