// A presenter's open times, in the appointment form: a week of days, then
// the times open on the day you pick. Tapping a time fills in the date,
// start and end. Times show in the form's time zone, since that's the one
// the appointment is saved in.
//
// Open times come from the presenter's presenting hours, less what's
// already booked or blocked out (and busy on their Google Calendar when
// they've turned that on). The list is a guide: the database still stops
// a double-booking if two people grab the same time at once.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchOpenTimes } from '../data/availability.js';
import { fmtZonedTime, zonedInstant, zonedParts, zoneAbbr, zoneName } from '../lib/zoned.js';

const DAY_MS = 864e5;
// "2026-10-27" → that calendar day, for labels (noon UTC keeps it on the day).
const asDay = d => new Date(`${d}T12:00:00Z`);
const shiftDay = (d, n) => new Date(asDay(d).getTime() + n * DAY_MS).toISOString().slice(0, 10);
const mondayOf = d => shiftDay(d, -((asDay(d).getUTCDay() + 6) % 7));
const fmtDay = (d, opts) => asDay(d).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });

// Open times that touch or overlap, joined into stretches of free time.
function freeStretches(slots) {
  const out = [];
  for (const s of slots) {
    const last = out[out.length - 1];
    if (last && s.start.getTime() <= last.end) last.end = Math.max(last.end, s.end.getTime());
    else out.push({ start: s.start.getTime(), end: s.end.getTime() });
  }
  return out;
}

