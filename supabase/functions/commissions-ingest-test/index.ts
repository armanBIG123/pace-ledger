// commissions-ingest-test: the commission system's test address. Send fake
// data here to check it works: the same JSON, checks and answer as the
// live address (commissions-ingest), plus "test": true and "saved": false.
// Nothing is kept, so fake data never reaches anyone's pay.
//
//   POST https://<project>.supabase.co/functions/v1/commissions-ingest-test
//   x-api-key: <the TEST key a super admin makes in PaceLedger → Pay → Setup>
//
// The live key doesn't work here, and the test key doesn't work on the live
// address. pl_commission_ingest_test (supabase/migrations/…_commission_test_address.sql)
// runs the real import and undoes it.
//
// Verify JWT is off (supabase/config.toml): the commission system sends the
// x-api-key, not a PaceLedger sign-in.
// Deploy: merging to main deploys it (.github/workflows/supabase-deploy.yml).

import { ingestHandler } from '../_shared/commissions.ts';

export const handle = ingestHandler({ rpc: 'pl_commission_ingest_test', test: true });

if (typeof Deno !== 'undefined') Deno.serve(handle);
