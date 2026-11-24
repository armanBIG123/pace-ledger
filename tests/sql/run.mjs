// Database tests: each suite gets a fresh database with just enough of
// Supabase (roles, auth.uid(), a few tables) to run a migration from the
// repo, then checks what it does, signed in as different people.
// Needs Postgres 16 and psql; connection from PGHOST, PGPORT, PGUSER
// (and PGPASSWORD). Usage: node tests/sql/run.mjs [suite name]
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { REPO, TESTS } from '../tools/paths.mjs';

const here = path.join(TESTS, 'sql');
const S = f => path.join(here, f);
const M = f => path.join(REPO, f);
const SUITES = {
  'manage-team': { setup: [S('stubs/base.sql'), M('migration-manage-team-edits.sql')], test: S('manage-team.sql') },
  // The activity tools migration runs twice: it must be safe to run again.
  'activity-tools': { setup: [S('stubs/base.sql'), M('migration-manage-team-edits.sql'),
    M('supabase/migrations/20261118200000_activity_tools.sql'), M('supabase/migrations/20261118200000_activity_tools.sql')], test: S('activity-tools.sql') },
  // The Elite Financial Services migration runs twice: it must be safe to run again.
  efs: { setup: [S('stubs/base.sql'), M('migration-manage-team-edits.sql'), M('supabase/migrations/20261118200000_activity_tools.sql'), S('stubs/efs-extra.sql'),
    M('supabase/migrations/20261124170000_elite_financial_services.sql'), M('supabase/migrations/20261124170000_elite_financial_services.sql')], test: S('efs.sql') },
  // The challenges migration runs twice: it must be safe to run again.
  challenges: { setup: [S('stubs/base.sql'), S('stubs/challenges-extra.sql'),
    M('supabase/migrations/20261119160000_challenges.sql'), M('supabase/migrations/20261119160000_challenges.sql')], test: S('challenges.sql') },
  // The test-address migration runs twice: it must be safe to run again.
  commissions: { setup: [S('stubs/base.sql'), S('stubs/commissions-extra.sql'), M('migration-commissions.sql'),
    M('supabase/migrations/20261110210000_commission_test_address.sql'), M('supabase/migrations/20261110210000_commission_test_address.sql')], test: S('commissions.sql') },
  // The reports migration runs twice: it must be safe to run again.
  reports: { setup: [S('stubs/reports-base.sql'), M('migration-activity-reports.sql'), M('migration-activity-reports.sql'), S('reports-seed.sql')], test: S('reports.sql') },
};

const psql = (db, args, extra = {}) => spawnSync('psql', ['-X', '-q', '-d', db, ...args], { encoding: 'utf8', env: { ...process.env, FIXTURES: path.join(TESTS, 'fixtures/commissions'), ...extra } });
const only = process.argv[2];
let failed = 0;
for (const [name, s] of Object.entries(SUITES)) {
  if (only && only !== name) continue;
  const db = `pl_test_${name.replace(/-/g, '_')}`;
  let r = psql('postgres', ['-c', `drop database if exists ${db}`, '-c', `create database ${db}`]);
  if (r.status !== 0) { console.log(`FAIL ${name}: can't make a test database: ${(r.stderr || r.error || '').toString().trim()}`); failed++; continue; }
  let setupOk = true;
  for (const f of s.setup) {
    r = psql(db, ['-v', 'ON_ERROR_STOP=1', '-f', f]);
    if (r.status !== 0) { console.log(`FAIL ${name}: ${path.relative(REPO, f)} did not run: ${r.stderr.trim().split('\n').slice(-3).join(' | ')}`); setupOk = false; break; }
  }
  if (!setupOk) { failed++; continue; }
  r = psql(db, ['-t', '-A', '-f', s.test]);
  const lines = `${r.stdout}\n${r.stderr}`.split('\n').map(l => l.replace(/^psql:[^ ]+ (NOTICE|INFO):\s+/, '').trim()).filter(Boolean);
  const oks = lines.filter(l => /^ok\b/.test(l));
  const bad = lines.filter(l => /FAIL|ERROR/.test(l));
  oks.forEach(l => console.log(`ok [${name}] ${l.replace(/^ok\s*/, '')}`));
  bad.forEach(l => console.log(`FAIL [${name}] ${l}`));
  if (r.status !== 0 || bad.length || !oks.length) { failed++; if (r.status !== 0 && !bad.length) console.log(`FAIL [${name}] psql stopped (exit ${r.status})`); }
  psql('postgres', ['-c', `drop database if exists ${db}`]);
}
console.log(failed ? `${failed} DATABASE SUITE(S) FAILED` : 'ALL DATABASE TESTS PASSED');
process.exit(failed ? 1 : 0);
