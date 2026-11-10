// Every server function's basic replies: the browser's CORS check, a call
// with no sign-in, and the wrong method. These stay the same when code
// moves into supabase/functions/_shared.
import { bundleFunction } from '../tools/bundle.mjs';

Object.assign(process.env, { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', RESEND_API_KEY: 're_test', INVITE_FROM_EMAIL: 'PaceLedger <x@example.com>' });
let failures = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { failures++; console.log('FAIL', m); } };
// Nothing here should reach the network.
globalThis.fetch = async url => { throw new Error(`unexpected fetch ${url}`); };

const BROWSER = ['activity-report', 'chat-notify', 'contracting', 'delete-account', 'google-create-event', 'presenter-availability', 'send-appointment-invite', 'send-intake-link', 'submit-promotion'];
const noCache = h => /no-store/.test(h.get('cache-control') || '');
for (const name of [...BROWSER, 'commissions-ingest']) {
  globalThis.__served = null;
  const mod = await bundleFunction(name);
  const handler = mod.handle || globalThis.__served;
  ok(typeof handler === 'function', `${name}: has a handler`);
  if (BROWSER.includes(name)) {
    const pre = await handler(new Request('https://x/fn', { method: 'OPTIONS' }));
    ok(pre.status === 200 && pre.headers.get('access-control-allow-origin') === '*' && /POST/.test(pre.headers.get('access-control-allow-methods') || '')
      && /authorization/.test(pre.headers.get('access-control-allow-headers') || ''), `${name}: answers the browser's CORS check`);
    const anon = await handler(new Request('https://x/fn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));
    let body = null; try { body = await anon.clone().json(); } catch { /* not JSON */ }
    ok([400, 401, 403].includes(anon.status) && body && noCache(anon.headers) && anon.headers.get('access-control-allow-origin') === '*',
      `${name}: no sign-in gets a JSON ${anon.status}, not cached, readable by the app (${JSON.stringify(body)})`);
  } else {
    const anon = await handler(new Request('https://x/fn', { method: 'POST', body: '{}' }));
    ok(anon.status === 401 && noCache(anon.headers) && !anon.headers.get('access-control-allow-origin'), `${name}: a call without the key gets 401, no CORS`);
  }
}
console.log(failures ? `${failures} FAILED` : 'ALL REPLY CHECKS PASSED');
process.exit(failures ? 1 : 0);
