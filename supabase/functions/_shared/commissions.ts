// The commission system's webhook (commissions-ingest) and its test
// address (commissions-ingest-test): the same checks and answers. Only the
// database function differs: the test one undoes everything it does.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SERVICE_ROLE_KEY, SUPABASE_URL } from './env.ts';
import { json as reply, NO_CACHE } from './http.ts';

const MAX_BYTES = 8 * 1024 * 1024;

// Called by the commission system, never a browser: no CORS.
const json = (body: unknown, status = 200) => reply(body, status, NO_CACHE);

export function ingestHandler({ rpc, test = false }: { rpc: string; test?: boolean }) {
  return async function handle(req: Request): Promise<Response> {
    if (req.method === 'GET') {
      return json(test
        ? { ok: true, service: 'PaceLedger commissions (test address)', how: 'POST JSON with an x-api-key header (the test key)', saves: 'nothing: answers like the live address, then undoes it' }
        : { ok: true, service: 'PaceLedger commissions', how: 'POST JSON with an x-api-key header' });
    }
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
    const { data, error } = await admin.rpc(rpc, { p_key: key, p_body: { disbursements: disb, ledgers: lines } });
    if (error) {
      const m = error.message || '';
      if (/bad_key/.test(m)) return json({ success: false, error: 'invalid_api_key' }, 401);
      if (/no_test_key/.test(m)) return json({ success: false, error: 'no_test_key_set_up', hint: 'A PaceLedger super admin makes the test key under Pay → Setup.' }, 503);
      if (/no_key/.test(m)) return json({ success: false, error: 'no_key_set_up', hint: 'A PaceLedger super admin makes the key under Pay → Setup.' }, 503);
      if (/too_many/.test(m)) return json({ success: false, error: 'too_many_rows', max_rows: 5000 }, 413);
      if (/bad_body/.test(m)) return json({ success: false, error: 'expected_arrays' }, 400);
      console.error(rpc, m);
      return json({ success: false, error: 'server_error' }, 500);
    }
    return json(data);
  };
}
