// In-memory stand-in for @supabase/supabase-js, for the preview build.
// Tests seed it through window.__PL_SEED and read/write window.__PL.
/* eslint-disable */
const b64u = s => btoa(unescape(encodeURIComponent(s))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(16).slice(2));
const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

const seed = (typeof window !== 'undefined' && window.__PL_SEED) || {};
const PL = (window.__PL = window.__PL || {
  db: clone(seed.db || {}),
  rpc: {},
  fn: {},
  storage: {},
  user: seed.user || null,           // { id, email }
  factors: clone(seed.factors || []),
  aal: seed.aal || 'aal1',
  totpAt: seed.totpAt || null,
  calls: [],
  listeners: new Set(),
  delay: seed.delay || 0,
});

if (typeof window !== 'undefined' && typeof window.__PL_SETUP === 'function' && !PL.setupDone) { PL.setupDone = true; window.__PL_SETUP(PL); }

function token() {
  if (!PL.user) return null;
  const now = Math.floor(Date.now() / 1000);
  const amr = [{ method: 'password', timestamp: now - 3600 }];
  if (PL.aal === 'aal2' && PL.totpAt) amr.unshift({ method: 'totp', timestamp: PL.totpAt });
  const payload = { sub: PL.user.id, email: PL.user.email, role: 'authenticated', aal: PL.aal, amr, exp: now + 3600 };
  return `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify(payload))}.sig`;
}
function session() {
  if (!PL.user) return null;
  return { access_token: token(), refresh_token: 'r', expires_in: 3600, token_type: 'bearer', user: { id: PL.user.id, email: PL.user.email, created_at: PL.user.created_at || '2026-01-05T12:00:00Z' } };
}
PL.session = session;
PL.emit = ev => { const s = session(); PL.listeners.forEach(cb => { try { cb(ev, s); } catch (e) { console.error(e); } }); };
const wait = () => new Promise(r => setTimeout(r, PL.delay));

function table(name) { if (!PL.db[name]) PL.db[name] = []; return PL.db[name]; }
const get = (row, col) => col.split('->>').reduce((v, k) => (v == null ? v : v[k]), row);

