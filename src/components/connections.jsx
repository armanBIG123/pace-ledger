// Calendar & Zoom: Google Calendar, Zoom and (for anyone who presents)
// Presenting hours, in one window. Opened from Calendar's "Calendar
// settings" button and from the account menu under your name.
//
// Changes tell the rest of the app (paceledger:connections-changed), so
// Calendar shows or drops Google events straight away.
import { useEffect, useState } from 'react';
import { CalendarClock, CalendarDays, Video, X } from 'lucide-react';
import { connectGoogleCalendar, disconnectGoogleCalendar, disconnectZoom, fetchGoogleConnectionStatus, fetchZoomConnectionStatus, startZoomConnect } from '../data/integrations.js';
import { fetchMyPresentingHours } from '../data/availability.js';
import { isNativeApp, openInBrowserSheet, PUBLIC_SITE_URL } from '../native.js';
import { seesTeam } from '../data/team.js';
import { isAdmin } from '../lib/roles.js';
import { askConfirm } from './confirm.jsx';
import { Modal } from './ui.jsx';

export const connectionsChanged = () => window.dispatchEvent(new Event('paceledger:connections-changed'));
export const openConnections = () => window.dispatchEvent(new Event('paceledger:open-connections'));
// Anyone who presents for a team can set presenting hours.
export const presentsForTeam = user => seesTeam(user) || isAdmin(user);

// Google's sign-in can't run inside the app's web view, so in the app the
// connection is made on the website in a browser sheet.
export async function startGoogleConnect(user, onDone) {
  if (isNativeApp()) {
    await openInBrowserSheet(`${PUBLIC_SITE_URL}/?connect=google&for=${encodeURIComponent(user.id)}`, () => { connectionsChanged(); if (onDone) onDone(); });
    return;
  }
  await connectGoogleCalendar();
}

// "Mon–Thu 6–9 PM · Sat 10 AM–2 PM" from presenting hours.
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const SHORT = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };
const clock = t => {
  if (t === '24:00') return 'midnight';
  const [h, m] = t.split(':').map(Number);
  return { h: h % 12 || 12, m, pm: h >= 12 };
};
function range(r) {
  const a = clock(r.start), b = clock(r.end);
  const fmt = (c, withAmPm) => (typeof c === 'string' ? c : `${c.h}${c.m ? `:${String(c.m).padStart(2, '0')}` : ''}${withAmPm ? ` ${c.pm ? 'PM' : 'AM'}` : ''}`);
  if (typeof b === 'string') return `${fmt(a, true)} to midnight`;
  return `${fmt(a, a.pm !== b.pm)}–${fmt(b, true)}`;
}
export function summarizeHours(hours) {
  const byDay = new Map();
  hours.forEach(h => byDay.set(h.weekday, [...(byDay.get(h.weekday) || []), h]));
  const key = d => (byDay.get(d) || []).map(r => `${r.start}-${r.end}`).sort().join(',');
  const runs = [];
  ORDER.forEach(d => {
    if (!byDay.has(d)) return;
    const last = runs[runs.length - 1];
    if (last && last.key === key(d) && ORDER.indexOf(d) === ORDER.indexOf(last.to) + 1) last.to = d;
    else runs.push({ from: d, to: d, key: key(d), ranges: byDay.get(d).slice().sort((x, y) => x.start.localeCompare(y.start)) });
  });
  return runs.map(r => `${SHORT[r.from]}${r.to !== r.from ? `–${SHORT[r.to]}` : ''} ${r.ranges.map(range).join(', ')}`).join(' · ');
}

function Row({ Icon, title, sub, on, children }) {
  return (
    <div className={`tr-conn-row ${on ? 'tr-conn-row-on' : ''}`}>
      <span className="tr-conn-icon" aria-hidden="true"><Icon size={18} /></span>
      <div className="tr-conn-text">
        <div className="tr-conn-title">{title}{on != null ? <span className={`tr-conn-state ${on ? 'tr-conn-state-on' : ''}`}>{on ? 'Connected' : 'Not connected'}</span> : null}</div>
        <div className="tr-conn-sub">{sub}</div>
      </div>
      <div className="tr-conn-act">{children}</div>
    </div>
  );
}

