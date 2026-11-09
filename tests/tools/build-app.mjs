// A test build of the app: the real code with an in-memory Supabase
// (tests seed it through window.__PL_SEED) and stand-ins for the phone
// app's plugins. Usage: node tests/tools/build-app.mjs [out dir]
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { REPO, TESTS, OUT } from './paths.mjs';

export async function buildApp(out = path.join(OUT, 'app')) {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const MOCK = path.join(TESTS, 'mock');
  await build({
    entryPoints: [path.join(REPO, 'src/main.jsx')],
    bundle: true, outfile: path.join(out, 'assets/app.js'), format: 'esm', jsx: 'automatic',
    loader: { '.js': 'jsx', '.png': 'dataurl', '.svg': 'dataurl', '.woff2': 'file', '.woff': 'file' },
    define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env.DEV': 'true', 'import.meta.env.PROD': 'false', 'import.meta.env.MODE': '"development"' },
    alias: { '@supabase/supabase-js': path.join(MOCK, 'supabase.js'), ...(process.env.LUCIDE_MOCK ? { 'lucide-react': process.env.LUCIDE_MOCK } : {}) },
    plugins: [{ name: 'capacitor', setup(b) { b.onResolve({ filter: /^@capacitor\// }, () => ({ path: path.join(MOCK, 'capacitor.js') })); } }],
    logLevel: 'warning', sourcemap: 'inline',
  });
  let html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  html = html.replace(/<script[^>]*src="\/src\/main\.jsx"[^>]*><\/script>/, '<script type="module" src="/assets/app.js"></script>');
  if (fs.existsSync(path.join(out, 'assets/app.css'))) html = html.replace('</head>', '<link rel="stylesheet" href="/assets/app.css"></head>');
  fs.writeFileSync(path.join(out, 'index.html'), html);
  for (const f of fs.readdirSync(path.join(REPO, 'public'))) {
    const p = path.join(REPO, 'public', f);
    if (fs.statSync(p).isFile()) fs.copyFileSync(p, path.join(out, f));
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) console.log('built', await buildApp(process.argv[2]));
