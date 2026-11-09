#!/usr/bin/env bash
# One time (or any time you want to check): copies what's live in Supabase
# into the repo, so GitHub holds everything:
#   - the database layout (every table, view, function, trigger and
#     security rule in the public schema) as supabase/migrations/<time>_baseline.sql;
#   - every server function's code into supabase/functions/<name>/
#     (functions already in the repo are overwritten, so the pull request
#     shows any difference between GitHub and what's live);
#   - each function's Verify JWT setting into supabase/config.toml.
# Called by .github/workflows/supabase-sync.yml after `supabase link`.
set -euo pipefail
stamp=$(date -u +%Y%m%d%H%M%S)
mkdir -p supabase/migrations supabase/functions

# 1. The database layout, unless a baseline is already there.
if ls supabase/migrations/*_baseline.sql >/dev/null 2>&1; then
  echo "A baseline is already in supabase/migrations; not dumping again."
else
  supabase db dump --linked -f "supabase/migrations/${stamp}_baseline.sql"
  echo "Saved the database layout: supabase/migrations/${stamp}_baseline.sql"
fi

# 2. The functions and their settings, from the Management API.
curl -fsS -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/functions" > /tmp/all-functions.json
# Only the functions that are live (not removed).
node -e 'const a = JSON.parse(require("fs").readFileSync("/tmp/all-functions.json", "utf8")); require("fs").writeFileSync("/tmp/functions.json", JSON.stringify(a.filter(f => f.status !== "REMOVED")));'

{
  echo "# Supabase settings for the PaceLedger project (made by supabase/deploy/sync.sh)."
  echo "# verify_jwt = false: the function checks callers itself (webhooks, OAuth"
  echo "# returns, the hourly email job). Deploys keep each function's setting."
  echo 'project_id = "pace-ledger"'
  node -e '
    const fns = JSON.parse(require("fs").readFileSync("/tmp/functions.json", "utf8"));
    for (const f of fns.sort((a, b) => a.slug.localeCompare(b.slug))) {
      console.log(`\n[functions.${f.slug}]\nverify_jwt = ${f.verify_jwt === false ? "false" : "true"}`);
    }'
} > supabase/config.toml
for slug in $(node -e 'for (const f of JSON.parse(require("fs").readFileSync("/tmp/functions.json","utf8"))) console.log(f.slug)'); do
  echo "Copying function $slug"
  supabase functions download "$slug" --project-ref "$PROJECT_REF" --use-api
done
# Keep line endings the same as the rest of the repo.
find supabase/functions -type f \( -name '*.ts' -o -name '*.js' -o -name '*.json' \) -exec sed -i 's/\r$//' {} +
echo "Done: $(node -e 'console.log(JSON.parse(require("fs").readFileSync("/tmp/functions.json","utf8")).length)') functions."