class Query {
  constructor(name) { this.name = name; this.filters = []; this.op = 'select'; this.orders = []; this.lim = null; this.rng = null; this.one = null; this.wantRows = false; this.countOpt = null; this.head = false; }
  select(cols, opts) { if (this.op === 'select') this.op = 'select'; else this.wantRows = true; if (opts && opts.count) this.countOpt = opts.count; if (opts && opts.head) this.head = true; return this; }
  eq(c, v) { this.filters.push(r => get(r, c) === v); return this; }
  neq(c, v) { this.filters.push(r => get(r, c) !== v); return this; }
  in(c, arr) { this.filters.push(r => arr.includes(get(r, c))); return this; }
  is(c, v) { this.filters.push(r => (v === null ? get(r, c) == null : get(r, c) === v)); return this; }
  not(c, op, v) { if (op === 'is') this.filters.push(r => (v === null ? get(r, c) != null : get(r, c) !== v)); else if (op === 'eq') this.filters.push(r => get(r, c) !== v); else if (op === 'in') { const arr = String(v).replace(/[()]/g, '').split(','); this.filters.push(r => !arr.includes(String(get(r, c)))); } return this; }
  gte(c, v) { this.filters.push(r => get(r, c) != null && get(r, c) >= v); return this; }
  lte(c, v) { this.filters.push(r => get(r, c) != null && get(r, c) <= v); return this; }
  gt(c, v) { this.filters.push(r => get(r, c) != null && get(r, c) > v); return this; }
  lt(c, v) { this.filters.push(r => get(r, c) != null && get(r, c) < v); return this; }
  ilike(c, v) { const re = new RegExp('^' + String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i'); this.filters.push(r => re.test(String(get(r, c) ?? ''))); return this; }
  contains(c, v) { this.filters.push(r => Array.isArray(get(r, c)) && [].concat(v).every(x => get(r, c).includes(x))); return this; }
  or() { return this; }
  match(o) { Object.entries(o).forEach(([k, v]) => this.eq(k, v)); return this; }
  filter(c, op, v) { return op === 'eq' ? this.eq(c, v) : this; }
  order(c, o = {}) { this.orders.push([c, o.ascending !== false]); return this; }
  limit(n) { this.lim = n; return this; }
  range(a, b) { this.rng = [a, b]; return this; }
  single() { this.one = 'single'; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }
  abortSignal() { return this; }
  throwOnError() { return this; }
  insert(rows) { this.op = 'insert'; this.payload = [].concat(rows); return this; }
  update(p) { this.op = 'update'; this.payload = p; return this; }
  upsert(rows, o = {}) { this.op = 'upsert'; this.payload = [].concat(rows); this.conflict = (o.onConflict || 'id').split(',').map(s => s.trim()); return this; }
  delete() { this.op = 'delete'; return this; }
  async run() {
    await wait();
    PL.calls.push({ table: this.name, op: this.op });
    const hook = PL.tableHooks && PL.tableHooks[this.name];
    if (hook) { const r = hook(this); if (r) return r; }
    const t = table(this.name);
    const match = r => this.filters.every(f => f(r));
    let rows;
    if (this.op === 'insert') {
      rows = this.payload.map(r => ({ id: uuid(), created_at: new Date().toISOString(), ...clone(r) }));
      t.push(...rows);
    } else if (this.op === 'upsert') {
      rows = this.payload.map(r => {
        const hit = t.find(x => this.conflict.every(k => x[k] === r[k]));
        if (hit) { Object.assign(hit, clone(r), { updated_at: new Date().toISOString() }); return hit; }
        const n = { id: uuid(), created_at: new Date().toISOString(), ...clone(r) }; t.push(n); return n;
      });
    } else if (this.op === 'update') {
      rows = t.filter(match); rows.forEach(r => Object.assign(r, clone(this.payload)));
    } else if (this.op === 'delete') {
      rows = t.filter(match); PL.db[this.name] = t.filter(r => !match(r));
    } else {
      rows = t.filter(match);
      for (const [c, asc] of [...this.orders].reverse()) rows = [...rows].sort((a, b) => { const x = get(a, c), y = get(b, c); if (x === y) return 0; if (x == null) return 1; if (y == null) return -1; return (x < y ? -1 : 1) * (asc ? 1 : -1); });
      if (this.rng) rows = rows.slice(this.rng[0], this.rng[1] + 1);
      if (this.lim != null) rows = rows.slice(0, this.lim);
    }
    const count = rows.length;
    let data = clone(rows);
    if (this.op !== 'select' && !this.wantRows && !this.one) data = null;
    if (this.one) {
      if (data.length === 0) return this.one === 'maybe' ? { data: null, error: null } : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
      data = data[0];
    }
    if (this.head) data = null;
    return { data, error: null, count };
  }
  then(res, rej) { return this.run().then(res, rej); }
}

const storageApi = bucket => ({
  async upload(path, file) { PL.storage[`${bucket}/${path}`] = file; return { data: { path }, error: null }; },
  async download(path) { const f = PL.storage[`${bucket}/${path}`]; return f ? { data: f instanceof Blob ? f : new Blob([f]), error: null } : { data: null, error: { message: 'Object not found' } }; },
  async createSignedUrl(path) { return { data: { signedUrl: `https://example.invalid/${bucket}/${path}?signed=1` }, error: null }; },
  async remove(paths) { paths.forEach(p => delete PL.storage[`${bucket}/${p}`]); return { data: paths, error: null }; },
  getPublicUrl(path) { return { data: { publicUrl: `https://example.invalid/${bucket}/${path}` } }; },
  async list() { return { data: [], error: null }; },
});

function makeClient() {
  const client = {
    supabaseUrl: 'https://mock.supabase.co',
    supabaseKey: 'mock',
    from: name => new Query(name),
    async rpc(name, args = {}) {
      await wait();
      PL.calls.push({ rpc: name, args });
      const h = PL.rpc[name];
      if (!h) return { data: null, error: { message: `rpc ${name} not mocked` } };
      try { return { data: clone(await h(args, PL)), error: null }; } catch (e) { return { data: null, error: { message: e.message || String(e), code: e.code } }; }
    },
    functions: {
      async invoke(name, opts = {}) {
        await wait();
        PL.calls.push({ fn: name, body: opts.body });
        const h = PL.fn[name];
        if (!h) return { data: null, error: { message: `function ${name} not mocked` } };
        try { return { data: clone(await h(opts.body || {}, PL)), error: null }; } catch (e) { const msg = e.message || String(e); return { data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { status: e.status || 400, json: async () => ({ error: msg, detail: e.detail }) } } }; }
      },
    },
    storage: { from: storageApi },
    channel() { const ch = { on() { return ch; }, subscribe(cb) { if (cb) setTimeout(() => cb('SUBSCRIBED')); return ch; }, unsubscribe() {} }; return ch; },
    removeChannel() {},
    auth: {
      async getSession() { return { data: { session: session() }, error: null }; },
      async getUser() { return { data: { user: PL.user ? session().user : null }, error: null }; },
      onAuthStateChange(cb) { PL.listeners.add(cb); setTimeout(() => cb('INITIAL_SESSION', session())); return { data: { subscription: { unsubscribe() { PL.listeners.delete(cb); } } } }; },
      async signOut() { PL.user = null; PL.emit('SIGNED_OUT'); return { error: null }; },
      async signInWithPassword() { return { data: {}, error: { message: 'mock' } }; },
      async signUp() { return { data: {}, error: { message: 'mock' } }; },
      async resetPasswordForEmail() { return { data: {}, error: null }; },
      async updateUser() { return { data: {}, error: null }; },
      async refreshSession() { return { data: { session: session() }, error: null }; },
      admin: { async getUserById(id) { const e = PL.emails && PL.emails[id]; return e ? { data: { user: { id, email: e } }, error: null } : { data: { user: null }, error: { message: 'not found' } }; } },
      mfa: {
        async listFactors() { const all = clone(PL.factors); return { data: { all, totp: all.filter(f => f.factor_type === 'totp' && f.status === 'verified'), phone: [] }, error: null }; },
        async enroll({ friendlyName }) {
          const id = uuid();
          PL.factors.push({ id, factor_type: 'totp', status: 'unverified', friendly_name: friendlyName || 'Authenticator' });
          const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 21 21'><rect width='21' height='21' fill='white'/><path d='M1 1h7v7H1zM13 1h7v7h-7zM1 13h7v7H1zM10 10h2v2h-2zM14 14h2v2h-2zM17 11h2v4h-2zM11 15h2v4h-2z' fill='black'/></svg>";
          return { data: { id, type: 'totp', totp: { qr_code: `data:image/svg+xml;utf-8,${svg}`, secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/PaceLedger' } }, error: null };
        },
        async unenroll({ factorId }) { PL.factors = PL.factors.filter(f => f.id !== factorId); return { data: { id: factorId }, error: null }; },
        async challenge({ factorId }) { return { data: { id: 'ch-' + factorId, type: 'totp', expires_at: 0 }, error: null }; },
        async verify({ factorId, code }) {
          await wait();
          if (!/^\d{6}$/.test(code || '') || code === '000000') return { data: null, error: { message: 'Invalid TOTP code entered', code: 'mfa_verification_failed' } };
          const f = PL.factors.find(x => x.id === factorId); if (f) f.status = 'verified';
          PL.aal = 'aal2'; PL.totpAt = Math.floor(Date.now() / 1000);
          PL.emit('MFA_CHALLENGE_VERIFIED');
          return { data: session(), error: null };
        },
        async challengeAndVerify({ factorId, code }) { return client.auth.mfa.verify({ factorId, challengeId: 'x', code }); },
        async getAuthenticatorAssuranceLevel() {
          const verified = PL.factors.some(f => f.status === 'verified');
          return { data: { currentLevel: PL.aal, nextLevel: verified ? 'aal2' : 'aal1', currentAuthenticationMethods: [] }, error: null };
        },
      },
    },
  };
  return client;
}
let singleton = null;
export function createClient() { if (!singleton) singleton = makeClient(); return singleton; }
export default { createClient };
