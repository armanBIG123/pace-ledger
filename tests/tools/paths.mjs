// Where things are: the repo, the tests folder and tests/.out (build
// output, screenshots and emails the tests make; not saved in git).
import path from 'node:path';
import fs from 'node:fs';
export const TESTS = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const REPO = path.resolve(TESTS, '..');
export const OUT = path.join(TESTS, '.out');
fs.mkdirSync(OUT, { recursive: true });
