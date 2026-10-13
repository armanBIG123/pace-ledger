// Fails if any file in src/ uses a name that isn't defined or imported
// (for example a component used in one file but never imported there).
// The normal build doesn't catch that; it only shows up as a blank screen.
// Run: npm install --no-save typescript && node scripts/check-names.cjs
const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'src');
const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(js|jsx)$/.test(f)) files.push(p);
  }
})(root);

const program = ts.createProgram(files, {
  allowJs: true, checkJs: true, noEmit: true, skipLibCheck: true, types: [],
  jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
  moduleResolution: ts.ModuleResolutionKind.Bundler, lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
});
// "Cannot find name", "did you mean", and imports of names a file doesn't export.
const CODES = new Set([2304, 2552, 2305, 2724, 2614]);
const problems = ts.getPreEmitDiagnostics(program).filter(d => CODES.has(d.code) && d.file && d.file.fileName.startsWith(root));
for (const d of problems) {
  const { line } = d.file.getLineAndCharacterOfPosition(d.start);
  console.log(`${path.relative(root, d.file.fileName)}:${line + 1}  ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
}
console.log(`Checked ${files.length} files: ${problems.length} problem${problems.length === 1 ? '' : 's'}.`);
process.exit(problems.length ? 1 : 0);