export function ConnectionsSheet({ user, onClose, onEditHours }) {
  const [google, setGoogle] = useState(null);
  const [zoom, setZoom] = useState(null);
  const [hours, setHours] = useState(undefined);
  const [busy, setBusy] = useState('');
  const presents = presentsForTeam(user);
  const loadGoogle = () => fetchGoogleConnectionStatus().then(setGoogle).catch(() => setGoogle({ connected: false }));
  const loadZoom = () => fetchZoomConnectionStatus().then(setZoom).catch(() => setZoom({ connected: false }));
  useEffect(() => {
    loadGoogle(); loadZoom();
    if (presents) fetchMyPresentingHours(user.id).then(setHours).catch(() => setHours(null));
    const again = () => { loadGoogle(); loadZoom(); };
    window.addEventListener('paceledger:google-connected', again);
    return () => window.removeEventListener('paceledger:google-connected', again);
  }, [user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function googleDisconnect() {
    if (!(await askConfirm({ title: 'Disconnect Google Calendar?', body: "Your Google events stop showing in PaceLedger, and new appointments aren't added to your Google Calendar.", confirmLabel: 'Disconnect', danger: true }))) return;
    setBusy('google');
    if (await disconnectGoogleCalendar()) { setGoogle({ connected: false }); connectionsChanged(); }
    setBusy('');
  }
  async function zoomDisconnect() {
    if (!(await askConfirm({ title: 'Disconnect Zoom?', body: "New appointments won't get their own meeting link until you connect it again.", confirmLabel: 'Disconnect', danger: true }))) return;
    setBusy('zoom');
    if (await disconnectZoom()) { setZoom({ connected: false }); connectionsChanged(); }
    setBusy('');
  }

  const hoursSet = hours && !hours.unavailable && !hours.error && hours.saved && hours.hours.length > 0;
  return (
    <Modal onClose={onClose} className="tr-conn" labelledBy="tr-conn-title">
      <div className="tr-modal-head">
        <h3 className="tr-h3" id="tr-conn-title">Calendar &amp; Zoom</h3>
        <button type="button" className="tr-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>
      <Row Icon={CalendarDays} title="Google Calendar" on={google ? !!google.connected : null}
        sub={!google ? 'Checking…' : google.connected
          ? `As ${google.googleEmail || 'your Google account'}. Your Google events show on Calendar, and appointments you log go on your Google Calendar.`
          : 'See your Google events on Calendar, and put appointments (and their invites) on your Google Calendar.'}>
        {!google ? null : google.connected
          ? <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={googleDisconnect} disabled={busy === 'google'}>Disconnect</button>
          : <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" disabled={busy === 'google'} onClick={() => { if (!isNativeApp()) setBusy('google'); startGoogleConnect(user, loadGoogle); }}>{busy === 'google' ? 'Opening…' : 'Connect'}</button>}
      </Row>
      <Row Icon={Video} title="Zoom" on={zoom ? !!zoom.connected : null}
        sub={!zoom ? 'Checking…' : zoom.connected
          ? `As ${zoom.zoomEmail || 'your Zoom account'}. New appointments get their own meeting link.`
          : 'Connect it and new appointments get their own meeting link.'}>
        {!zoom ? null : zoom.connected
          ? <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={zoomDisconnect} disabled={busy === 'zoom'}>Disconnect</button>
          : <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" disabled={busy === 'zoom'} onClick={() => { if (!isNativeApp()) setBusy('zoom'); startZoomConnect(() => { loadZoom(); connectionsChanged(); }); }}>{busy === 'zoom' ? 'Opening…' : 'Connect'}</button>}
      </Row>
      {presents ? (
        <Row Icon={CalendarClock} title="Presenting hours"
          sub={hours === undefined ? 'Checking…'
            : !hours || hours.unavailable || hours.error ? 'Not available yet.'
            : hoursSet ? <>{summarizeHours(hours.hours)}{hours.settings.accepting ? '' : <strong className="tr-conn-paused"> · Not taking bookings</strong>}</>
            : 'Not set yet. Set them and your team sees your open times when they log an appointment with you.'}>
          {hours && !hours.unavailable && !hours.error && onEditHours
            ? <button type="button" className={`tr-btn tr-btn-sm ${hoursSet ? 'tr-btn-ghost' : 'tr-btn-brass'}`} onClick={() => { onClose(); onEditHours(); }}>{hoursSet ? 'Edit' : 'Set hours'}</button>
            : null}
        </Row>
      ) : null}
    </Modal>
  );
}
