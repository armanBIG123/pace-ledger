// Presenting hours and open times (migration-presenter-availability.sql,
// supabase/functions/presenter-availability).
//
// Open times come from the presenter-availability function when it's
// deployed (it also skips times busy on the presenter's Google Calendar
// when they've turned that on), and straight from the database otherwise.
import { supabase } from '../supabaseClient.js';

const missing = error => !!error && (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202' || /does not exist|could not find/i.test(error.message || ''));

// Once the function turns out not to be there (or not reachable), the rest
// of this visit asks the database directly.
let functionMissing = false;

function normalize(raw) {
  const ok = !!raw && raw.ok !== false;
  return {
    ok,
    reason: raw && raw.reason,
    hasHours: ok && raw.has_hours !== false,
    accepting: ok && raw.accepting !== false,
    timezone: (raw && raw.timezone) || '',
    slotMinutes: Number(raw && raw.slot_minutes) || 60,
    useGoogle: !!(raw && raw.use_google),
    // used | off | not_connected | reconnect | unavailable | unchecked
    google: (raw && raw.google) || 'off',
    lastDay: (raw && raw.last_day) || '',
    horizonEnd: (raw && raw.horizon_end) || '',
    slots: (raw && Array.isArray(raw.slots) ? raw.slots : []).map(([s, e]) => ({ start: new Date(s), end: new Date(e) })),
  };
}

// A presenter's open times from `from` (their today) for `days` days.
// excludeId: the appointment being moved, so its own time shows as open.
// { ok, unavailable, hasHours, accepting, timezone, slotMinutes, google, slots: [{ start, end }] }
export async function fetchOpenTimes({ presenterId, from = null, days = 60, excludeId = null }) {
  if (!presenterId) return { ok: false };
  if (!functionMissing) {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data && data.session && data.session.access_token;
      if (token) {
        const res = await fetch(`${supabase.supabaseUrl}/functions/v1/presenter-availability`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: supabase.supabaseKey },
          body: JSON.stringify({ presenterId, from, days, exclude: excludeId }),
        });
        if (res.ok) return normalize(await res.json());
        if (res.status === 404) functionMissing = true;
      }
    } catch {
      functionMissing = true;
    }
  }
  const { data, error } = await supabase.rpc('presenter_open_slots', { p_presenter: presenterId, p_from: from, p_days: days, p_exclude: excludeId });
  if (error) {
    if (!missing(error)) console.error(error);
    return { ok: false, unavailable: missing(error) };
  }
  return normalize({ ...data, google: data && data.use_google ? 'unchecked' : 'off' });
}

export const DEFAULT_PRESENTING = {
  timezone: '', slotMinutes: 60, stepMinutes: 30, bufferMinutes: 0, noticeMinutes: 120, horizonDays: 14, useGoogle: false, accepting: true,
};

// Your presenting hours: { settings, hours: [{ weekday, start: "18:00", end: "21:00" }] },
// with defaults if you haven't set any; { unavailable: true } before the
// database update.
export async function fetchMyPresentingHours(userId) {
  const [s, h] = await Promise.all([
    supabase.from('presenter_settings').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('presenter_hours').select('weekday, start_time, end_time').eq('user_id', userId).order('weekday').order('start_time'),
  ]);
  if (s.error || h.error) {
    const err = s.error || h.error;
    if (!missing(err)) console.error(err);
    return { unavailable: missing(err), error: !missing(err) };
  }
  const row = s.data;
  return {
    saved: !!row,
    settings: row ? {
      timezone: row.timezone, slotMinutes: row.slot_minutes, stepMinutes: row.step_minutes, bufferMinutes: row.buffer_minutes,
      noticeMinutes: row.notice_minutes, horizonDays: row.horizon_days, useGoogle: !!row.use_google, accepting: !!row.accepting,
    } : { ...DEFAULT_PRESENTING },
    hours: (h.data || []).map(x => ({ weekday: x.weekday, start: String(x.start_time).slice(0, 5), end: String(x.end_time).slice(0, 5) === '23:59' ? '24:00' : String(x.end_time).slice(0, 5) })),
  };
}

const SAVE_ERRORS = {
  overlapping_hours: 'Two of your time ranges on the same day overlap. Fix them and save again.',
  end_before_start: 'Each time range has to end after it starts.',
  bad_hours: "Some of the times don't look right. Check them and save again.",
  bad_timezone: "That time zone isn't recognized. Pick another one.",
  not_signed_in: 'You need to be signed in.',
};
export async function savePresentingHours(settings, hours) {
  const { error } = await supabase.rpc('save_presenting_hours', {
    p_settings: {
      timezone: settings.timezone, slot_minutes: settings.slotMinutes, step_minutes: settings.stepMinutes,
      buffer_minutes: settings.bufferMinutes, notice_minutes: settings.noticeMinutes, horizon_days: settings.horizonDays,
      use_google: !!settings.useGoogle, accepting: !!settings.accepting,
    },
    p_hours: hours.map(h => ({ weekday: h.weekday, start: h.start, end: h.end })),
  });
  if (!error) return { ok: true };
  const key = Object.keys(SAVE_ERRORS).find(k => (error.message || '').includes(k));
  return { ok: false, error: key ? SAVE_ERRORS[key] : "Couldn't save. Check your connection and try again." };
}
