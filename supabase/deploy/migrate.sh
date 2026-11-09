#!/usr/bin/env bash
# Runs new database changes (supabase/migrations/*.sql) on the live project,
# in order, and records each one so it never runs twice.
# Called by .github/workflows/supabase-deploy.yml after `supabase link`.
set -euo pipefail
shopt -s nullglob
files=(supabase/migrations/*.sql)
if [ ${#files[@]} -eq 0 ]; then echo "No migrations yet: nothing to run."; exit 0; fi

# The baseline is the live database's layout copied into GitHub: it's
# already true on the live project, so it's recorded as run, never run.
for f in supabase/migrations/*_baseline.sql; do
  v=$(basename "$f" | cut -d_ -f1)
  echo "Recording the baseline $v as already in place."
  supabase migration repair --status applied "$v" --linked
done

echo "Database changes to run:"
supabase migration list --linked
supabase db push --linked --yes
