// The shared data layer (src/data/live.js): one remembered copy per query,
// shared requests, reloads after changes and when the app comes back.
import { cameBack, changed, FRESH_MS, forgetAll, peek, reload, setData, watch } from '../../src/data/live.js';
import { invalidateAppointments } from '../../src/data/apptCache.js';

let failures = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { failures++; console.log('FAIL', m); } };
const realNow = Date.now;
let skew = 0;
Date.now = () => realNow() + skew;
const later = ms => { skew += ms; };
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
const settle = () => tick(320); // changes settle after 250 ms

// A loader that counts its calls and can be held open.
function loader(values) {
  const f = async () => {
    f.calls++;
    const v = typeof values === 'function' ? values(f.calls) : values;
    if (f.hold) await f.hold;
    return v;
  };
  f.calls = 0;
  return f;
}

{
  const load = loader(n => `copy ${n}`);
  let seen = 0;
  ok(peek('a').loading, 'nothing loaded yet: loading');
  const stop = watch('a', load, {}, () => { seen++; });
  await tick();
  ok(load.calls === 1 && peek('a').data === 'copy 1' && !peek('a').loading, 'the first screen loads it');
  ok(seen === 1, 'and hears when it arrives');
  const stop2 = watch('a', load, {}, () => {});
  await tick();
  ok(load.calls === 1, 'a second screen within 30 seconds uses the same copy');
  stop(); stop2();
  later(FRESH_MS + 1);
  const stop3 = watch('a', load, {}, () => {});
  ok(peek('a').data === 'copy 1', 'coming back after 30 seconds shows the last copy at once');
  await tick();
  ok(load.calls === 2 && peek('a').data === 'copy 2', 'and loads a fresh one behind it');
  stop3();
}

{
  const load = loader(n => n);
  let release;
  load.hold = new Promise(r => { release = r; });
  const s1 = watch(['b', 1], load, {}, () => {});
  const s2 = watch(['b', 1], load, {}, () => {});
  ok(load.calls === 0 || load.calls === 1, 'two screens at once');
  await tick();
  ok(load.calls === 1, 'share one request');
  release(); load.hold = null; await tick();
  ok(peek(['b', 1]).data === 1, 'keys can be lists');
  s1(); s2();
}

{
  const load = loader(n => `appts ${n}`);
  const other = loader(n => `prospects ${n}`);
  const s = watch('c', load, { topics: ['appointments'] }, () => {});
  const t = watch('d', other, { topics: ['prospects'] }, () => {});
  await tick();
  changed('appointments');
  changed('appointments');
  await settle();
  ok(load.calls === 2 && peek('c').data === 'appts 2', 'a change reloads what lists that topic, once for changes close together');
  ok(other.calls === 1, 'and nothing else');
  s(); t();
  changed('appointments');
  await settle();
  ok(load.calls === 2, 'a copy no screen is showing waits');
  const s2 = watch('c', load, { topics: ['appointments'] }, () => {});
  await tick();
  ok(load.calls === 3 && peek('c').data === 'appts 3', 'and reloads when it is shown again, even inside 30 seconds');
  s2();
}

{
  const load = loader(n => `v${n}`);
  let release;
  load.hold = new Promise(r => { release = r; });
  const s = watch('e', load, { topics: ['appointments'] }, () => {});
  await tick();
  changed('appointments');
  await settle();
  ok(load.calls === 1, 'a change during a load waits for it');
  load.hold = null; release(); await tick(); await tick();
  ok(load.calls === 2 && peek('e').data === 'v2', 'then loads again, since the first may be from before the change');
  s();
}

{
  const load = loader(n => n);
  const s = watch('f', load, {}, () => {});
  await tick();
  cameBack(); await tick();
  ok(load.calls === 1, 'back to the app within 30 seconds: no reload');
  later(FRESH_MS + 1);
  cameBack(); await tick();
  ok(load.calls === 2, 'back after 30 seconds: what is on screen reloads');
  s();
  later(FRESH_MS + 1);
  cameBack(); await tick();
  ok(load.calls === 2, 'what is not on screen does not');
}

{
  let fail = false;
  const load = async () => { if (fail) throw new Error('offline'); return ['kept']; };
  const errs = console.error; console.error = () => {};
  const s = watch('g', load, { topics: ['x'] }, () => {});
  await tick();
  fail = true;
  const back = await reload('g');
  console.error = errs;
  ok(back[0] === 'kept' && peek('g').error && peek('g').data[0] === 'kept', 'a failed reload keeps the last copy on screen');
  fail = false;
  const again = await reload('g');
  ok(again[0] === 'kept' && !peek('g').error, 'reload() resolves with the new copy');
  let heard = 0;
  const s2 = watch('g', load, {}, () => { heard++; });
  setData('g', list => [...list, 'mine']);
  ok(peek('g').data.length === 2 && heard === 1, 'set() changes the copy in place for everyone showing it');
  s(); s2();
}

{
  const load = loader(n => n);
  const s = watch('h', load, { topics: ['appointments'] }, () => {});
  await tick();
  invalidateAppointments();
  invalidateAppointments();
  await settle();
  ok(load.calls === 2, 'saving an appointment (before and after the write) reloads once');
  s();
}

{
  const load = loader(n => n);
  watch('i', load, {}, () => {});
  await tick();
  forgetAll();
  ok(peek('i').loading && peek('a').data === undefined, 'signing out forgets every copy');
}

{
  const load = loader(() => undefined);
  const s = watch('j', load, {}, () => {});
  await tick();
  ok(!peek('j').loading && peek('j').data === null, 'a loader that returns nothing still finishes loading');
  s();
}

{
  // Dozens of week pages: old hidden copies are let go.
  for (let w = 0; w < 60; w++) { const s = watch(['week', w], async () => w, {}, () => {}); await tick(); s(); later(5); }
  const kept = Array.from({ length: 60 }, (_, w) => peek(['week', w]).data !== undefined).filter(Boolean).length;
  ok(kept <= 40 && peek(['week', 59]).data === 59 && peek(['week', 0]).data === undefined, `hidden copies are capped (kept ${kept}, the newest first)`);
}

console.log(failures ? `${failures} FAILED` : 'ALL LIVE DATA CHECKS PASSED');
process.exit(failures ? 1 : 0);
