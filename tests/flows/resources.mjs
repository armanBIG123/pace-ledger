// Resources → Videos: a super admin uploads an MP4, everyone can watch it
// right there or download it; only MP4s go in, and advisors can't upload.
// Usage: node tests/flows/resources.mjs (after tests/tools/build-app.mjs; npm test runs it all)
import fs from 'node:fs';
import path from 'node:path';
import { serve, openApp, shot, closeBrowser, OUT, APP } from '../tools/browser.mjs';
const [dist = APP, shotsArg] = process.argv.slice(2);
const SHOTS = shotsArg || path.join(OUT, 'shots/resources');
fs.rmSync(SHOTS, { recursive: true, force: true });
const { srv, url } = await serve(dist);
let failures = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { failures++; console.log('FAIL', m); } };

const MORGAN = { id: '11111111-1111-1111-1111-111111111111', email: 'morgan@example.com' };
const JORDAN = { id: '22222222-2222-2222-2222-222222222222', email: 'jordan@example.com' };
const base = () => ({
  solar_systems: [{ id: 's-big', short_name: 'BIG', name: 'Big Insurance Network' }],
  profiles: [
    { id: MORGAN.id, display_name: 'Morgan Lee', role: 'super_admin', solar_system_id: 's-big', created_at: '2025-06-01T00:00:00Z', hierarchy_tier: 'EVC' },
    { id: JORDAN.id, display_name: 'Jordan Ellis', role: 'advisor', solar_system_id: 's-big', manager_id: MORGAN.id, created_at: '2026-06-20T00:00:00Z', hierarchy_tier: 'SA' },
  ],
  org_directory: [{ id: MORGAN.id, display_name: 'Morgan Lee' }, { id: JORDAN.id, display_name: 'Jordan Ellis', manager_id: MORGAN.id }],
  documents: [
    { id: 'd1', title: 'Sales presentation', file_path: 'BIG/a-sales.pdf', file_size: 2400000, file_type: 'pdf', uploaded_by: MORGAN.id, uploaded_by_name: 'Morgan Lee', created_at: '2026-11-01T15:00:00Z' },
  ],
  important_links: [],
});
// Record what was opened instead of opening tabs.
const SETUP = `window.__opened = []; window.open = u => { window.__opened.push(String(u)); return null; };`;
const open = async (who, db = base()) => {
  const page = await openApp(url, { user: who, db, factors: [] }, { width: 1280, height: 900, init: [SETUP] });
  await page.locator('button:visible', { hasText: /^Resources$/ }).first().click();
  await page.locator('.tr-docs-tabs').waitFor();
  return page;
};
const tab = (page, name) => page.locator('.tr-docs-tabs button', { hasText: name });

