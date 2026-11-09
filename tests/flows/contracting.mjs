// The whole contracting flow, start to finish, against the preview build.
// Usage: node tests/flows/contracting.mjs (after tests/tools/build-app.mjs; npm test runs it all)
import fs from 'node:fs';
import path from 'node:path';
import { serve, openApp, shot, closeBrowser, HERE, OUT, APP } from '../tools/browser.mjs';

const [dist = APP, shotsArg] = process.argv.slice(2);
const repo = path.resolve(HERE, '..');
const SHOTS = shotsArg || path.join(OUT, 'shots/contracting');
fs.rmSync(SHOTS, { recursive: true, force: true });
const vault = await import(path.join(repo, 'src/lib/vault.js'));
const MOCK = fs.readFileSync(path.join(HERE, 'mock/contracting-mock.js'), 'utf8');
const { srv, url } = await serve(dist);
let failures = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { failures++; console.log('FAIL', m); } };

const MORGAN = { id: '11111111-1111-1111-1111-111111111111', email: 'morgan@example.com' };
const JORDAN = { id: '22222222-2222-2222-2222-222222222222', email: 'jordan.ellis@example.com' };
const key = await vault.generateKeyPair();
const nowIso = new Date().toISOString();
const base = () => ({
  solar_systems: [{ id: 's-big', short_name: 'BIG', name: 'Big Insurance Network' }],
  profiles: [
    { id: MORGAN.id, display_name: 'Morgan Lee', role: 'super_admin', solar_system_id: 's-big', created_at: '2025-06-01T00:00:00Z', hierarchy_tier: 'EVC' },
    { id: '33333333-3333-3333-3333-333333333333', display_name: 'Dana Brooks', role: 'manager', solar_system_id: 's-big', created_at: '2025-08-01T00:00:00Z', hierarchy_tier: 'FD' },
    { id: JORDAN.id, display_name: 'Jordan Ellis', role: 'advisor', solar_system_id: 's-big', manager_id: '33333333-3333-3333-3333-333333333333', npn: '19880001', fg_writing_number: null, created_at: '2026-09-20T00:00:00Z', hierarchy_tier: 'FA' },
  ],
  licensing_progress: [{ user_id: JORDAN.id, course_started_on: '2026-09-22', course_completed_on: '2026-10-05', exam_on: '2026-10-12', exam_passed_on: '2026-10-12', updated_at: nowIso }],
  contracting_settings: [{ id: true, enabled: true, paused: false, public_key: key.publicJwk, key_id: key.keyId, key_set_at: nowIso, key_verified_at: nowIso, agreement_version: 'BIG-IAA-2026.1', docuseal_template_id: 12345, last_review_at: null }],
  contracting_staff: [{ user_id: MORGAN.id }],
});
const factor = [{ id: 'f-morgan', factor_type: 'totp', status: 'verified', friendly_name: 'Phone' }];
const PRIVATE = `window.__PL_PRIVATE = ${JSON.stringify(key.privateText)};`;
const withKey = 'window.__PL_SETUP_ORIG = window.__PL_SETUP; window.__PL_SETUP = function (PL) { window.__PL_SETUP_ORIG(PL); PL.privateText = window.__PL_PRIVATE; PL.emails = { "22222222-2222-2222-2222-222222222222": "jordan.ellis@example.com" }; };';
const init = [MOCK, PRIVATE, withKey];