// nudgeIfNoHours: say so when the presenter hasn't set presenting hours (a
// manager presenting for you); otherwise nothing shows for them.
export function OpenTimes({ presenterId, presenterName = '', timezone, excludeId = null, selectedDate = '', selectedTime = '', durationMinutes = 0, onPick, refreshKey = '', nudgeIfNoHours = true }) {
  const [state, setState] = useState({ presenterId: null, data: null });
  const [pickedDay, setPickedDay] = useState('');
  const [weekStart, setWeekStart] = useState('');
  const latest = useRef(0);
  const first = String(presenterName || '').trim().split(/\s+/)[0] || 'They';
  const possessive = first === 'They' ? 'Their' : `${first}’s`;

  const load = useCallback(() => {
    if (!presenterId) return;
    const n = ++latest.current;
    fetchOpenTimes({ presenterId, excludeId })
      .catch(() => ({ ok: false }))
      .then(data => {
        if (n !== latest.current) return;
        // A check again that fails (a dropped connection) keeps what's shown.
        setState(prev => (!data.ok && prev.presenterId === presenterId && prev.data && prev.data.ok ? prev : { presenterId, data }));
      });
  }, [presenterId, excludeId]);

  useEffect(() => { load(); }, [load, refreshKey]);
  // Coming back to the app, and every couple of minutes while the form is
  // open, checks again: someone else may have just booked a time.
  useEffect(() => {
    const again = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('focus', again);
    document.addEventListener('visibilitychange', again);
    const t = setInterval(again, 120000);
    return () => { window.removeEventListener('focus', again); document.removeEventListener('visibilitychange', again); clearInterval(t); };
  }, [load]);

  const data = state.presenterId === presenterId ? state.data : null;
  const tz = timezone || (data && data.timezone) || 'America/Chicago';

  // Open times by day, as the clock reads in the form's time zone.
  const byDay = useMemo(() => {
    const m = new Map();
    if (!data || !data.ok) return m;
    for (const s of data.slots) {
      const p = zonedParts(s.start, tz);
      if (!m.has(p.day)) m.set(p.day, []);
      m.get(p.day).push({ ...s, day: p.day, time: p.time });
    }
    return m;
  }, [data, tz]);
  const openDays = [...byDay.keys()];
  const today = zonedParts(new Date(), tz).day;
  const activeDay = byDay.has(pickedDay) ? pickedDay : byDay.has(selectedDate) ? selectedDate : openDays[0] || '';

  // The week shown starts on the Monday of the day in view; the arrows go
  // from this week to the week of the last open day.
  const firstWeek = mondayOf(today);
  const lastWeek = openDays.length ? mondayOf(openDays[openDays.length - 1]) : firstWeek;
  const week = weekStart && weekStart >= firstWeek && weekStart <= lastWeek ? weekStart : mondayOf(activeDay || today);
  // Picking a date by hand moves the days to it when it has open times.
  useEffect(() => {
    if (selectedDate && byDay.has(selectedDate)) { setPickedDay(selectedDate); setWeekStart(mondayOf(selectedDate)); }
  }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps -- not on every refresh

  if (!presenterId || !data) {
    return (
      <div className="tr-open tr-open-loading" aria-busy="true">
        <div className="tr-open-head"><CalendarClock size={16} aria-hidden="true" /><strong>Checking {first === 'They' ? 'open times' : `${possessive} open times`}…</strong></div>
        <div className="tr-open-week" aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <span key={i} className="tr-skel tr-open-skel" />)}</div>
      </div>
    );
  }
  // Before the database update, or someone you can't book with: nothing.
  if (!data.ok) return null;
  if (!data.hasHours) {
    if (!nudgeIfNoHours) return null;
    return (
      <div className="tr-open tr-open-note" role="note">
        <CalendarClock size={16} aria-hidden="true" />
        <span>{first} hasn’t set presenting hours yet, so pick the time below. The app still stops a double-booking.</span>
      </div>
    );
  }
  if (!data.accepting) {
    return (
      <div className="tr-open tr-open-note tr-open-note-warn" role="note">
        <CalendarClock size={16} aria-hidden="true" />
        <span>{first} isn’t taking new bookings right now. Check with {first === 'They' ? 'them' : first} before you pick a time.</span>
      </div>
    );
  }
  if (!openDays.length) {
    return (
      <div className="tr-open tr-open-note" role="note">
        <CalendarClock size={16} aria-hidden="true" />
        <span>{first} has no open times in the next few weeks. Check with {first === 'They' ? 'them' : first} and pick the time below.</span>
      </div>
    );
  }

  const days = Array.from({ length: 7 }, (_, i) => shiftDay(week, i));
  // The day whose times show: the one picked, if it's in this week.
  const shownDay = days.includes(activeDay) ? activeDay : days.find(d => byDay.has(d)) || '';
  const times = byDay.get(shownDay) || [];
  function goWeek(n) {
    const next = shiftDay(week, 7 * n);
    setWeekStart(next);
    setPickedDay(Array.from({ length: 7 }, (_, i) => shiftDay(next, i)).find(d => byDay.has(d)) || '');
  }
  const now = new Date();
  const weekLabel = `${fmtDay(days[0], { month: 'short', day: 'numeric' })} – ${fmtDay(days[6], days[0].slice(5, 7) === days[6].slice(5, 7) ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`;

  // A time typed in by hand that isn't open: say so, but don't stop it
  // (the presenter may have said yes to a time outside their hours; the
  // database still stops one that overlaps a booking).
  let offNote = '';
  if (selectedDate && /^\d{2}:\d{2}$/.test(selectedTime || '')) {
    const start = zonedInstant(selectedDate, selectedTime, tz).getTime();
    const end = start + Math.max(durationMinutes || data.slotMinutes, 5) * 60000;
    // The end of the last day they take bookings, in their time zone.
    const horizon = data.horizonEnd ? zonedInstant(shiftDay(String(data.horizonEnd).slice(0, 10), 1), '00:00', data.timezone || tz).getTime() : Infinity;
    const fits = freeStretches(data.slots).some(w => start >= w.start && end <= w.end);
    if (!fits && start > now.getTime() && start < horizon) offNote = `${fmtDay(selectedDate, { weekday: 'short', month: 'short', day: 'numeric' })} at ${fmtZonedTime(new Date(start), tz)} isn’t one of ${possessive} open times. Pick one above, or check with ${first === 'They' ? 'them' : first} first.`;
  }
  const google = {
    used: `Busy times on ${possessive} Google Calendar are left out too.`,
    reconnect: `${possessive} Google Calendar needs reconnecting, so only PaceLedger was checked.`,
    unavailable: `Couldn’t check ${possessive} Google Calendar just now, so only PaceLedger was checked.`,
    unchecked: `Only PaceLedger was checked, not ${possessive} Google Calendar.`,
  }[data.google] || '';
  const sameZone = !data.timezone || zoneName(now, data.timezone) === zoneName(now, tz);

  return (
    <section className="tr-open" aria-label={`${possessive} open times`}>
      <div className="tr-open-head">
        <CalendarClock size={16} aria-hidden="true" />
        <strong>{possessive} open times</strong>
        <span className="tr-open-sub">Tap one to fill in the time</span>
      </div>
      <div className="tr-open-weekbar">
        <button type="button" className="tr-icon-btn tr-open-arrow" aria-label="Earlier week" disabled={week <= firstWeek} onClick={() => goWeek(-1)}><ChevronLeft size={16} /></button>
        <span className="tr-open-weeklabel">{weekLabel}</span>
        <button type="button" className="tr-icon-btn tr-open-arrow" aria-label="Later week" disabled={week >= lastWeek} onClick={() => goWeek(1)}><ChevronRight size={16} /></button>
      </div>
      <div className="tr-open-week" role="group" aria-label="Pick a day">
        {days.map(d => {
          const n = (byDay.get(d) || []).length;
          const on = d === shownDay;
          const label = `${fmtDay(d, { weekday: 'long', month: 'long', day: 'numeric' })}: ${n ? `${n} open time${n === 1 ? '' : 's'}` : 'nothing open'}`;
          return (
            <button key={d} type="button" className={`tr-open-day ${on ? 'tr-open-day-on' : ''} ${d === today ? 'tr-open-day-today' : ''}`}
              disabled={!n} aria-pressed={on} aria-label={label} data-day={d}
              onClick={() => { setPickedDay(d); }}>
              <span className="tr-open-dow">{d === today ? 'Today' : fmtDay(d, { weekday: 'short' })}</span>
              <span className="tr-open-dom">{fmtDay(d, { day: 'numeric' })}</span>
              <span className="tr-open-count" aria-hidden="true">{n ? n : '–'}</span>
            </button>
          );
        })}
      </div>
      {times.length > 0 ? (
        <>
          <div className="tr-open-dayhead">{fmtDay(shownDay, { weekday: 'long', month: 'short', day: 'numeric' })}</div>
          <div className="tr-open-times" role="group" aria-label={`Open times ${fmtDay(shownDay, { weekday: 'long', month: 'long', day: 'numeric' })}`}>
            {times.map(s => {
              const on = selectedDate === s.day && selectedTime === s.time;
              return (
                <button key={s.start.toISOString()} type="button" className={`tr-open-time ${on ? 'tr-open-time-on' : ''}`} aria-pressed={on} data-time={s.time}
                  onClick={() => onPick && onPick({ day: s.day, time: s.time, minutes: data.slotMinutes })}>
                  {fmtZonedTime(s.start, tz)}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="tr-open-dayhead tr-open-none">Nothing open this week. Try the arrows.</div>
      )}
      {offNote ? <p className="tr-open-off" role="status">{offNote}</p> : null}
      <p className="tr-open-foot">
        Times in {zoneAbbr(now, tz) || zoneName(now, tz)}{sameZone ? '' : ` (${possessive} hours are set in ${zoneName(now, data.timezone)})`}. {google}
      </p>
    </section>
  );
}
