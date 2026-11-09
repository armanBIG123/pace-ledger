// Bundles code for Node with esbuild:
//   bundleFunction(name)  a Supabase edge function (supabase/functions/<name>),
//                         with the in-memory Supabase stand-in for esm.sh's client.
//   bundleUnit(file)      a unit test file that imports the app's modules.
import { build } from 'esbuild';
import path from 'node:path';
import { REPO, TESTS, OUT } from './paths.mjs';

const MOCK = path.join(TESTS, 'mock');
const capacitor = { name: 'capacitor', setup(b) { b.onResolve({ filter: /^@capacitor\// }, () => ({ path: path.join(MOCK, 'capacitor.js') })); } };

export async function bundleFunction(name) {
  const outfile = path.join(OUT, 'edge', `${name}.mjs`);
  await build({
    entryPoints: [path.join(REPO, 'supabase/functions', name, 'index.ts')],
    bundle: true, outfile, format: 'esm', platform: 'node', logLevel: 'warning',
    banner: { js: 'globalThis.window = globalThis; globalThis.Deno = { env: { get: k => process.env[k] }, serve() {} };' },
    plugins: [{ name: 'esm-sh', setup(b) { b.onResolve({ filter: /^https:\/\/esm\.sh\/@supabase\/supabase-js/ }, () => ({ path: path.join(MOCK, 'supabase.js') })); } }],
  });
  return import(`${outfile}?t=${Date.now()}`);
}

export async function bundleUnit(file) {
  const outfile = path.join(OUT, 'unit', path.basename(file).replace(/\.mjs$/, '.bundle.mjs'));
  await build({
    entryPoints: [file], bundle: true, outfile, format: 'esm', platform: 'node', logLevel: 'error', jsx: 'automatic',
    loader: { '.js': 'jsx', '.css': 'empty' },
    banner: { js: 'globalThis.window = globalThis; globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }; globalThis.document = { addEventListener() {}, visibilityState: "visible" }; globalThis.addEventListener = () => {};' },
    alias: { '@supabase/supabase-js': path.join(MOCK, 'supabase.js'), ...(process.env.LUCIDE_MOCK ? { 'lucide-react': process.env.LUCIDE_MOCK } : {}) },
    plugins: [capacitor],
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'import.meta.env.MODE': '"test"' },
  });
  return outfile;
}
