// commissions-ingest: where Minkoo's commission system sends payouts and
// commission lines (the same JSON it sent InsuraCloud):
//
//   POST https://<project>.supabase.co/functions/v1/commissions-ingest
//   x-api-key: <the key a super admin makes in PaceLedger → Pay → Setup>
//   { "disbursements": [...], "ledgers": [...] }
//
// "ledger" and "carrierCode" (InsuraCloud's spelling) work too. The answer
// is InsuraCloud's shape plus what changed:
//   { "success": true, "disbImported": 3, "ledgerImported": 100, "new": ..., "updated": ..., "unchanged": ..., "rejected": ... }
//
// The key check, storing and matching all happen in the database
// (pl_commission_ingest in migration-commissions.sql), so this only checks
// the request's shape and passes it on.
//
// Deploy with "Verify JWT" turned OFF: Minkoo's system sends the x-api-key,
// not a PaceLedger sign-in.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const env = (k: string, d = ''): string => {
  try { return (typeof Deno !== 'undefined' ? Deno.env.get(k) : undefined) ?? d; } catch { return d; }
};
const SUPABASE_URL = env('SUPABASE_URL');
const SERVICE_ROLE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const MAX_BYTES = 8 * 1024 * 1024;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function handle(req: Request): Promise<Response> {
  if (req.method === 'GET') return json({ ok: true, service: 'PaceLedger commissions', how: 'POST JSON with an x-api-key header' });
  if (req.method !== 'POST') return json({ success: false, error: 'method_not_allowed' }, 405);

  const key = (req.headers.get('x-api-key') || '').trim();
  if (!key) return json({ success: false, error: 'missing_api_key' }, 401);
  if (key.length > 200) return json({ success: false, error: 'invalid_api_key' }, 401);

  const size = Number(req.headers.get('content-length') || '0');
  if (size > MAX_BYTES) return json({ success: false, error: 'too_large', max_bytes: MAX_BYTES }, 413);
  let text = '';
  try { text = await req.text(); } catch { return json({ success: false, error: 'unreadable_body' }, 400); }
  if (text.length > MAX_BYTES) return json({ success: false, error: 'too_large', max_bytes: MAX_BYTES }, 413);
  let body: any;
  try { body = JSON.parse(text); } catch { return json({ success: false, error: 'invalid_json' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ success: false, error: 'expected_an_object', expected: '{ "disbursements": [...], "ledgers": [...] }' }, 400);
  const lines = body.ledgers ?? body.ledger ?? [];
  const disb = body.disbursements ?? [];
  if (!Array.isArray(lines) || !Array.isArray(disb)) return json({ success: false, error: 'expected_arrays', expected: '{ "disbursements": [...], "ledgers": [...] }' }, 400);

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ success: false, error: 'not_configured' }, 500);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc('pl_commission_ingest', { p_key: key, p_body: { disbursements: disb, ledgers: lines } });
  if (error) {
    const m = error.message || '';
    if (/bad_key/.test(m)) return json({ success: false, error: 'invalid_api_key' }, 401);
    if (/no_key/.test(m)) return json({ success: false, error: 'no_key_set_up', hint: 'A PaceLedger super admin makes the key under Pay → Setup.' }, 503);
    if (/too_many/.test(m)) return json({ success: false, error: 'too_many_rows', max_rows: 5000 }, 413);
    if (/bad_body/.test(m)) return json({ success: false, error: 'expected_arrays' }, 400);
    console.error('pl_commission_ingest', m);
    return json({ success: false, error: 'server_error' }, 500);
  }
  return json(data);
}

if (typeof Deno !== 'undefined') Deno.serve(handle);