async function state(page) { return page.evaluate(() => ({ db: window.__PL.db, docuseal: window.__PL.docuseal || {} })); }
async function asAgent(db, docuseal, { width = 390, height = 844 } = {}) {
  const page = await openApp(url, { user: JORDAN, db, factors: [] }, { width, height, mobile: width < 600, init: [...init, `window.__PL_DS = ${JSON.stringify(docuseal || {})}; (function(){ const o = window.__PL_SETUP; window.__PL_SETUP = function (PL) { o(PL); PL.docuseal = window.__PL_DS; }; })();`] });
  await page.locator('button:visible', { hasText: 'Growth' }).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.locator('button:visible', { hasText: 'Growth' }).first().click();
  await page.locator('button:visible', { hasText: 'Licensing' }).first().waitFor();
  await page.locator('button:visible', { hasText: 'Licensing' }).first().click();
  await page.waitForSelector('text=Your path to licensed');
  return page;
}
async function asAdmin(db, docuseal, { aal = 'aal1', factors = factor, totpAt } = {}) {
  const t = totpAt !== undefined ? totpAt : aal === 'aal2' ? Math.floor(Date.now() / 1000) - 60 : null;
  const page = await openApp(url, { user: MORGAN, db, factors, aal, totpAt: t }, { width: 1280, height: 900, init: [...init, `window.__PL_DS = ${JSON.stringify(docuseal || {})}; (function(){ const o = window.__PL_SETUP; window.__PL_SETUP = function (PL) { o(PL); PL.docuseal = window.__PL_DS; }; })();`] });
  await page.locator('button:visible', { hasText: 'Team & admin' }).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.locator('button:visible', { hasText: 'Team & admin' }).first().click();
  await page.locator('button:visible', { hasText: 'Profiles' }).first().waitFor();
  await page.locator('button:visible', { hasText: 'Profiles' }).first().click();
  await page.getByRole('tab', { name: /Contracting/ }).click();
  return page;
}
async function verifyCode(page, code = '123456') {
  await page.waitForSelector('text=Confirm it\'s you');
  await page.getByLabel('6-digit code').fill(code);
}
const stepText = async (page, title) => page.locator('.tr-lic-step', { hasText: title }).first().innerText();

