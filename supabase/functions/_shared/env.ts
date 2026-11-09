// A setting (secret) from Supabase -> Edge Functions -> Secrets, or the
// fallback. Safe to call outside Deno (the tests run these files in Node).
export const env = (k: string, d = ''): string => {
  try { return (typeof Deno !== 'undefined' ? Deno.env.get(k) : undefined) ?? d; } catch { return d; }
};

export const SUPABASE_URL = env('SUPABASE_URL');
export const SERVICE_ROLE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
export const ANON_KEY = env('SUPABASE_ANON_KEY');
// The site the emails link to.
export const APP_URL = env('APP_URL', 'https://big-pace-ledger.com').replace(/\/+$/, '');
