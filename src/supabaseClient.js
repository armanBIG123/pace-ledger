import { createClient } from '@supabase/supabase-js';
import { systemScope } from './lib/systemScope.js';

// This is your project's public/"publishable" key — it's designed to be
// embedded in client-side code. It has no power on its own; access is
// controlled entirely by the Row Level Security policies in
// supabase-schema.sql. Nothing sensitive is exposed by shipping this in
// the built site.
const SUPABASE_URL = 'https://ifiqjixvvexaiooozjaa.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_81KcqnQ8_GB9QnCIDwDAcg_D7bLj7zc';

// A super admin on another solar system's tab in Org Chart or Manage Team:
// database requests ask for that solar system (see lib/systemScope.js).
// Only database requests: sign-in, files and functions are left alone.
function scopedFetch(input, init = {}) {
  const s = systemScope();
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  if (!s || !url.includes('/rest/v1/')) return fetch(input, init);
  const headers = new Headers(init.headers || (typeof input === 'object' && input.headers) || {});
  headers.set('x-pl-system', s);
  return fetch(input, { ...init, headers });
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { fetch: scopedFetch } });
