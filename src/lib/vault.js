// Encryption for contracting info, done in the agent's browser before
// anything is sent.
//
// BIG's public key (an RSA-OAEP key, stored in contracting_settings) locks
// a fresh AES-GCM key made for each submission; that AES key locks every
// field and file. Only the "contracting" edge function holds the private
// key, so the database (and its backups) only ever see scrambled text.
//
// Each piece is tied to its agent and field name (AES-GCM "additional
// data"), so scrambled text can't be moved to another person or field.
// The edge function's decrypt code must stay in step with this file.

const subtle = () => {
  const c = globalThis.crypto && globalThis.crypto.subtle;
  if (!c) throw new Error('This browser can\'t encrypt. Update it, or use another one.');
  return c;
};
const enc = new TextEncoder();

export function toB64(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(b64) {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

// What each encrypted piece is tied to.
export const fieldAad = (userId, key) => `pl1|${userId}|${key}`;
export const fileAad = (userId, kind) => `pl1|${userId}|file|${kind}`;
export const fileNameAad = (userId, kind) => `pl1|${userId}|file-name|${kind}`;
export const checkAad = userId => `pl1|${userId}|key-check`;

// A short id for a public key: the first 16 hex characters of SHA-256(n).
export async function keyIdFor(publicJwk) {
  return hex(await subtle().digest('SHA-256', enc.encode(publicJwk.n))).slice(0, 16);
}

// Makes BIG's key pair. The public half goes in PaceLedger; the private half
// is shown once, to be pasted into the edge function's secrets.
export async function generateKeyPair() {
  const pair = await subtle().generateKey(
    { name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['encrypt', 'decrypt'],
  );
  const full = await subtle().exportKey('jwk', pair.publicKey);
  const publicJwk = { kty: 'RSA', n: full.n, e: full.e, alg: 'RSA-OAEP-256', ext: true, key_ops: ['encrypt'] };
  const keyId = await keyIdFor(publicJwk);
  const pkcs8 = await subtle().exportKey('pkcs8', pair.privateKey);
  return { publicJwk, keyId, privateText: `PLKEY1.${keyId}.${toB64(pkcs8)}` };
}

async function importPublic(publicJwk) {
  return subtle().importKey('jwk', { kty: 'RSA', n: publicJwk.n, e: publicJwk.e, alg: 'RSA-OAEP-256', ext: true },
    { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
}
async function freshAesKey() {
  return subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
}
async function wrap(publicKey, aesKey) {
  const raw = await subtle().exportKey('raw', aesKey);
  return toB64(await subtle().encrypt({ name: 'RSA-OAEP' }, publicKey, raw));
}
async function seal(aesKey, bytes, aad) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, aesKey, bytes);
  return { iv: toB64(iv), ct: toB64(ct) };
}

// fields: { key: string }, files: [{ kind, name, mime, bytes: Uint8Array }]
export async function encryptSubmission({ publicJwk, userId, fields, files = [] }) {
  const publicKey = await importPublic(publicJwk);
  const aesKey = await freshAesKey();
  const out = { keyId: await keyIdFor(publicJwk), wrappedKey: await wrap(publicKey, aesKey), fields: {}, files: [] };
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null || v === '') continue;
    out.fields[k] = await seal(aesKey, enc.encode(String(v)), fieldAad(userId, k));
  }
  for (const f of files) {
    const body = await seal(aesKey, f.bytes, fileAad(userId, f.kind));
    out.files.push({ kind: f.kind, mime: f.mime, size: f.bytes.length, name: await seal(aesKey, enc.encode(f.name || 'file'), fileNameAad(userId, f.kind)), iv: body.iv, ct: body.ct });
  }
  return out;
}

// A test message the edge function must be able to open: proves the
// private key in its secrets matches the public key here.
export async function encryptKeyCheck(publicJwk, userId) {
  const publicKey = await importPublic(publicJwk);
  const aesKey = await freshAesKey();
  const sealed = await seal(aesKey, enc.encode(`pl-key-check:${userId}`), checkAad(userId));
  return { keyId: await keyIdFor(publicJwk), wrappedKey: await wrap(publicKey, aesKey), ...sealed };
}

// Photos are shrunk before encrypting (a phone photo can be 5+ MB).
export async function shrinkImage(file, maxSide = 1800, quality = 0.85) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}
