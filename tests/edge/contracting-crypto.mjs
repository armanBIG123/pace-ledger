// Round trip: the browser's vault.js encrypts, the edge function's code decrypts.
import path from 'node:path';
import { bundleFunction } from '../tools/bundle.mjs';
import { REPO } from '../tools/paths.mjs';
const repo = REPO;
const fn = await bundleFunction('contracting');
const vault = await import(path.join(repo, 'src/lib/vault.js'));
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } else console.log('ok', m); };

const { publicJwk, keyId, privateText } = await vault.generateKeyPair();
assert(/^[0-9a-f]{16}$/.test(keyId), 'key id is 16 hex');
assert(publicJwk.alg === 'RSA-OAEP-256' && !publicJwk.d && publicJwk.n.length >= 340, 'public key has no private part');
assert(privateText.startsWith(`PLKEY1.${keyId}.`), 'private key text format');
const pk = await fn.importPrivateKey(privateText);
assert(pk && pk.keyId === keyId, 'edge function reads the private key');
const pkWrapped = await fn.importPrivateKey(privateText.replace(/(.{60})/g, '$1\n'));
assert(pkWrapped && pkWrapped.keyId === keyId, 'line breaks in the pasted secret are fine');

const userId = '22222222-2222-2222-2222-222222222222';
const fields = { ssn: '123456789', dob: '1994-04-12', first_name: 'Jördan ✓', background: JSON.stringify({ answers: Array(19).fill('no'), notes: { 6: 'x'.repeat(900) } }), middle_name: '' };
const bigFile = new Uint8Array(3 * 1024 * 1024).map((_, i) => i % 251);
const sub = await vault.encryptSubmission({ publicJwk, userId, fields, files: [{ kind: 'eo_certificate', name: 'E&O cert.pdf', mime: 'application/pdf', bytes: bigFile }] });
assert(sub.keyId === keyId, 'submission carries the key id');
assert(!('middle_name' in sub.fields), 'empty fields are left out');
assert(sub.wrappedKey.length >= 100 && sub.wrappedKey.length <= 2000, 'wrapped key fits the column');
for (const [k, v] of Object.entries(sub.fields)) {
  assert(v.iv.length === 16, `${k} iv is 12 bytes`);
  const out = new TextDecoder().decode(await fn.openSealed(pk.key, sub.wrappedKey, v.iv, v.ct, fn.fieldAad(userId, k)));
  assert(out === fields[k], `${k} round-trips`);
}
const f = sub.files[0];
const back = await fn.openSealed(pk.key, sub.wrappedKey, f.iv, f.ct, fn.fileAad(userId, f.kind));
assert(back.length === bigFile.length && back.every((b, i) => b === bigFile[i]), '3 MB file round-trips');
assert(f.ct.length <= 5600000, 'file fits the column');
const nm = new TextDecoder().decode(await fn.openSealed(pk.key, sub.wrappedKey, f.name.iv, f.name.ct, fn.fileNameAad(userId, f.kind)));
assert(nm === 'E&O cert.pdf', 'file name round-trips');

let moved = false;
try { await fn.openSealed(pk.key, sub.wrappedKey, sub.fields.ssn.iv, sub.fields.ssn.ct, fn.fieldAad(userId, 'dob')); moved = true; } catch {}
assert(!moved, 'a value moved to another field will not open');
try { await fn.openSealed(pk.key, sub.wrappedKey, sub.fields.ssn.iv, sub.fields.ssn.ct, fn.fieldAad('33333333-3333-3333-3333-333333333333', 'ssn')); moved = true; } catch {}
assert(!moved, 'a value moved to another person will not open');
const other = await vault.generateKeyPair();
const pk2 = await fn.importPrivateKey(other.privateText);
try { await fn.openSealed(pk2.key, sub.wrappedKey, sub.fields.ssn.iv, sub.fields.ssn.ct, fn.fieldAad(userId, 'ssn')); moved = true; } catch {}
assert(!moved, 'a different private key will not open it');

const chk = await vault.encryptKeyCheck(publicJwk, userId);
const said = new TextDecoder().decode(await fn.openSealed(pk.key, chk.wrappedKey, chk.iv, chk.ct, fn.checkAad(userId)));
assert(said === `pl-key-check:${userId}`, 'key check opens');

const now = Math.floor(Date.now() / 1000);
assert(fn.freshTwoStep({ aal: 'aal2', amr: [{ method: 'totp', timestamp: now - 60 }] }), 'fresh two-step passes');
assert(!fn.freshTwoStep({ aal: 'aal2', amr: [{ method: 'totp', timestamp: now - 13 * 3600 }] }), 'two-step older than 12 hours fails');
assert(!fn.freshTwoStep({ aal: 'aal1', amr: [{ method: 'totp', timestamp: now }] }), 'aal1 fails');
assert(!fn.freshTwoStep({ aal: 'aal2', amr: [{ method: 'password', timestamp: now }] }), 'password only fails');
assert(Object.keys(fn.FIELD_LABELS).length === 28, '28 fields known to the edge function');
console.log('ALL CRYPTO TESTS PASSED');