try {
  // ---- 1. A super admin uploads a video ----
  let page = await open(MORGAN);
  ok(/Videos\s*0/.test(await tab(page, 'Videos').innerText()), 'a Videos tab, empty to start');
  ok(/PDF Documents[\s\S]*PPTX Documents[\s\S]*Videos[\s\S]*Important Links/.test(await page.locator('.tr-docs-tabs').innerText()), 'tabs: PDF, PPTX, Videos, Important Links');
  await tab(page, 'Videos').click();
  ok(/No videos uploaded yet/.test(await page.locator('.tr-appts-main').innerText()), 'empty: no videos yet');
  await page.getByRole('button', { name: /Upload video/ }).click();
  const form = page.locator('.tr-form');
  ok((await form.locator('input[type=file]').getAttribute('accept')) === 'video/mp4,.mp4', 'the picker asks for MP4s');
  ok(/MP4 only/.test(await form.innerText()), 'says MP4 only, and to keep the page open');
  // the wrong kind of file is refused
  await form.locator('input').first().fill('Advisor tutorial');
  await form.locator('input[type=file]').setInputFiles({ name: 'notes.mov', mimeType: 'video/quicktime', buffer: Buffer.from('not an mp4') });
  await form.getByRole('button', { name: /^Upload$/ }).click();
  ok(/That isn't an MP4 file/.test(await page.locator('.tr-error').innerText()), 'a .mov is refused: ' + await page.locator('.tr-error').innerText());
  // an MP4 the computer gave no type: stored as video/mp4
  await form.locator('input[type=file]').setInputFiles({ name: 'PaceLedger-Advisor-Tutorial.mp4', mimeType: '', buffer: Buffer.alloc(2048, 1) });
  await shot(page, `${SHOTS}/01-upload.png`);
  await form.getByRole('button', { name: /^Upload$/ }).click();
  await page.locator('.tr-document-card').first().waitFor();
  const stored = await page.evaluate(() => {
    const k = Object.keys(window.__PL.storage).find(x => /Advisor-Tutorial\.mp4$/.test(x));
    return k ? { key: k, type: window.__PL.storage[k].type } : null;
  });
  ok(stored && /^documents\/BIG\//.test(stored.key) && stored.type === 'video/mp4', 'saved to the documents bucket, in BIG’s folder, as video/mp4: ' + JSON.stringify(stored));
  const row = await page.evaluate(() => window.__PL.db.documents.find(d => d.title === 'Advisor tutorial'));
  ok(row && row.file_type === 'mp4' && row.file_size === 2048, 'listed as a video (file_type mp4)');
  ok(/Videos\s*1/.test(await tab(page, 'Videos').innerText()), 'Videos counts it');
  ok(/PDF Documents\s*1/.test(await tab(page, 'PDF Documents').innerText()), 'the PDF count is unchanged');
  const card = page.locator('.tr-document-card').first();   // the only video
  ok(/Advisor tutorial/.test(await card.innerText()), 'the new video is listed');
  ok(await card.locator('.lucide-video').count() === 1, 'a video icon');
  // ---- 2. Watch it right there ----
  await card.getByRole('button', { name: /Watch/ }).click();
  const video = card.locator('video.tr-video');
  await video.waitFor();
  ok(/documents\/BIG\/.*Advisor-Tutorial\.mp4/.test(await video.getAttribute('src')) && await video.getAttribute('controls') !== null, 'Watch opens a player under it, from a signed link');
  await shot(page, `${SHOTS}/02-watch.png`);
  await card.getByRole('button', { name: /Close/ }).click();
  ok(await card.locator('video').count() === 0, 'Close closes it');
  await card.getByRole('button', { name: /Download/ }).click();
  await page.waitForTimeout(300);
  ok((await page.evaluate(() => window.__opened)).some(u => /Advisor-Tutorial\.mp4/.test(u)), 'Download opens a link to the file');
  // rename stays on the Videos tab
  await card.getByTitle('Rename video').click();
  await card.locator('input').fill('PaceLedger for Advisors');
  await card.getByRole('button', { name: /^Save$/ }).click();
  await page.waitForTimeout(300);
  ok(await page.locator('.tr-document-card', { hasText: 'PaceLedger for Advisors' }).count() === 1, 'renamed');
  await tab(page, 'PDF Documents').click();
  ok(!/PaceLedger for Advisors/.test(await page.locator('.tr-appts-main').innerText()), 'videos don’t show under PDF Documents');
  await page.close();

  // ---- 3. An advisor watches, can't upload ----
  const db = base();
  db.documents.push({ id: 'v1', title: 'PaceLedger for Advisors', file_path: 'BIG/b-advisor.mp4', file_size: 13100000, file_type: 'mp4', uploaded_by: MORGAN.id, uploaded_by_name: 'Morgan Lee', created_at: '2026-11-18T15:00:00Z' });
  page = await open(JORDAN, db);
  await tab(page, 'Videos').click();
  ok(await page.getByRole('button', { name: /Upload video/ }).count() === 0, 'advisors don’t see Upload video');
  const vcard = page.locator('.tr-document-card', { hasText: 'PaceLedger for Advisors' });
  ok(/Uploaded by Morgan Lee .* · 12\.5 MB/.test(await vcard.innerText()), 'shows who uploaded it and its size');
  ok(await vcard.getByTitle('Delete video').count() === 0, 'and no delete');
  await vcard.getByRole('button', { name: /Watch/ }).click();
  await vcard.locator('video').waitFor();
  ok(true, 'advisors can watch');
  await shot(page, `${SHOTS}/03-advisor.png`);
  await page.close();

  // ---- 4. Phone ----
  page = await openApp(url, { user: JORDAN, db, factors: [] }, { width: 390, height: 844, mobile: true, init: [SETUP] });
  await page.locator('button:visible', { hasText: /^Resources$/ }).first().click();
  await page.locator('.tr-docs-tabs').waitFor();
  await tab(page, 'Videos').click();
  await page.locator('.tr-document-card').getByRole('button', { name: /Watch/ }).click();
  const box = await page.locator('video').boundingBox();
  ok(box && box.width <= 390 && box.width > 300, 'on a phone the player fits the screen: ' + (box && Math.round(box.width)));
  await shot(page, `${SHOTS}/04-phone.png`);
  await page.close();
} catch (e) { failures++; console.log('FAIL (crash)', e.stack); }
await closeBrowser(); srv.close();
console.log(failures ? `${failures} FAILED` : 'ALL RESOURCES FLOWS PASSED');
process.exit(failures ? 1 : 0);
