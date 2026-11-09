// Runs every test and prints a summary. Usage:
//   npm test                 everything (the database tests too when Postgres is set up)
//   npm test -- flows        only the browser tests (also: unit, edge, sql, or part of a file name)
// Browser screenshots and the report emails land in tests/.out/.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { TESTS, OUT } from './tools/paths.mjs';
import { bundleUnit } from './tools/bundle.mjs';
import { buildApp } from './tools/build-app.mjs';

const want = process.argv[2] || '';
const list = dir => fs.readdirSync(path.join(TESTS, dir)).filter(f => f.endsWith('.mjs')).sort().map(f => path.join(TESTS, dir, f));
const pick = (group, file) => !want || want === group || path.basename(file).includes(want);
const results = [];

function run(group, label, file) {
  const t0 = Date.now();
  const r = spawnSync('node', [file], { encoding: 'utf8', env: process.env, maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const ok = (out.match(/^ok\b/gm) || []).length;
  const fails = out.split('\n').filter(l => /^FAIL/.test(l));
  const passed = r.status === 0 && !fails.length;
  results.push({ group, label, ok, passed, secs: Math.round((Date.now() - t0) / 1000) });
  if (!passed) {
    console.log(`\n--- ${group}/${label} failed (exit ${r.status}) ---`);
    console.log((fails.length ? fails : out.trim().split('\n').slice(-25)).join('\n'));
  }
  process.stdout.write(passed ? '.' : 'F');
}

// 1. Unit tests: the app's own helpers.
for (const f of list('unit').filter(f => pick('unit', f))) run('unit', path.basename(f, '.mjs'), await bundleUnit(f));
// 2. Server functions (activity-report also writes the sample emails the browser tests use).
for (const f of list('edge').filter(f => pick('edge', f))) run('edge', path.basename(f, '.mjs'), f);
// 3. Browser tests against a test build of the app.
const flows = list('flows').filter(f => pick('flows', f));
if (flows.length) {
  await buildApp();
  if (flows.some(f => f.endsWith('reports.mjs')) && !fs.existsSync(path.join(OUT, 'report-emails/weekly.html'))) run('edge', 'activity-report', path.join(TESTS, 'edge/activity-report.mjs'));
  for (const f of flows) run('flows', path.basename(f, '.mjs'), f);
}
// 4. Database tests, when there's a Postgres to use.
const hasPg = spawnSync('psql', ['-X', '-d', 'postgres', '-c', 'select 1'], { encoding: 'utf8' }).status === 0;
if ((want === 'sql' || !want) && hasPg) run('sql', 'migrations', path.join(TESTS, 'sql/run.mjs'));
else if (want === 'sql') { console.log('No Postgres found (set PGHOST, PGPORT, PGUSER).'); process.exit(1); }

console.log('\n');
const pad = (s, n) => String(s).padEnd(n);
for (const r of results) console.log(`${r.passed ? 'pass' : 'FAIL'}  ${pad(`${r.group}/${r.label}`, 34)} ${String(r.ok).padStart(4)} checks  ${r.secs}s`);
const total = results.reduce((t, r) => t + r.ok, 0);
const failed = results.filter(r => !r.passed);
if (!hasPg && !want) console.log('(database tests skipped: no Postgres found)');
console.log(failed.length ? `\n${failed.length} of ${results.length} test files FAILED` : `\nAll ${results.length} test files passed: ${total} checks`);
process.exit(failed.length ? 1 : 0);
