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

// Deploy: merging to main deploys it (.github/workflows/supabase-deploy.yml).
// It uses ../_shared, so it can't be pasted into the Supabase editor.

import { ingestHandler } from '../_shared/commissions.ts';

export const handle = ingestHandler({ rpc: 'pl_commission_ingest' });

if (typeof Deno !== 'undefined') Deno.serve(handle);
