// google-create-event: the event keeps the appointment's time zone, and
// every invitation says the time in it.
import path from 'node:path';
import { bundleFunction } from '../tools/bundle.mjs';
import { REPO, TESTS, OUT } from '../tools/paths.mjs';
const here = path.dirname(new URL(import.meta.url).pathname);
Object.assign(process.env, { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret' });
const E = await bundleFunction('google-create-event');
const PL = globalThis.__PL;
let failures = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { failures++; console.log('FAIL', m); } };
const ME = '22222222-2222-2222-2222-222222222222';
PL.user = { id: ME, email: 'chris@example.com' };
PL.db.google_calendar_connections = [{ user_id: ME, access_token: 'tok', refresh_token: 'r', access_token_expires_at: new Date(Date.now() + 3600e3).toISOString() }];
const sent = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.startsWith('https://www.googleapis.com/calendar/v3/calendars/primary/events')) {
    const body = JSON.parse(init.body); sent.push({ url, body });
    return new Response(JSON.stringify({ id: 'ev1', organizer: { email: 'chris@example.com' } }), { status: 200 });
  }
  return new Response('{}', { status: 404 });
};
const call = async body => {
  const r = await E.handle(new Request('https://x/functions/v1/google-create-event', { method: 'POST', headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json(), event: sent.at(-1) && sent.at(-1).body };
};

// Chris, Eastern, 5:00-6:00 PM on Nov 6 (that's 22:00 UTC, EST)
let r = await call({ title: 'Meeting with Jordan', description: 'Join Zoom: https://us06web.zoom.us/j/1', location: 'https://us06web.zoom.us/j/1',
  attendees: ['client@example.com'], startDateTime: '2026-11-06T17:00:00', endDateTime: '2026-11-06T18:00:00', timezone: 'America/New_York' });
ok(r.status === 200 && r.body.ownPushed && r.body.invited.includes('client@example.com'), 'event made, client invited');
ok(r.event.start.timeZone === 'America/New_York' && r.event.start.dateTime === '2026-11-06T17:00:00', 'the event keeps the appointment\'s zone and time');
ok(r.event.description.startsWith('When: Friday, November 6, 5:00 – 6:00 PM EST\n\nJoin Zoom:'), 'the invite says the time in Eastern first: ' + JSON.stringify(r.event.description.split('\n')[0]));
ok(sent.at(-1).url.endsWith('?sendUpdates=all'), 'Google still emails the invitations');
// Summer: daylight time
r = await call({ title: 'T', startDateTime: '2026-07-14T11:30:00', endDateTime: '2026-07-14T12:30:00', timezone: 'America/New_York' });
ok(r.event.description === 'When: Tuesday, July 14, 11:30 AM – 12:30 PM EDT', 'summer: EDT, across noon: ' + r.event.description);
// No time zone sent: the agency's Central, never UTC
r = await call({ title: 'T', startDateTime: '2026-11-06T16:00:00', endDateTime: '2026-11-06T17:00:00' });
ok(r.event.start.timeZone === 'America/Chicago' && /4:00 – 5:00 PM CST/.test(r.event.description), 'no zone sent: Central, not UTC');
r = await call({ title: 'T', startDateTime: '2026-11-06T16:00:00', endDateTime: '2026-11-06T17:00:00', timezone: 'Mars/Olympus' });
ok(r.event.start.timeZone === 'America/Chicago', 'a made-up zone: Central');
// Pacific and Hawaii
r = await call({ title: 'T', startDateTime: '2026-11-06T09:00:00', endDateTime: '2026-11-06T10:30:00', timezone: 'America/Los_Angeles' });
ok(/Friday, November 6, 9:00 – 10:30 AM PST/.test(r.event.description), 'Pacific: ' + r.event.description);
// The night DST ends (1:30 AM happens twice on Nov 1 2026) still gives a real time
const i = E.zonedInstant('2026-11-01T01:30:00', 'America/Chicago');
ok(i && (i.toISOString() === '2026-11-01T06:30:00.000Z' || i.toISOString() === '2026-11-01T07:30:00.000Z'), 'the repeated hour still lands on a real time ' + (i && i.toISOString()));
ok(E.zonedInstant('2026-11-06T17:00:00', 'America/New_York').toISOString() === '2026-11-06T22:00:00.000Z', '5 PM Eastern = 22:00 UTC (what Chris\'s invite showed)');
// No description from the app: just the time
r = await call({ title: 'T', startDateTime: '2026-11-06T17:00:00', endDateTime: '2026-11-06T18:00:00', timezone: 'America/New_York' });
ok(r.event.description === 'When: Friday, November 6, 5:00 – 6:00 PM EST', 'without Zoom: just the time line');
// Signed out: refused
PL.user = null;
const out = await E.handle(new Request('https://x/', { method: 'POST', headers: { Authorization: 'Bearer nope' }, body: '{}' }));
ok(out.status === 401, 'not signed in: 401');
console.log(failures ? `${failures} FAILED` : 'ALL GOOGLE EVENT TESTS PASSED');
process.exit(failures ? 1 : 0);
