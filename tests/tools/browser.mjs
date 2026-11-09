// Shared browser-test helpers: a small web server for the test build, and
// a page opener that seeds the in-memory database.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { TESTS, OUT } from './paths.mjs';

export const HERE = TESTS;
export { OUT };
export const APP = path.join(OUT, 'app');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };

export function serve(dir = APP) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const p = decodeURIComponent(req.url.split('?')[0]);
      let file = path.join(dir, p);
      if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dir, 'index.html');
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}` }));
  });
}

let browser = null;
export async function getBrowser() { if (!browser) browser = await chromium.launch(); return browser; }
export async function closeBrowser() { if (browser) await browser.close(); browser = null; }

const DOCUSEAL_STUB = fs.readFileSync(path.join(TESTS, 'mock/docuseal-form.js'), 'utf8');

// Opens the app with a seed: { user, db, factors, aal, totpAt }.
export async function openApp(base, seed, { width = 1280, height = 900, mobile = false, init = [] } = {}) {
  const b = await getBrowser();
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String((e && e.stack) || e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.route(/cdn\.docuseal\.com\/js\/form\.js/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: DOCUSEAL_STUB }));
  await page.addInitScript(s => { window.__PL_SEED = s; }, seed);
  for (const s of init) await page.addInitScript(s);
  await page.goto(base + '/');
  page.errors = errors;
  return page;
}

export async function shot(page, file, opts = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.waitForTimeout(450); // let sheets finish sliding in
  if (opts.fullPage) {
    const size = page.viewportSize();
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: size.width, height: Math.min(h, 6000) });
    await page.waitForTimeout(200);
    await page.screenshot({ path: file });
    await page.setViewportSize(size);
    return;
  }
  await page.screenshot({ path: file, ...opts });
}
