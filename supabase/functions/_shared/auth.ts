// Who's calling: the signed-in person from the request's Authorization
// header, or null. (Functions run with Verify JWT off and check this
// themselves, so a missing or expired sign-in gets a clear 401.)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ANON_KEY, SUPABASE_URL } from './env.ts';

export function bearer(req: Request): string {
  const h = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

export async function signedInUser(req: Request): Promise<{ id: string; email?: string; [k: string]: unknown } | null> {
  const jwt = bearer(req);
  if (!jwt) return null;
  const { data, error } = await createClient(SUPABASE_URL, ANON_KEY).auth.getUser(jwt);
  if (error || !data || !data.user) return null;
  return data.user as { id: string; email?: string };
}
