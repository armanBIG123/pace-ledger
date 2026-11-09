#!/usr/bin/env bash
# Deploys the server functions that changed (all of them when shared code
# changed or when run by hand). Each function's "Verify JWT" setting comes
# from supabase/config.toml, so a deploy never flips it.
# Usage: functions.sh <commit before the push, or empty for all>
set -euo pipefail
before="${1:-}"
if [ ! -f supabase/config.toml ]; then
  echo "::warning::No supabase/config.toml yet, so no functions were deployed. Run the 'Copy from Supabase' workflow first."
  exit 0
fi

all=()
for d in supabase/functions/*/; do n=$(basename "$d"); [ "$n" = "_shared" ] || all+=("$n"); done

if [ -z "$before" ] || [ "$before" = "0000000000000000000000000000000000000000" ] || ! git cat-file -e "$before" 2>/dev/null; then
  todo=("${all[@]}")
else
  changed=$(git diff --name-only "$before" HEAD -- supabase/functions | cut -d/ -f3 | sort -u)
  if echo "$changed" | grep -qx "_shared"; then todo=("${all[@]}"); else todo=(); for n in $changed; do [ -d "supabase/functions/$n" ] && todo+=("$n"); done; fi
fi
if [ ${#todo[@]} -eq 0 ]; then echo "No server functions changed."; exit 0; fi

for n in "${todo[@]}"; do
  if ! grep -q "^\[functions\.$n\]" supabase/config.toml; then
    echo "::error::supabase/config.toml has no [functions.$n] section. Add it with verify_jwt = true or false (as set in Supabase), then run this again."
    exit 1
  fi
done
for n in "${todo[@]}"; do
  echo "Deploying $n"
  supabase functions deploy "$n" --project-ref "$PROJECT_REF" --use-api
done