try {
  // ---- 1. Agent signs the producer agreement ---------------------------------
  let page = await asAgent(base());
  await page.locator('.tr-lic-step', { hasText: 'Sign your producer agreement' }).scrollIntoViewIfNeeded();
  await shot(page, `${SHOTS}/01-agent-steps.png`);
  ok((await stepText(page, 'Sign your producer agreement')).includes('about 3 minutes'), 'agent sees "Sign your producer agreement"');
  ok(!(await page.locator('text=InsuraCloud').count()), 'no InsuraCloud wording when contracting is on');
  await page.getByRole('button', { name: 'Sign your agreement' }).click();
  // First: printed name, initials and a drawn signature, once.
  await page.waitForSelector('.tr-adopt');
  ok(await page.getByRole('textbox', { name: 'Printed name' }).inputValue() === 'Jordan Ellis' && await page.getByRole('textbox', { name: 'Initials' }).inputValue() === 'JE', 'printed name and initials start from their name');
  await shot(page, `${SHOTS}/02a-adopt-empty.png`);
  await page.getByRole('button', { name: /Adopt and open my agreement/ }).click();
  ok(/Draw your signature in the box/.test(await page.locator('.tr-adopt .tr-error').innerText()), 'no signature, no going on');
  await page.getByRole('textbox', { name: 'Printed name' }).fill('Jordan Avery Ellis');
  ok(await page.getByRole('textbox', { name: 'Initials' }).inputValue() === 'JAE', 'initials follow the printed name');
  const box = await page.locator('.tr-sigpad-canvas').boundingBox();
  await page.mouse.move(box.x + 30, box.y + 110);
  await page.mouse.down();
  for (let i = 0; i <= 24; i++) await page.mouse.move(box.x + 30 + i * 11, box.y + 100 - Math.sin(i / 2.2) * 38 - (i % 6) * 2, { steps: 2 });
  await page.mouse.up();
  await page.mouse.move(box.x + 120, box.y + 70); await page.mouse.down(); await page.mouse.move(box.x + 210, box.y + 125, { steps: 8 }); await page.mouse.up();
  ok(await page.locator('.tr-sigpad-hint').count() === 0, 'the "draw here" hint goes once they draw');
  await page.getByRole('button', { name: /Adopt and open my agreement/ }).click();
  ok(/Check the box/.test(await page.locator('.tr-adopt .tr-error').innerText()), 'the agreement to use them is required');
  await page.locator('.tr-adopt-consent input').check();
  ok(await page.locator('.tr-adopt .tr-error').count() === 0, 'the message clears once they fix it');
  await shot(page, `${SHOTS}/02b-adopt-filled.png`);
  await page.getByRole('button', { name: /Adopt and open my agreement/ }).click();
  await page.waitForSelector('[data-testid=docuseal-stub]');
  const adopted = await page.evaluate(() => window.__PL.adoptBody);
  ok(adopted && adopted.printedName === 'Jordan Avery Ellis' && adopted.initials === 'JAE' && adopted.consent === true && adopted.signatureLength > 800, `adopted: ${JSON.stringify(adopted)}`);
  const dsAttrs = await page.evaluate(() => { const el = document.querySelector('docuseal-form'); return { sig: (el.getAttribute('data-signature') || '').slice(0, 22), complete: el.getAttribute('data-with-complete-button') }; });
  ok(dsAttrs.sig === 'data:image/png;base64,' && dsAttrs.complete === 'true', 'the agreement opens filled in, with Complete up top');
  ok(/on every spot/.test(await page.locator('.tr-fsheet-body .tr-ct-note').innerText()), 'tells them it is all filled in');
  await shot(page, `${SHOTS}/02-agent-signing.png`);
  await page.click('[data-testid=docuseal-finish]');
  await page.waitForSelector('text=BIG countersigns next');
  await shot(page, `${SHOTS}/03-agent-signed.png`);
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForSelector('text=Waiting for BIG to countersign');
  ok(true, 'agent sees "Waiting for BIG to countersign"');
  let st = await state(page);
  ok(st.db.producer_agreements.length === 1 && st.db.producer_agreements[0].status === 'agent_signed', 'agreement saved as agent_signed');
  await page.context().close();

  // ---- 2. Super admin: two-step login, then countersign ---------------------------
  page = await asAdmin(st.db, st.docuseal);
  await page.waitForSelector('text=Confirm it\'s you');
  await shot(page, `${SHOTS}/04-admin-two-step.png`);
  await verifyCode(page);
  await page.getByRole('button', { name: 'Verify' }).click().catch(() => {});
  await page.waitForSelector('text=Needs your countersign');
  await shot(page, `${SHOTS}/05-admin-queue-countersign.png`);
  await page.locator('.tr-ct-row', { hasText: 'Jordan Ellis' }).getByRole('button', { name: 'Countersign' }).click();
  await page.waitForSelector('[data-testid=docuseal-stub]');
  await page.click('[data-testid=docuseal-finish]');
  await page.waitForSelector('text=Countersigned.');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForSelector('text=Waiting on their contracting info');
  st = await state(page);
  const ag = st.db.producer_agreements[0];
  ok(ag.status === 'completed' && ag.pdf_path && ag.countersigner_name === 'Morgan Lee', 'agreement completed with PDF path and countersigner');
  ok(st.db.licensing_progress[0].contracting_sent_on, 'licensing step "agreement" dated automatically');
  await page.context().close();

  // ---- 3. Agent fills out and sends the form -------------------------------------
  page = await asAgent(st.db, st.docuseal);
  ok((await stepText(page, 'Sign your producer agreement')).includes('countersigned'), 'step 1 shows signed and countersigned');
  await page.getByRole('button', { name: 'Fill out the form' }).click();
  await page.waitForSelector('text=Encrypted on this device before it\'s sent');
  await shot(page, `${SHOTS}/06-agent-form-top.png`);
  await page.getByRole('button', { name: /Encrypt and send to BIG/ }).click();
  await page.waitForSelector('text=need a look');
  await shot(page, `${SHOTS}/07-agent-form-errors.png`);
  const form = page.locator('.tr-ct-form');
  const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fill = async (label, v) => form.getByLabel(new RegExp('^' + esc(label) + '(?!\\s+again)')).first().fill(v);
  await fill('Middle name', 'A');
  await fill('Social Security number', '512346789');
  await form.getByLabel('Date of birth').fill('1994-04-12');
  await form.getByLabel('Gender').selectOption('Male');
  await fill('Phone', '5125550142');
  await fill('Street address', '1200 Sample Ave');
  await fill('City', 'Austin');
  await form.locator('#ct-state select').selectOption('TX');
  await fill('ZIP code', '78701');
  await fill('License number', 'D1234567');
  await form.locator('#ct-dl_state select').selectOption('TX');
  await form.locator('#ct-dl_expires input').fill('2029-08-31');
  await fill('Bank name', 'Sample Bank');
  await fill('Routing number', '011000016');
  await page.waitForTimeout(100);
  ok(true, 'typed a bad routing number');
  await fill('Routing number', '011000015');
  await fill('Account number', '000123456789');
  await fill('Account number again', '000123456789');
  const bigPdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(4.5 * 1024 * 1024, 120)]);
  await form.locator('#ct-bank_file input[type=file]').setInputFiles({ name: 'huge-statement.pdf', mimeType: 'application/pdf', buffer: bigPdf });
  await page.waitForSelector('text=This PDF is over 4 MB');
  ok(await form.locator('text=huge-statement.pdf').count() === 0, 'a PDF over 4 MB is turned away when picked (not attached)');
  await form.locator('#ct-bank_file').scrollIntoViewIfNeeded();
  await shot(page, `${SHOTS}/07a-agent-form-file-too-big.png`);
  const bankPdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n' + 'v'.repeat(15000));
  await form.locator('#ct-bank_file input[type=file]').setInputFiles({ name: 'voided-check.pdf', mimeType: 'application/pdf', buffer: bankPdf });
  await page.waitForSelector('text=voided-check.pdf');
  ok(await form.locator('text=This PDF is over 4 MB').count() === 0, 'picking a good file clears the message');
  await form.locator('#ct-bank_file').scrollIntoViewIfNeeded();
  await shot(page, `${SHOTS}/07b-agent-form-bank-doc.png`);
  await form.getByRole('radiogroup', { name: 'Do you have E&O insurance?' }).getByRole('radio', { name: 'Yes' }).click();
  await fill('E&O carrier', 'Sample E&O Co');
  await fill('Policy number', 'EO-55821');
  await form.locator('#ct-eo_expires input').fill('2027-06-30');
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n' + 'x'.repeat(20000));
  await form.locator('#ct-eo_file').scrollIntoViewIfNeeded();
  await shot(page, `${SHOTS}/07c-agent-form-eo-optional.png`);
  await form.locator('#ct-eo_file input[type=file]').setInputFiles({ name: 'eo-certificate.pdf', mimeType: 'application/pdf', buffer: pdf });
  await form.getByRole('radiogroup', { name: 'Finished AML training?' }).getByRole('radio', { name: 'No' }).click();
  await form.getByRole('button', { name: 'Answer the rest No' }).click();
  await form.locator('#ct-bg_6').getByRole('radio', { name: 'Yes' }).click();
  await form.getByLabel('Explain question 7').fill('A 2023 chargeback from my previous agency, paid in full in March 2024.');
  await form.locator('#ct-confirm input').check();
  await form.locator('#ct-bg_6').scrollIntoViewIfNeeded();
  await shot(page, `${SHOTS}/08-agent-form-background.png`);
  await page.getByRole('button', { name: /Encrypt and send to BIG/ }).click();
  await page.waitForSelector('text=BIG is entering it in SureLC', { timeout: 20000 });
  await page.locator('.tr-lic-step', { hasText: 'Send your contracting info' }).scrollIntoViewIfNeeded();
  await shot(page, `${SHOTS}/09-agent-sent.png`);
  st = await state(page);
  const sec = st.db.contracting_secrets[0];
  ok(sec && sec.submitted_at && Object.keys(sec.fields).length >= 21, 'encrypted fields saved');
  ok(!JSON.stringify(st.db).includes('512-34-6789') && !JSON.stringify(st.db).includes('000123456789') && !JSON.stringify(st.db).includes('chargeback from my previous'), 'nothing readable in the database');
  ok(st.db.contracting_files.length === 2 && st.db.contracting_files.some(f => f.kind === 'eo_certificate') && st.db.contracting_files.some(f => f.kind === 'bank_doc'), 'E&O certificate and bank document saved encrypted');
  ok(page.errors.filter(e => !/not mocked|ERR_FAILED|ERR_ABORTED/.test(e)).length === 0, `agent page has no errors ${page.errors.filter(e => !/not mocked|ERR_FAILED|ERR_ABORTED/.test(e)).join(' | ')}`);
  await page.context().close();

  // ---- 4. Super admin enters it in SureLC ------------------------------------------
  page = await asAdmin(st.db, st.docuseal, { aal: 'aal2' });
  await page.waitForSelector('text=Enter in SureLC');
  await shot(page, `${SHOTS}/10-admin-queue-enter.png`);
  await page.locator('.tr-ct-row', { hasText: 'Jordan Ellis' }).getByRole('button', { name: 'Open' }).click();
  await page.waitForSelector('text=Hidden until you reveal it');
  const row = label => page.locator('.tr-ct-frow', { hasText: label }).first();
  await row('Social Security number').getByRole('button', { name: 'Reveal' }).click();
  await page.waitForSelector('text=512-34-6789');
  await row('Background answers').getByRole('button', { name: 'Reveal' }).click();
  await page.waitForSelector('text=paid in full in March 2024');
  await shot(page, `${SHOTS}/11-admin-case-revealed.png`, { fullPage: true });
  await row('Routing number').getByRole('button', { name: 'Copy' }).click();
  await page.waitForSelector('text=Routing number copied');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  ok(clip === '011000015', 'copy puts the routing number on the clipboard');
  await row('E&O certificate').getByRole('button', { name: 'View' }).click();
  await page.waitForSelector('.tr-ct-viewer iframe');
  ok((await page.locator('.tr-ct-viewer iframe').getAttribute('src')).startsWith('blob:') && await page.locator('text=eo-certificate.pdf').count() > 0, 'E&O certificate opens decrypted inside PaceLedger');
  await shot(page, `${SHOTS}/11b-admin-file-viewer.png`);
  await page.locator('.tr-fsheet').getByRole('button', { name: 'Close' }).click();
  await row('Bank document').getByRole('button', { name: 'View' }).click();
  await page.waitForSelector('text=voided-check.pdf');
  ok(await page.locator('.tr-fsheet-title', { hasText: 'Bank document' }).count() > 0, 'bank document opens decrypted inside PaceLedger');
  await page.locator('.tr-fsheet').getByRole('button', { name: 'Close' }).click();
  st = await state(page);
  const actions = st.db.contracting_log.map(l => l.action);
  ok(actions.includes('opened') && actions.includes('revealed') && actions.includes('copied') && actions.includes('viewed_file'), 'open, reveal, copy and file view are all logged');
  await page.getByRole('button', { name: 'I entered it in SureLC' }).click();
  await page.waitForSelector('text=Delete Jordan Ellis\'s info now?');
  await shot(page, `${SHOTS}/12-admin-confirm-entered.png`);
  await page.getByRole('button', { name: 'Yes, it\'s in SureLC' }).click();
  await page.waitForSelector('text=Their info was deleted from PaceLedger');
  st = await state(page);
  ok(!st.db.contracting_secrets.length && !st.db.contracting_files.length, 'entered: the info and files are gone');
  await page.locator('.tr-ct-steps li', { hasText: 'SureLC review request sent' }).getByRole('button', { name: 'Mark sent' }).click();
  await page.locator('.tr-ct-steps li', { hasText: 'They reviewed and signed in SureLC' }).getByRole('button', { name: 'Mark signed' }).click();
  await page.waitForSelector('.tr-ct-steps li.tr-ct-step-done:has-text("They reviewed and signed")');
  await shot(page, `${SHOTS}/13-admin-after-entered.png`, { fullPage: true });
  st = await state(page);
  await page.context().close();

  // ---- 5. Agent sees what's next ------------------------------------------------------
  page = await asAgent(st.db, st.docuseal);
  await page.waitForSelector('text=BIG is sending it to the carrier');
  await page.locator('.tr-ct-agreement').scrollIntoViewIfNeeded();
  await shot(page, `${SHOTS}/14-agent-after-surelc.png`, { fullPage: true });
  ok(await page.locator('text=Signed producer agreement').count() > 0, 'agent sees their signed agreement card');
  await page.context().close();

  // ---- 6. Withdraw, expiry, kill switch, pause ----------------------------------------
  const afterAgreement = JSON.parse(JSON.stringify(st.db));
  afterAgreement.contracting_cases = [];
  afterAgreement.contracting_log = [];
  afterAgreement.licensing_progress[0].profile_submitted_on = null;
  // Seed a sent submission directly by encrypting in Node.
  const sealed = await vault.encryptSubmission({ publicJwk: key.publicJwk, userId: JORDAN.id, fields: { first_name: 'Jordan', last_name: 'Ellis', ssn: '512-34-6789', dob: '04/12/1994', gender: 'Male', email: JORDAN.email, phone: '(512) 555-0142', street: '1200 Sample Ave', city: 'Austin', state: 'TX', zip: '78701', dl_number: 'D1234567', dl_state: 'TX', dl_expires: '08/31/2029', bank_name: 'Sample Bank', account_type: 'Checking', routing: '011000015', account: '000123456789', eo_has: 'No', aml_done: 'No', background: JSON.stringify({ answers: Array(19).fill('no'), notes: {} }) } });
  const pending = (sentHoursAgo = 2) => {
    const db = JSON.parse(JSON.stringify(afterAgreement));
    const sent = new Date(Date.now() - sentHoursAgo * 3600e3);
    const until = new Date(sent.getTime() + 72 * 3600e3).toISOString();
    db.contracting_secrets = [{ user_id: JORDAN.id, key_id: sealed.keyId, wrapped_key: sealed.wrappedKey, fields: sealed.fields, submitted_at: sent.toISOString(), expires_at: until }];
    db.contracting_files = [];
    db.contracting_cases = [{ user_id: JORDAN.id, info_sent_at: sent.toISOString(), expires_at: until }];
    db.licensing_progress[0].profile_submitted_on = sent.toISOString().slice(0, 10);
    return db;
  };
  page = await asAgent(pending());
  await page.getByRole('button', { name: 'Withdraw my info' }).click();
  await page.getByRole('button', { name: 'Withdraw and delete' }).click();
  await page.waitForSelector('text=Fill out the form');
  st = await state(page);
  ok(!st.db.contracting_secrets.length && st.db.contracting_cases[0].delete_reason === 'withdrawn', 'withdraw deletes it and the agent can send again');
  await page.context().close();

  page = await asAdmin(pending(73), {}, { aal: 'aal2' });
  await page.waitForSelector('text=Their info expired');
  st = await state(page);
  ok(!st.db.contracting_secrets.length && st.db.contracting_log.some(l => l.action === 'expired'), 'expired info is deleted and logged the moment anyone opens contracting');
  await page.context().close();
  page = await asAgent(st.db, {});
  ok((await stepText(page, 'Send your contracting info')).includes('deleted 72 hours after you sent it'), 'agent is told to send it again after it expired');
  await page.context().close();

  page = await asAdmin(pending(30), {}, { aal: 'aal2' });
  await page.waitForSelector('text=Enter in SureLC');
  await page.getByRole('button', { name: 'Delete all pending and pause' }).click();
  await page.getByRole('button', { name: 'Delete all and pause' }).click();
  await page.waitForSelector('text=paused the form');
  await shot(page, `${SHOTS}/15-admin-kill-switch.png`);
  st = await state(page);
  ok(!st.db.contracting_secrets.length && st.db.contracting_settings[0].paused, 'kill switch deletes everything pending and pauses');
  await page.context().close();
  page = await asAgent(st.db, {});
  ok((await stepText(page, 'Send your contracting info')).includes('paused'), 'agent sees the form is paused');
  ok(!(await page.getByRole('button', { name: 'Fill out the form' }).count()), 'no form button while paused');
  await page.context().close();

  // ---- 7. Two-step: wrong code, stale code, idle lock -----------------------------------
  page = await asAdmin(base(), {});
  await verifyCode(page, '000000');
  await page.getByRole('button', { name: 'Verify' }).click().catch(() => {});
  await page.waitForSelector('text=That code didn\'t work');
  ok(true, 'a wrong code is refused');
  await page.context().close();
  page = await asAdmin(base(), {}, { aal: 'aal2', totpAt: Math.floor(Date.now() / 1000) - 13 * 3600 });
  await page.waitForSelector('text=Confirm it\'s you');
  ok(true, 'a two-step login older than 12 hours asks again');
  await page.context().close();

  // ---- 8. First-time setup ---------------------------------------------------------------
  const fresh = base();
  fresh.contracting_settings = [{ id: true, enabled: false, paused: false }];
  fresh.contracting_staff = [];
  page = await openApp(url, { user: MORGAN, db: fresh, factors: [] }, { width: 1280, height: 900, init: [MOCK, PRIVATE, 'window.__PL_SETUP_ORIG = window.__PL_SETUP; window.__PL_SETUP = function (PL) { window.__PL_SETUP_ORIG(PL); };'] });
  await page.locator('button:visible', { hasText: 'Team & admin' }).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.locator('button:visible', { hasText: 'Team & admin' }).first().click();
  await page.locator('button:visible', { hasText: 'Profiles' }).first().click();
  await page.getByRole('tab', { name: /Contracting/ }).click();
  await page.waitForSelector('text=Turn on two-step login');
  await page.getByRole('button', { name: 'Set it up' }).click();
  await page.waitForSelector('img[alt="QR code for your authenticator app"]');
  await shot(page, `${SHOTS}/16-setup-two-step.png`);
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Turn it on' }).click().catch(() => {});
  await page.waitForSelector('text=No one is on the contracting team yet');
  await page.locator('.tr-ct-staff li', { hasText: 'Morgan Lee' }).getByRole('button', { name: /^Add/ }).click();
  await page.waitForSelector('text=2 · Encryption key');
  await page.getByRole('button', { name: 'Make the key' }).click();
  await page.waitForSelector('text=shown only this once');
  const priv = await page.getByRole('textbox', { name: 'Private key' }).inputValue();
  ok(priv.startsWith('PLKEY1.'), 'private key shown once for Supabase');
  await page.addStyleTag({ content: '.tr-ct-newkey textarea { filter: blur(5px); }' }); // a throwaway test key, blurred anyway
  await shot(page, `${SHOTS}/17-setup-new-key.png`, { fullPage: true });
  await page.evaluate(p => { window.__PL.privateText = p; }, priv);
  await page.getByRole('button', { name: 'Check the key' }).click();
  await page.waitForSelector('text=Encryption is ready');
  await page.getByLabel('DocuSeal template number').fill('12345');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Check DocuSeal' }).click();
  await page.waitForSelector('text=Roles and fields look right');
  await page.getByRole('button', { name: 'Turn it on' }).click();
  await page.waitForSelector('text=Contracting is on. Agents now sign');
  await shot(page, `${SHOTS}/18-setup-done.png`, { fullPage: true });
  st = await state(page);
  ok(st.db.contracting_settings[0].enabled && st.db.contracting_settings[0].key_verified_at, 'setup turns contracting on');
  ok(!JSON.stringify(st.db).includes(priv.split('.')[2].slice(0, 40)), 'the private key is never saved in PaceLedger');
  await page.context().close();

  // ---- 10. Files are optional: none at all, or one that fails, never stops the info ----
  const fillRequired = async (pg, { eo = 'yes' } = {}) => {
    const fm = pg.locator('.tr-ct-form');
    const esc2 = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fl = async (label, v) => fm.getByLabel(new RegExp('^' + esc2(label) + '(?!\\s+again)')).first().fill(v);
    await fl('Social Security number', '512346789');
    await fm.getByLabel('Date of birth').fill('1994-04-12');
    await fm.getByLabel('Gender').selectOption('Male');
    await fl('Phone', '5125550142');
    await fl('Street address', '1200 Sample Ave');
    await fl('City', 'Austin');
    await fm.locator('#ct-state select').selectOption('TX');
    await fl('ZIP code', '78701');
    await fl('License number', 'D1234567');
    await fm.locator('#ct-dl_state select').selectOption('TX');
    await fm.locator('#ct-dl_expires input').fill('2029-08-31');
    await fl('Bank name', 'Sample Bank');
    await fl('Routing number', '011000015');
    await fl('Account number', '000123456789');
    await fl('Account number again', '000123456789');
    await fm.getByRole('radiogroup', { name: 'Do you have E&O insurance?' }).getByRole('radio', { name: eo === 'yes' ? 'Yes' : 'No' }).click();
    if (eo === 'yes') {
      await fl('E&O carrier', 'Sample E&O Co');
      await fl('Policy number', 'EO-55821');
      await fm.locator('#ct-eo_expires input').fill('2027-06-30');
    }
    await fm.getByRole('radiogroup', { name: 'Finished AML training?' }).getByRole('radio', { name: 'Yes' }).click();
    await fm.getByRole('button', { name: 'Answer the rest No' }).click();
    await fm.locator('#ct-confirm input').check();
  };
  page = await asAgent(JSON.parse(JSON.stringify(afterAgreement)));
  await page.getByRole('button', { name: 'Fill out the form' }).click();
  await page.waitForSelector('text=Encrypted on this device before it\'s sent');
  await fillRequired(page, { eo: 'yes' });
  ok(await page.locator('#ct-eo_file .tr-ct-err').count() === 0, 'E&O "Yes" with no certificate is not an error');
  await page.getByRole('button', { name: /Encrypt and send to BIG/ }).click();
  await page.waitForSelector('text=BIG is entering it in SureLC', { timeout: 20000 });
  st = await state(page);
  ok(st.db.contracting_secrets.length === 1 && st.db.contracting_secrets[0].submitted_at && st.db.contracting_files.length === 0, 'sends with no files at all (E&O and AML Yes, no certificates)');
  await page.context().close();

  page = await asAgent(JSON.parse(JSON.stringify(afterAgreement)));
  await page.evaluate(() => { window.__PL.failKind = 'bank_doc'; });
  await page.getByRole('button', { name: 'Fill out the form' }).click();
  await page.waitForSelector('text=Encrypted on this device before it\'s sent');
  await fillRequired(page, { eo: 'no' });
  const bankPdf2 = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n' + 'w'.repeat(9000));
  await page.locator('#ct-bank_file input[type=file]').setInputFiles({ name: 'bank-letter.pdf', mimeType: 'application/pdf', buffer: bankPdf2 });
  await page.getByRole('button', { name: /Encrypt and send to BIG/ }).click();
  await page.waitForSelector('text=Your info is sent.', { timeout: 20000 });
  ok(await page.locator('text=bank-letter.pdf').count() > 0, 'a file that fails to upload is named, and the info still goes');
  await shot(page, `${SHOTS}/09b-agent-file-left-out.png`);
  st = await state(page);
  ok(st.db.contracting_secrets.length === 1 && st.db.contracting_secrets[0].submitted_at && !st.db.contracting_files.some(f => f.kind === 'bank_doc'), 'info saved without the failed file');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForSelector('text=BIG is entering it in SureLC');
  ok(true, 'Done goes back to the path showing it was sent');
  await page.context().close();

  // ---- 9. Off: agents keep the InsuraCloud steps ------------------------------------------
  const off = base(); off.contracting_settings[0].enabled = false;
  page = await asAgent(off);
  ok(await page.locator('text=Get your contracting link from your manager').count() > 0 && await page.locator('text=InsuraCloud').count() === 0, 'with contracting off, agents see the contracting-link steps (no InsuraCloud)');
  await page.context().close();
} catch (e) {
  failures++;
  console.log('FAIL (crash)', e.message.split('\n').slice(0, 3).join(' | ')); console.log(e.stack.split('\n').filter(l => l.includes('flow-contracting')).slice(0, 2).join('\n'));
  try { const pages = (await (await import('./lib.mjs')).getBrowser()).contexts().flatMap(c => c.pages()); if (pages[0]) { await shot(pages[pages.length - 1], `${SHOTS}/zz-crash.png`, { fullPage: true }); console.log((pages[pages.length - 1].errors || []).slice(0, 6).join('\n')); } } catch { /* ignore */ }
}
await closeBrowser(); srv.close();
console.log(failures ? `${failures} FAILED` : 'ALL CONTRACTING FLOWS PASSED');
process.exit(failures ? 1 : 0);
