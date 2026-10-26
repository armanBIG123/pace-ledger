// Dates and times as the clock reads in a given time zone (open times are
// stored as exact instants; the appointment form works in its own time
// zone, which may not be the presenter's).
const partsCache = new Map();
function formatter(tz) {
  if (!partsCache.has(tz)) {
    partsCache.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }));
  }
  return partsCache.get(tz);
}

// { day: "2026-10-27", time: "18:00" } for this instant in time zone tz.
export function zonedParts(date, tz) {
  const parts = formatter(tz).formatToParts(date);
  const get = t => (parts.find(p => p.type === t) || {}).value;
  return { day: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

// "6:00 PM"
export function fmtZonedTime(date, tz) {
  return date.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
}

// The instant a wall-clock date and time ("2026-10-27", "18:00") is in
// time zone tz. A time skipped by a daylight-saving change lands an hour
// later, the way a clock would show it.
export function zonedInstant(day, time, tz) {
  const [y, mo, d] = String(day).split('-').map(Number);
  const [h, mi] = String(time).split(':').map(Number);
  const want = Date.UTC(y, mo - 1, d, h, mi);
  let t = want;
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(new Date(t), tz);
    const [py, pm, pd] = p.day.split('-').map(Number);
    const [ph, pmi] = p.time.split(':').map(Number);
    const got = Date.UTC(py, pm - 1, pd, ph, pmi);
    if (got === want) break;
    t += want - got;
  }
  return new Date(t);
}

// "Central Time", "Eastern Time", ... (the long name where a browser has no
// generic one).
export function zoneName(date, tz) {
  for (const style of ['longGeneric', 'long']) {
    try {
      const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: style }).formatToParts(date).find(x => x.type === 'timeZoneName');
      if (p) return p.value;
    } catch { /* that style isn't supported here */ }
  }
  return tz;
}

// "CDT", "EST", ... for this instant in time zone tz.
export function zoneAbbr(date, tz) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(date).find(x => x.type === 'timeZoneName');
  return p ? p.value : '';
}
