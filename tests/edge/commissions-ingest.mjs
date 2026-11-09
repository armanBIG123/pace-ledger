// The commissions-ingest edge function, with a stand-in for the database call.
import path from 'node:path';
import { bundleFunction } from '../tools/bundle.mjs';
import { REPO, TESTS, OUT } from '../tools/paths.mjs';
const here = path.dirname(new URL(import.meta.url).pathname);
Object.assign(process.env, { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service' });
const E = await bundleFunction('commissions-ingest');
const PL = globalThis.__PL;
let failures = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { failures++; console.log('FAIL', m); } };
const calls = [];
PL.rpc.pl_commission_ingest = args => {
  calls.push(args);
  if (args.p_key !== 'plc_good') throw new Error('bad_key');
  return { success: true, disbImported: args.p_body.disbursements.length, ledgerImported: args.p_body.ledgers.length, new: 1, updated: 0, unchanged: 0, rejected: 0 };
};
const post = (body, headers = {}) => E.handle(new Request('https://x/functions/v1/commissions-ingest', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
const read = async r => ({ status: r.status, body: await r.json() });

let r = await read(await post({ disbursements: [], ledgers: [{ recordId: 'a~A' }] }));
ok(r.status === 401 && r.body.error === 'missing_api_key', 'no key: 401');
r = await read(await post({ disbursements: [], ledgers: [] }, { 'x-api-key': 'plc_bad' }));
ok(r.status === 401 && r.body.error === 'invalid_api_key', 'wrong key: 401');
r = await read(await post({ disbursements: [{ recordId: 'd1' }], ledgers: [{ recordId: 'l1' }, { recordId: 'l2' }] }, { 'x-api-key': 'plc_good' }));
ok(r.status === 200 && r.body.success === true && r.body.disbImported === 1 && r.body.ledgerImported === 2, 'Minkoo\'s format: success, counts like InsuraCloud');
r = await read(await post({ ledger: [{ recordId: 'l1', carrierCode: 'X' }] }, { 'x-api-key': 'plc_good' }));
ok(r.status === 200 && r.body.ledgerImported === 1 && JSON.stringify(calls.at(-1).p_body) === '{"disbursements":[],"ledgers":[{"recordId":"l1","carrierCode":"X"}]}', 'InsuraCloud\'s "ledger" spelling is passed on as ledgers');
r = await read(await post('{not json', { 'x-api-key': 'plc_good' }));
ok(r.status === 400 && r.body.error === 'invalid_json', 'bad JSON: 400');
r = await read(await post([1, 2], { 'x-api-key': 'plc_good' }));
ok(r.status === 400 && r.body.error === 'expected_an_object', 'an array: 400');
r = await read(await post({ ledgers: 'x' }, { 'x-api-key': 'plc_good' }));
ok(r.status === 400 && r.body.error === 'expected_arrays', 'ledgers not a list: 400');
r = await read(await post({}, { 'x-api-key': 'plc_good', 'content-length': String(9 * 1024 * 1024) }));
ok(r.status === 413, 'too big: 413');
r = await read(await E.handle(new Request('https://x/', { method: 'GET' })));
ok(r.status === 200 && r.body.ok === true, 'GET answers, so Minkoo can check the URL');
r = await read(await E.handle(new Request('https://x/', { method: 'PUT', body: '{}' })));
ok(r.status === 405, 'PUT: 405');
PL.rpc.pl_commission_ingest = () => { throw new Error('no_key'); };
r = await read(await post({ ledgers: [] }, { 'x-api-key': 'plc_good' }));
ok(r.status === 503 && r.body.error === 'no_key_set_up', 'no key made yet: says so');
const before = calls.length;
await post({ ledgers: [] }, { 'x-api-key': 'k'.repeat(300) });
ok(calls.length === before, 'a silly-long key never reaches the database');
console.log(failures ? `${failures} FAILED` : 'ALL COMMISSIONS EDGE TESTS PASSED');
process.exit(failures ? 1 : 0);
