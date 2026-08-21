import React, { useState, useEffect, useCallback } from 'react';
import {
  LogIn, LogOut, Plus, Trash2, ChevronLeft, ChevronRight, Users,
  CalendarDays, ShieldCheck, UserPlus, Loader2, Pencil, ClipboardCheck, TrendingUp
} from 'lucide-react';
import { supabase } from './supabaseClient.js';

const WEEKEND_TARGET = 8;
const WEEKDAY_TARGET = 5;

// ---------------------------------------------------------------------
// date helpers
// ---------------------------------------------------------------------
function fmtDate(d) { return d.toISOString().slice(0, 10); }
function todayStr() { return fmtDate(new Date()); }
function parseDate(s) { return new Date(s + 'T00:00:00'); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

// Tracking weeks run Saturday through the following Friday — the weekend
// that "opens" a week (e.g. Sat Aug 15 / Sun Aug 16) belongs to that same
// week (Aug 15–21), not the calendar week after it.
function weekStartOf(dateStr) {
  const d = parseDate(dateStr);
  const day = d.getDay(); // 0=Sun...6=Sat
  const diff = -((day + 1) % 7);
  return fmtDate(addDays(d, diff));
}

// Date-set options: which day the advisor set the appointment on.
// Saturday/Sunday -> that week's weekend batch (target 8)
// Monday-Friday -> that week's weekday additions (target 5)
const DATE_SET_OPTIONS = [
  { value: 'weekend', label: 'Saturday/Sunday', batchLabel: 'Weekend Batch', shortLabel: 'Wknd', category: 'weekend', target: WEEKEND_TARGET },
  { value: 'monday', label: 'Monday', batchLabel: 'Monday Batch', shortLabel: 'Mon', category: 'weekday', target: WEEKDAY_TARGET },
  { value: 'tuesday', label: 'Tuesday', batchLabel: 'Tuesday Batch', shortLabel: 'Tue', category: 'weekday', target: WEEKDAY_TARGET },
  { value: 'wednesday', label: 'Wednesday', batchLabel: 'Wednesday Batch', shortLabel: 'Wed', category: 'weekday', target: WEEKDAY_TARGET },
  { value: 'thursday', label: 'Thursday', batchLabel: 'Thursday Batch', shortLabel: 'Thu', category: 'weekday', target: WEEKDAY_TARGET },
  { value: 'friday', label: 'Friday', batchLabel: 'Friday Batch', shortLabel: 'Fri', category: 'weekday', target: WEEKDAY_TARGET },
];
const WEEK_TOTAL_TARGET = DATE_SET_OPTIONS.reduce((s, o) => s + o.target, 0);
function dateSetMeta(value) {
  return DATE_SET_OPTIONS.find(o => o.value === value) || DATE_SET_OPTIONS[0];
}
function defaultDateSetOption() {
  const map = { 0: 'weekend', 6: 'weekend', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday' };
  return map[new Date().getDay()];
}

function weekLabel(mondayStr) {
  const m = parseDate(mondayStr);
  const sun = addDays(m, 6);
  const opts = { month: 'short', day: 'numeric' };
  return `${m.toLocaleDateString('en-US', opts)} – ${sun.toLocaleDateString('en-US', opts)}, ${sun.getFullYear()}`;
}
function shiftWeekStr(mondayStr, weeks) { return fmtDate(addDays(parseDate(mondayStr), weeks * 7)); }
function fmtDisplayDate(s) {
  if (!s) return '';
  return parseDate(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${m.toString().padStart(2, '0')} ${ampm}`;
}
function getStatus(counts, weekMonday) {
  const allMet = DATE_SET_OPTIONS.every((opt, i) => (counts[i] || 0) >= opt.target);
  if (allMet) return 'met';
  const weekSunday = fmtDate(addDays(parseDate(weekMonday), 6));
  if (weekSunday < todayStr()) return 'missed';
  return 'progress';
}

// ---------------------------------------------------------------------
// data layer (Supabase Postgres, guarded by Row Level Security)
// ---------------------------------------------------------------------
function rowToRecord(row) {
  const meta = dateSetMeta(row.date_set_option);
  return {
    id: row.id,
    userId: row.user_id,
    dateSetOption: row.date_set_option,
    dateSetLabel: meta.label,
    category: row.category,
    weekOf: row.week_of,
    appointmentDate: row.appointment_date,
    appointmentTime: (row.appointment_time || '').slice(0, 5),
    presenter: row.presenter,
    trainee: row.trainee || '',
    client: row.client_name,
    notes: row.notes || '',
    createdAt: row.created_at,
    outcome: row.outcome || '',
    followUpScheduled: row.follow_up_scheduled,
    result: row.result || '',
    interestedTax: row.interested_tax,
    interestedInsurance: row.interested_insurance,
    followUpCompletedAt: row.follow_up_completed_at,
    status: row.status || '',
    presentationType: row.presentation_type || '',
    targetPremium: row.target_premium,
  };
}
function isPastAppointment(a) {
  const dt = new Date(`${a.appointmentDate}T${a.appointmentTime || '00:00'}`);
  return dt.getTime() < Date.now();
}
function fmtCurrency(n) {
  if (n === null || n === undefined || isNaN(n)) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
// Days/months/years since a timestamp, e.g. "1y 2m 5d"
function tenureSince(createdAt) {
  if (!createdAt) return '—';
  const start = new Date(createdAt);
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  let days = now.getDate() - start.getDate();
  if (days < 0) {
    months -= 1;
    days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  }
  if (months < 0) { years -= 1; months += 12; }
  const parts = [];
  if (years > 0) parts.push(`${years}y`);
  if (months > 0) parts.push(`${months}m`);
  parts.push(`${days}d`);
  return parts.join(' ');
}
async function saveFollowUp(id, data) {
  const { error } = await supabase.from('appointments').update({
    outcome: data.outcome || null,
    follow_up_scheduled: data.followUpScheduled,
    result: data.result || null,
    interested_tax: data.interestedTax,
    interested_insurance: data.interestedInsurance,
    target_premium: data.result === 'sale' && data.targetPremium ? Number(data.targetPremium) : null,
    follow_up_completed_at: new Date().toISOString(),
  }).eq('id', id);
  return !error;
}
// Status is derived entirely from the follow-up answers — there's no
// separate manual status control, so the two can never disagree.
function deriveStatus(outcome, followUpScheduled) {
  if (followUpScheduled === true) return 'needs_follow_up';
  if (outcome === 'rescheduled') return 'needs_reschedule';
  if (outcome === 'no_show') return 'not_completed';
  if (outcome === 'went_well' || outcome === 'not_interested') return 'completed';
  return '';
}
async function saveFollowUp(id, data) {
  const status = deriveStatus(data.outcome, data.followUpScheduled);
  const { error } = await supabase.from('appointments').update({
    outcome: data.outcome || null,
    follow_up_scheduled: data.followUpScheduled,
    result: data.result || null,
    interested_tax: data.interestedTax,
    interested_insurance: data.interestedInsurance,
    target_premium: data.result === 'sale' && data.targetPremium ? Number(data.targetPremium) : null,
    follow_up_completed_at: new Date().toISOString(),
    status: status || null,
  }).eq('id', id);
  return !error;
}
async function fetchMyAppointments(userId) {
  const { data, error } = await supabase
    .from('appointments').select('*').eq('user_id', userId)
    .order('appointment_date', { ascending: true });
  if (error) { console.error(error); return []; }
  return data.map(rowToRecord);
}
async function fetchAppointmentsForWeek(weekMonday) {
  const { data, error } = await supabase
    .from('appointments').select('*').eq('week_of', weekMonday);
  if (error) { console.error(error); return []; }
  return data.map(rowToRecord);
}
async function insertAppointment(userId, form) {
  const meta = dateSetMeta(form.dateSetOption);
  const { data, error } = await supabase.from('appointments').insert({
    user_id: userId,
    date_set_option: form.dateSetOption,
    category: meta.category,
    week_of: form.weekOf,
    appointment_date: form.appointmentDate,
    appointment_time: form.appointmentTime,
    presenter: form.presenter.trim(),
    trainee: form.trainee.trim() || null,
    client_name: form.client.trim(),
    notes: form.notes.trim() || null,
    presentation_type: form.presentationType || null,
  }).select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, record: rowToRecord(data) };
}
// Editing never touches week_of or user_id — it can only ever change how an
// appointment looks within the week it was already logged for, never move
// it to a different week.
async function updateAppointment(id, form) {
  const meta = dateSetMeta(form.dateSetOption);
  const { data, error } = await supabase.from('appointments').update({
    date_set_option: form.dateSetOption,
    category: meta.category,
    appointment_date: form.appointmentDate,
    appointment_time: form.appointmentTime,
    presenter: form.presenter.trim(),
    trainee: form.trainee.trim() || null,
    client_name: form.client.trim(),
    notes: form.notes.trim() || null,
    presentation_type: form.presentationType || null,
  }).eq('id', id).select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, record: rowToRecord(data) };
}
async function deleteAppointmentRow(id) {
  const { error } = await supabase.from('appointments').delete().eq('id', id);
  return !error;
}
async function fetchTeamMembers(viewer) {
  let query = supabase.from('profiles').select('*').order('display_name');
  if (viewer.role === 'super_admin') {
    query = query.in('role', ['advisor', 'manager']);
  } else {
    // regular managers only ever see their own assigned advisors
    query = query.eq('role', 'advisor').eq('manager_id', viewer.id);
  }
  const { data, error } = await query;
  if (error) { console.error(error); return []; }
  return data;
}
async function fetchManagerDirectory() {
  const { data, error } = await supabase.from('manager_directory').select('*').order('display_name');
  if (error) { console.error(error); return []; }
  return data;
}

// ---------------------------------------------------------------------
// shell / shared UI
// ---------------------------------------------------------------------
function Shell({ children }) {
  return (
    <div className="tr-root">
      <style>{CSS}</style>
      {children}
    </div>
  );
}
function Spinner({ label }) {
  return (
    <div className="tr-spinner">
      <Loader2 className="tr-spin" size={18} />
      <span>{label}</span>
    </div>
  );
}
function Header({ user }) {
  return (
    <header className="tr-header">
      <div className="tr-brand"><ShieldCheck size={20} /> <span>Pace<em>Ledger</em></span></div>
      <div className="tr-header-user">
        <span className="tr-header-name">{user.displayName}</span>
        <span className="tr-header-role">{user.role}</span>
        <button className="tr-icon-btn" onClick={() => supabase.auth.signOut()} title="Log out"><LogOut size={16} /></button>
      </div>
    </header>
  );
}
function WeekNav({ weekMonday, onShift, onToday }) {
  return (
    <div className="tr-weeknav">
      <button className="tr-icon-btn" onClick={() => onShift(-1)} title="Previous week"><ChevronLeft size={18} /></button>
      <div className="tr-weeknav-label"><CalendarDays size={16} /><span>Week of {weekLabel(weekMonday)}</span></div>
      <button className="tr-icon-btn" onClick={() => onShift(1)} title="Next week"><ChevronRight size={18} /></button>
      <button className="tr-btn tr-btn-ghost tr-btn-sm" onClick={onToday}>This week</button>
    </div>
  );
}
function PaceStrip({ groups }) {
  return (
    <div className="tr-card tr-pace">
      <p className="tr-pace-hint">The {WEEKEND_TARGET} you commit to over the weekend for the week ahead, plus {WEEKDAY_TARGET} new ones each weekday.</p>
      <div className="tr-pace-grid">
        {groups.map(g => (
          <div className="tr-pace-group" key={g.option.value}>
            <div className="tr-pace-label">
              <span>{g.option.batchLabel}</span>
              <span className="tr-mono tr-pace-count">{g.count}/{g.option.target}</span>
            </div>
            <div className="tr-pace-row">
              {Array.from({ length: Math.max(g.option.target, g.count) }).map((_, i) => (
                <span
                  key={i}
                  className={`tr-pill ${g.option.category === 'weekday' ? 'tr-pill-alt' : ''} ${i < g.count ? 'tr-pill-filled' : ''}`}
                  title={g.list[i] ? `${g.list[i].client} · ${fmtDisplayDate(g.list[i].appointmentDate)}` : 'Not yet logged'}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
const STATUS_OPTIONS = [
  { value: '', label: 'No status', color: 'none' },
  { value: 'completed', label: 'Completed', color: 'green' },
  { value: 'needs_follow_up', label: 'Needs follow-up', color: 'amber' },
  { value: 'not_completed', label: "Didn't happen", color: 'rust' },
  { value: 'needs_reschedule', label: 'Needs reschedule', color: 'violet' },
];
function StatusChip({ status }) {
  const opt = STATUS_OPTIONS.find(o => o.value === status);
  if (!opt || !opt.value) return null;
  return <span className={`tr-status tr-status-${opt.color}`}>{opt.label}</span>;
}
function ApptGroup({ title, list, onDelete, onFollowUp, onEdit, empty }) {
  return (
    <div className="tr-card tr-appt-group">
      {title ? <h3 className="tr-h3">{title}</h3> : null}
      {list.length === 0 ? <p className="tr-empty">{empty}</p> : (
        <div className="tr-table-wrap">
          <table className="tr-table">
            <thead>
              <tr><th>Set</th><th>Appointment</th><th>Presenter</th><th>Trainee</th><th>Client / recruit</th>{onDelete && <th></th>}</tr>
            </thead>
            <tbody>
              {list.map(a => {
                const typeClass = a.presentationType === 'recruit' ? 'tr-type-recruit' : a.presentationType === 'sale' ? 'tr-type-sale' : '';
                return (
                  <tr key={a.id}>
                    <td className={typeClass}>{a.dateSetLabel}</td>
                    <td>{fmtDisplayDate(a.appointmentDate)} · {fmtTime(a.appointmentTime)}</td>
                    <td>{a.presenter}</td>
                    <td>{a.trainee || '—'}</td>
                    <td>
                      {a.client}
                      {a.status ? <span style={{ marginLeft: 6 }}><StatusChip status={a.status} /></span> : null}
                      {a.notes ? <span className="tr-note"> — {a.notes}</span> : null}
                    </td>
                    {onDelete && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {onFollowUp && isPastAppointment(a) && (
                          <button className="tr-icon-btn" onClick={() => onFollowUp(a)} title={a.followUpCompletedAt ? 'Edit follow-up' : 'Follow up'}>
                            <ClipboardCheck size={14} />
                          </button>
                        )}
                        {onEdit && <button className="tr-icon-btn" onClick={() => onEdit(a)} title="Edit appointment"><Pencil size={14} /></button>}
                        <button className="tr-icon-btn" onClick={() => onDelete(a.id)} title="Delete"><Trash2 size={14} /></button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------
function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [managerId, setManagerId] = useState('');
  const [managers, setManagers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    fetchManagerDirectory().then(setManagers);
  }, []);

  async function submit() {
    setError(''); setNotice('');
    const mail = email.trim();
    if (!mail || !password) { setError('Enter an email and password.'); return; }
    setBusy(true);
    try {
      if (mode === 'signup') {
        if (!displayName.trim()) { setError('Enter your full name.'); setBusy(false); return; }
        if (password.length < 6) { setError('Password needs to be at least 6 characters.'); setBusy(false); return; }
        if (managers.length > 0 && !managerId) { setError('Please select your manager.'); setBusy(false); return; }
        const { data, error: signErr } = await supabase.auth.signUp({
          email: mail,
          password,
          options: { data: { display_name: displayName.trim(), manager_id: managerId || '' } },
        });
        if (signErr) { setError(signErr.message); setBusy(false); return; }
        if (!data.session) {
          setNotice('Account created — check your email to confirm it, then log in.');
          setMode('login');
        }
      } else {
        const { error: loginErr } = await supabase.auth.signInWithPassword({ email: mail, password });
        if (loginErr) { setError(loginErr.message); setBusy(false); return; }
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  async function forgotPassword() {
    setError(''); setNotice('');
    const mail = email.trim();
    if (!mail) { setError('Enter your email above first, then click "Forgot password?".'); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(mail, {
      redirectTo: window.location.origin,
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setNotice('Check your email for a link to reset your password.');
  }
  function handleKeyDown(e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } }

  return (
    <Shell>
      <div className="tr-auth-wrap">
        <div className="tr-auth-card" onKeyDown={handleKeyDown}>
          <div className="tr-brand tr-brand-center"><ShieldCheck size={22} /> <span>Pace<em>Ledger</em></span></div>
          <p className="tr-auth-sub">Appointment-setting pace tracking for advisors and managers.</p>
          <div className="tr-tabs">
            <button className={`tr-tab ${mode === 'login' ? 'tr-tab-active' : ''}`} onClick={() => { setMode('login'); setError(''); setNotice(''); }}>Log in</button>
            <button className={`tr-tab ${mode === 'signup' ? 'tr-tab-active' : ''}`} onClick={() => { setMode('signup'); setError(''); setNotice(''); }}>Create account</button>
          </div>
          <div className="tr-auth-form">
            {mode === 'signup' && (
              <label className="tr-field">
                <span>Full name</span>
                <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Jordan Blake" />
              </label>
            )}
            <label className="tr-field">
              <span>Email</span>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jordan@yourcompany.com" autoCapitalize="none" />
            </label>
            <label className="tr-field">
              <span>Password</span>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
            </label>
            {mode === 'login' && (
              <button type="button" className="tr-link-btn" onClick={forgotPassword} disabled={busy}>Forgot password?</button>
            )}
            {mode === 'signup' && managers.length > 0 && (
              <label className="tr-field">
                <span>Your manager</span>
                <select value={managerId} onChange={e => setManagerId(e.target.value)}>
                  <option value="">Select your manager…</option>
                  {managers.map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)}
                </select>
              </label>
            )}
            {mode === 'signup' && managers.length === 0 && (
              <div className="tr-badge tr-badge-weekday">No managers set up yet — you can sign up now and be assigned one later.</div>
            )}
            {notice && <div className="tr-badge tr-badge-weekday">{notice}</div>}
            {error && <div className="tr-error">{error}</div>}
            <button type="button" className="tr-btn tr-btn-brass tr-btn-block" onClick={submit} disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? <><LogIn size={16} /> Log in</> : <><UserPlus size={16} /> Create account</>}
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function ResetPasswordScreen({ onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (password.length < 6) { setError('Password needs to be at least 6 characters.'); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) { setError(err.message); return; }
    onDone();
  }
  function handleKeyDown(e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } }

  return (
    <Shell>
      <div className="tr-auth-wrap">
        <div className="tr-auth-card" onKeyDown={handleKeyDown}>
          <div className="tr-brand tr-brand-center"><ShieldCheck size={22} /> <span>Pace<em>Ledger</em></span></div>
          <p className="tr-auth-sub">Set a new password for your account.</p>
          <div className="tr-auth-form">
            <label className="tr-field">
              <span>New password</span>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
            </label>
            <label className="tr-field">
              <span>Confirm new password</span>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} />
            </label>
            {error && <div className="tr-error">{error}</div>}
            <button type="button" className="tr-btn tr-btn-brass tr-btn-block" onClick={submit} disabled={busy}>
              {busy ? 'Saving…' : 'Set new password'}
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------
// appointment form
// ---------------------------------------------------------------------
function openPicker(e) {
  if (typeof e.target.showPicker === 'function') {
    try { e.target.showPicker(); } catch { /* unsupported in this browser, ignore */ }
  }
}
async function fetchCalendlyContacts() {
  const { data, error } = await supabase
    .from('profiles').select('id, display_name, role, calendly_url')
    .in('role', ['manager', 'super_admin'])
    .not('calendly_url', 'is', null)
    .order('display_name');
  if (error) { console.error(error); return []; }
  return data;
}

// ---------------------------------------------------------------------
// follow-up — quick, tap-to-answer questions for past appointments
// ---------------------------------------------------------------------
function Modal({ onClose, children }) {
  function handleKeyDown(e) { if (e.key === 'Escape') onClose(); }
  return (
    <div className="tr-modal-backdrop" onClick={onClose} onKeyDown={handleKeyDown} tabIndex={-1}>
      <div className="tr-modal-card" onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  );
}
function PillChoice({ options, value, onChange }) {
  return (
    <div className="tr-pillrow">
      {options.map(opt => (
        <button
          key={opt.value} type="button"
          className={`tr-pill-btn ${value === opt.value ? 'tr-pill-btn-active' : ''}`}
          onClick={() => onChange(opt.value)}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}
const OUTCOME_OPTIONS = [
  { value: 'went_well', label: 'Went well' },
  { value: 'no_show', label: 'No show' },
  { value: 'rescheduled', label: 'Rescheduled' },
  { value: 'not_interested', label: 'Not interested' },
];
const RESULT_OPTIONS = [
  { value: 'recruit', label: 'Recruit' },
  { value: 'sale', label: 'Sale' },
  { value: 'neither', label: 'Neither' },
];
const YES_NO_OPTIONS = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];
function boolToYesNo(v) { return v === true ? 'yes' : v === false ? 'no' : ''; }
function yesNoToBool(v) { return v === 'yes' ? true : v === 'no' ? false : null; }

function FollowUpModal({ appointment, onClose, onSave, saving }) {
  const [outcome, setOutcome] = useState(appointment.outcome || '');
  const [followUpScheduled, setFollowUpScheduled] = useState(boolToYesNo(appointment.followUpScheduled));
  const [result, setResult] = useState(appointment.result || '');
  const [targetPremium, setTargetPremium] = useState(appointment.targetPremium != null ? String(appointment.targetPremium) : '');
  const [interestedTax, setInterestedTax] = useState(boolToYesNo(appointment.interestedTax));
  const [interestedInsurance, setInterestedInsurance] = useState(boolToYesNo(appointment.interestedInsurance));

  function submit() {
    onSave(appointment.id, {
      outcome,
      followUpScheduled: yesNoToBool(followUpScheduled),
      result,
      targetPremium,
      interestedTax: yesNoToBool(interestedTax),
      interestedInsurance: yesNoToBool(interestedInsurance),
    });
  }

  return (
    <Modal onClose={onClose}>
      <h3 className="tr-h3">Follow-up — {appointment.client}</h3>
      <p className="tr-empty" style={{ marginTop: -4, marginBottom: 18 }}>
        {fmtDisplayDate(appointment.appointmentDate)} · {fmtTime(appointment.appointmentTime)}
      </p>
      <div className="tr-followup-list">
        <div className="tr-field"><span>How'd it go?</span><PillChoice options={OUTCOME_OPTIONS} value={outcome} onChange={setOutcome} /></div>
        <div className="tr-field"><span>Follow-up appointment scheduled?</span><PillChoice options={YES_NO_OPTIONS} value={followUpScheduled} onChange={setFollowUpScheduled} /></div>
        <div className="tr-field"><span>Officially recruited, or sold?</span><PillChoice options={RESULT_OPTIONS} value={result} onChange={setResult} /></div>
        {result === 'sale' && (
          <label className="tr-field">
            <span>Target premium</span>
            <input type="number" min="0" step="1" inputMode="decimal" value={targetPremium} onChange={e => setTargetPremium(e.target.value)} placeholder="e.g. 1200" />
          </label>
        )}
        <div className="tr-field"><span>Interested in tax strategies?</span><PillChoice options={YES_NO_OPTIONS} value={interestedTax} onChange={setInterestedTax} /></div>
        <div className="tr-field"><span>Interested in reviewing home/auto insurance?</span><PillChoice options={YES_NO_OPTIONS} value={interestedInsurance} onChange={setInterestedInsurance} /></div>
      </div>
      <div className="tr-form-actions">
        <button type="button" className="tr-btn tr-btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="tr-btn tr-btn-brass" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save follow-up'}</button>
      </div>
    </Modal>
  );
}

function TypeChoice({ value, onChange }) {
  return (
    <div className="tr-pillrow">
      <button type="button" className={`tr-pill-btn tr-pill-recruit ${value === 'recruit' ? 'tr-pill-btn-active-recruit' : ''}`} onClick={() => onChange('recruit')}>Recruit</button>
      <button type="button" className={`tr-pill-btn tr-pill-sale ${value === 'sale' ? 'tr-pill-btn-active-sale' : ''}`} onClick={() => onChange('sale')}>Sale</button>
    </div>
  );
}

function AppointmentForm({ defaultPresenter, weekMonday, editing, onCancel, onSubmit, saving }) {
  const [dateSetOption, setDateSetOption] = useState(editing?.dateSetOption || defaultDateSetOption());
  const [appointmentDate, setAppointmentDate] = useState(editing?.appointmentDate || '');
  const [appointmentTime, setAppointmentTime] = useState(editing?.appointmentTime || '');
  const [presenter, setPresenter] = useState(editing?.presenter || defaultPresenter || '');
  const [trainee, setTrainee] = useState(editing?.trainee || '');
  const [client, setClient] = useState(editing?.client || '');
  const [notes, setNotes] = useState(editing?.notes || '');
  const [presentationType, setPresentationType] = useState(editing?.presentationType || '');
  const [err, setErr] = useState('');
  const [calendlyContacts, setCalendlyContacts] = useState([]);

  useEffect(() => { fetchCalendlyContacts().then(setCalendlyContacts); }, []);

  const meta = dateSetMeta(dateSetOption);

  function submit() {
    if (!appointmentDate || !appointmentTime || !presenter.trim() || !client.trim() || !presentationType) {
      setErr('Fill in the appointment date/time, presenter, client/recruit, and whether it\'s a recruit or sale.');
      return;
    }
    setErr('');
    onSubmit({ dateSetOption, appointmentDate, appointmentTime, presenter, trainee, client, notes, presentationType });
  }
  function handleKeyDown(e) {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); submit(); }
  }

  return (
    <div className="tr-card tr-form" onKeyDown={handleKeyDown}>
      <h3 className="tr-h3">{editing ? 'Edit appointment' : 'Log a new appointment'}</h3>
      {calendlyContacts.length > 0 && (
        <div className="tr-field tr-field-wide" style={{ marginBottom: 14 }}>
          <span>If a manager is presenting, open their Calendly to schedule</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {calendlyContacts.map(c => (
              <a key={c.id} href={c.calendly_url} target="_blank" rel="noopener noreferrer" className="tr-btn tr-btn-ghost tr-btn-sm">
                {c.display_name}'s Calendly
              </a>
            ))}
          </div>
        </div>
      )}
      <div className="tr-field tr-field-wide" style={{ marginBottom: 14 }}>
        <span>Recruit or sale presentation?</span>
        <TypeChoice value={presentationType} onChange={setPresentationType} />
      </div>
      <div className="tr-form-grid">
        <label className="tr-field">
          <span>Date set</span>
          <select value={dateSetOption} onChange={e => setDateSetOption(e.target.value)}>
            {DATE_SET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <div className="tr-field">
          <span>Counts toward</span>
          <div className={`tr-badge tr-badge-${meta.category}`}>
            {meta.batchLabel} ({meta.target}) · week of {parseDate(weekMonday).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        </div>
        <label className="tr-field">
          <span>Appointment date</span>
          <input type="date" value={appointmentDate} onChange={e => setAppointmentDate(e.target.value)} onClick={openPicker} />
        </label>
        <label className="tr-field">
          <span>Appointment time</span>
          <input type="time" value={appointmentTime} onChange={e => setAppointmentTime(e.target.value)} onClick={openPicker} />
        </label>
        <label className="tr-field">
          <span>Presenter</span>
          <input value={presenter} onChange={e => setPresenter(e.target.value)} placeholder="Who is presenting" />
        </label>
        <label className="tr-field">
          <span>Trainee (optional)</span>
          <input value={trainee} onChange={e => setTrainee(e.target.value)} placeholder="Who is being trained" />
        </label>
        <label className="tr-field tr-field-wide">
          <span>Client / recruit</span>
          <input value={client} onChange={e => setClient(e.target.value)} placeholder="Who is being presented to" />
        </label>
        <label className="tr-field tr-field-wide">
          <span>Notes (optional)</span>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything else worth noting" />
        </label>
      </div>
      {err && <div className="tr-error">{err}</div>}
      <div className="tr-form-actions">
        <button type="button" className="tr-btn tr-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="tr-btn tr-btn-brass" onClick={submit} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Save appointment'}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// advisor capabilities — available to advisors, managers, and super admins
// ---------------------------------------------------------------------
function CalendlyLinkEditor({ user }) {
  const [link, setLink] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('profiles').select('calendly_url').eq('id', user.id).single()
      .then(({ data }) => { setLink(data?.calendly_url || ''); setLoaded(true); });
  }, [user.id]);

  async function save() {
    setSaving(true); setSaved(false); setError('');
    const { error: err } = await supabase.from('profiles').update({ calendly_url: link.trim() || null }).eq('id', user.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!loaded) return null;

  return (
    <div className="tr-card">
      <h3 className="tr-h3">Your Calendly link</h3>
      <p className="tr-empty" style={{ marginTop: -4, marginBottom: 12 }}>
        Advisors will see this and can click it when they log an appointment where you're the presenter.
      </p>
      <div className="tr-form-grid">
        <label className="tr-field tr-field-wide">
          <span>Calendly URL</span>
          <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://calendly.com/your-name/30min" />
        </label>
      </div>
      {error && <div className="tr-error">{error}</div>}
      <div className="tr-form-actions">
        <button type="button" className="tr-btn tr-btn-brass" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save link'}
        </button>
      </div>
    </div>
  );
}
function MyAppointmentsBody({ user }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weekMonday, setWeekMonday] = useState(weekStartOf(todayStr()));
  const [showForm, setShowForm] = useState(false);
  const [editingAppt, setEditingAppt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [followUpTarget, setFollowUpTarget] = useState(null);
  const [followUpSaving, setFollowUpSaving] = useState(false);
  const [completionTarget, setCompletionTarget] = useState(null);
  const [completionSaving, setCompletionSaving] = useState(false);
  const [legendShown, setLegendShown] = useState(true);
  // null = the normal "This week" view; otherwise one of STATUS_OPTIONS.value
  // (including '' for "No status") — a real sub-page, not a nested widget.
  const [statusView, setStatusView] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setAppointments(await fetchMyAppointments(user.id));
    setLoading(false);
  }, [user.id]);

  useEffect(() => { refresh(); }, [refresh]);

  const weekAppts = appointments
    .filter(a => a.weekOf === weekMonday)
    .sort((a, b) => (a.appointmentDate + a.appointmentTime).localeCompare(b.appointmentDate + b.appointmentTime));
  const groups = DATE_SET_OPTIONS.map(opt => ({
    option: opt,
    list: weekAppts.filter(a => a.dateSetOption === opt.value),
  }));

  const pastAppts = appointments.filter(isPastAppointment);
  const statusCounts = STATUS_OPTIONS.reduce((acc, opt) => {
    acc[opt.value] = pastAppts.filter(a => (a.status || '') === opt.value).length;
    return acc;
  }, {});
  const statusFiltered = statusView === null ? [] : pastAppts
    .filter(a => (a.status || '') === statusView)
    .sort((a, b) => (b.appointmentDate + b.appointmentTime).localeCompare(a.appointmentDate + a.appointmentTime));

  function closeForm() { setShowForm(false); setEditingAppt(null); }
  function openEdit(appt) { setEditingAppt(appt); setShowForm(true); }

  async function handleFormSubmit(form) {
    setSaving(true);
    setError('');
    if (editingAppt) {
      const res = await updateAppointment(editingAppt.id, form);
      setSaving(false);
      if (!res.ok) { setError(res.error || 'Could not save. Try again.'); return; }
      setAppointments(prev => prev.map(a => a.id === editingAppt.id ? res.record : a));
      closeForm();
    } else {
      const res = await insertAppointment(user.id, { ...form, weekOf: weekMonday });
      setSaving(false);
      if (!res.ok) { setError(res.error || 'Could not save. Try again.'); return; }
      setAppointments(prev => [...prev, res.record]);
      closeForm();
    }
  }
  async function handleDelete(id) {
    const prev = appointments;
    setAppointments(appointments.filter(a => a.id !== id));
    const ok = await deleteAppointmentRow(id);
    if (!ok) setAppointments(prev);
  }
  async function handleSaveFollowUp(id, data) {
    setFollowUpSaving(true);
    const ok = await saveFollowUp(id, data);
    setFollowUpSaving(false);
    if (!ok) return;
    const status = deriveStatus(data.outcome, data.followUpScheduled);
    setAppointments(prev => prev.map(a => a.id === id ? {
      ...a, ...data, status, followUpCompletedAt: new Date().toISOString(),
    } : a));
    setFollowUpTarget(null);
  }

  return (
    <div className="tr-appts-shell">
      <nav className="tr-appts-sidebar">
        <button
          type="button"
          className={`tr-sidebar-item tr-sidebar-item-week ${statusView === null ? 'tr-sidebar-item-active' : ''}`}
          onClick={() => setStatusView(null)}>
          <span>This week</span>
        </button>
        <div className="tr-sidebar-divider">Needs attention</div>
        {STATUS_OPTIONS.map(opt => (
          <button
            key={opt.value || 'none'} type="button"
            className={`tr-sidebar-item tr-sidebar-item-${opt.color} ${statusView === opt.value ? 'tr-sidebar-item-active' : ''}`}
            onClick={() => setStatusView(opt.value)}>
            <span>{opt.label}</span>
            <span className="tr-mono">{statusCounts[opt.value]}</span>
          </button>
        ))}
      </nav>

      <div className="tr-appts-main">
        {statusView === null ? (
          <>
            {(user.role === 'manager' || user.role === 'super_admin') && <CalendlyLinkEditor user={user} />}
            <WeekNav weekMonday={weekMonday} onShift={d => setWeekMonday(shiftWeekStr(weekMonday, d))} onToday={() => setWeekMonday(weekStartOf(todayStr()))} />
            <PaceStrip groups={groups.map(g => ({ option: g.option, count: g.list.length, list: g.list }))} />
            <div className="tr-row-head">
              <h2 className="tr-h2">Your appointments this week</h2>
              <button className="tr-btn tr-btn-brass" onClick={() => (showForm ? closeForm() : setShowForm(true))}>
                <Plus size={16} /> {showForm ? 'Close' : 'Log appointment'}
              </button>
            </div>
            {legendShown && (
              <p className="tr-empty" style={{ margin: '-8px 0 0' }}>
                <span className="tr-legend-dot" style={{ background: 'var(--type-recruit)' }} /> Recruit &nbsp;
                <span className="tr-legend-dot" style={{ background: 'var(--type-sale)' }} /> Sale
                <button type="button" className="tr-link-btn" style={{ marginLeft: 10 }} onClick={() => setLegendShown(false)}>hide</button>
              </p>
            )}
            {error && <div className="tr-error">{error}</div>}
            {showForm && (
              <AppointmentForm defaultPresenter={user.displayName} weekMonday={weekMonday} editing={editingAppt} onCancel={closeForm} onSubmit={handleFormSubmit} saving={saving} />
            )}
            {loading ? <Spinner label="Loading appointments…" /> : groups.map(g => (
              <ApptGroup
                key={g.option.value}
                title={`${g.option.batchLabel} (${g.list.length}/${g.option.target})`}
                list={g.list} onDelete={handleDelete} onFollowUp={setFollowUpTarget}
                onEdit={openEdit}
                empty={`No appointments logged for ${g.option.label} yet.`} />
            ))}
          </>
        ) : (
          <>
            <h2 className="tr-h2">{STATUS_OPTIONS.find(o => o.value === statusView)?.label}</h2>
            <p className="tr-empty" style={{ marginTop: -8 }}>Every past appointment currently in this state.</p>
            {loading ? <Spinner label="Loading…" /> : statusFiltered.length === 0 ? (
              <div className="tr-card"><p className="tr-empty">Nothing here.</p></div>
            ) : (
              <ApptGroup list={statusFiltered} onDelete={handleDelete} onFollowUp={setFollowUpTarget} onEdit={openEdit} empty="" />
            )}
          </>
        )}
        {followUpTarget && (
          <FollowUpModal
            appointment={followUpTarget}
            onClose={() => setFollowUpTarget(null)}
            onSave={handleSaveFollowUp}
            saving={followUpSaving} />
        )}
      </div>
    </div>
  );
}
function AdvisorView({ user }) {
  return (
    <Shell>
      <Header user={user} />
      <main className="tr-main">
        <MyAppointmentsBody user={user} />
      </main>
    </Shell>
  );
}

// ---------------------------------------------------------------------
// manager view
// ---------------------------------------------------------------------
function StatusBadge({ status }) {
  const map = { met: ['On pace', 'green'], missed: ['Missed', 'rust'], progress: ['In progress', 'amber'] };
  const [label, tone] = map[status];
  return <span className={`tr-status tr-status-${tone}`}>{label}</span>;
}
function MiniBar({ count, target }) {
  const pct = Math.min(100, Math.round((count / target) * 100));
  return (
    <div className="tr-minibar-wrap">
      <div className="tr-minibar-track"><div className="tr-minibar-fill" style={{ width: `${pct}%` }} /></div>
      <span className="tr-mono tr-minibar-num">{count}/{target}</span>
    </div>
  );
}
function TeamPaceBody({ user }) {
  const [members, setMembers] = useState([]);
  const [weekAppts, setWeekAppts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weekMonday, setWeekMonday] = useState(weekStartOf(todayStr()));
  const [expanded, setExpanded] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [memberList, appts] = await Promise.all([
      fetchTeamMembers(user),
      fetchAppointmentsForWeek(weekMonday),
    ]);
    setMembers(memberList);
    setWeekAppts(appts);
    setLoading(false);
  }, [weekMonday, user.id, user.role]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <>
      <WeekNav weekMonday={weekMonday} onShift={d => setWeekMonday(shiftWeekStr(weekMonday, d))} onToday={() => setWeekMonday(weekStartOf(todayStr()))} />
      <div className="tr-row-head">
        <h2 className="tr-h2"><Users size={18} /> Team pace</h2>
        <button className="tr-btn tr-btn-ghost tr-btn-sm" onClick={refresh}>Refresh</button>
      </div>
      {loading ? <Spinner label="Loading team data…" /> : members.length === 0 ? (
        <div className="tr-card"><p className="tr-empty">No team members yet. Once people create accounts and start logging, they'll show up here.</p></div>
      ) : (
        <div className="tr-card tr-summary-card">
          <div className="tr-table-wrap">
            <table className="tr-table tr-table-summary">
              <thead>
                <tr>
                  <th>Team member</th>
                  {DATE_SET_OPTIONS.map(opt => <th key={opt.value}>{opt.shortLabel}</th>)}
                  <th>Total</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {members.map(adv => {
                  const list = weekAppts.filter(a => a.userId === adv.id);
                  const groups = DATE_SET_OPTIONS.map(opt => list.filter(a => a.dateSetOption === opt.value));
                  const counts = groups.map(g => g.length);
                  const total = counts.reduce((s, c) => s + c, 0);
                  const status = getStatus(counts, weekMonday);
                  const isOpen = expanded === adv.id;
                  return (
                    <React.Fragment key={adv.id}>
                      <tr className="tr-clickable-row" onClick={() => setExpanded(isOpen ? null : adv.id)}>
                        <td>
                          {adv.display_name}{adv.role === 'manager' ? <span className="tr-note"> — manager</span> : null}
                          <div className="tr-tenure">Member for {tenureSince(adv.created_at)}</div>
                        </td>
                        {DATE_SET_OPTIONS.map((opt, i) => (
                          <td key={opt.value}><MiniBar count={counts[i]} target={opt.target} /></td>
                        ))}
                        <td className="tr-mono">{total}/{WEEK_TOTAL_TARGET}</td>
                        <td><StatusBadge status={status} /></td>
                      </tr>
                      {isOpen && (
                        <tr className="tr-expand-row"><td colSpan={DATE_SET_OPTIONS.length + 3}>
                          {DATE_SET_OPTIONS.map((opt, i) => (
                            <ApptGroup key={opt.value} title={`${opt.batchLabel} (${counts[i]}/${opt.target})`} list={groups[i]} empty="None logged." />
                          ))}
                        </td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------
// track production — sold premium + recruits for the week, manager/admin only
// ---------------------------------------------------------------------
function TrackProductionBody({ user }) {
  const [members, setMembers] = useState([]);
  const [weekAppts, setWeekAppts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weekMonday, setWeekMonday] = useState(weekStartOf(todayStr()));

  const refresh = useCallback(async () => {
    setLoading(true);
    const [memberList, appts] = await Promise.all([
      fetchTeamMembers(user),
      fetchAppointmentsForWeek(weekMonday),
    ]);
    setMembers(memberList);
    setWeekAppts(appts);
    setLoading(false);
  }, [weekMonday, user.id, user.role]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <>
      <WeekNav weekMonday={weekMonday} onShift={d => setWeekMonday(shiftWeekStr(weekMonday, d))} onToday={() => setWeekMonday(weekStartOf(todayStr()))} />
      <div className="tr-row-head">
        <h2 className="tr-h2"><TrendingUp size={18} /> Track production</h2>
        <button className="tr-btn tr-btn-ghost tr-btn-sm" onClick={refresh}>Refresh</button>
      </div>
      <p className="tr-empty" style={{ marginTop: -8 }}>Based on what's been marked Sold or Recruited in each person's follow-up for this week.</p>
      {loading ? <Spinner label="Loading production…" /> : members.length === 0 ? (
        <div className="tr-card"><p className="tr-empty">No team members yet.</p></div>
      ) : (
        <div className="tr-card tr-summary-card">
          <div className="tr-table-wrap">
            <table className="tr-table tr-table-summary">
              <thead><tr><th>Team member</th><th>Sold premium</th><th>Recruits</th></tr></thead>
              <tbody>
                {members.map(m => {
                  const list = weekAppts.filter(a => a.userId === m.id);
                  const sold = list.filter(a => a.result === 'sale');
                  const recruited = list.filter(a => a.result === 'recruit');
                  const totalPremium = sold.reduce((s, a) => s + (Number(a.targetPremium) || 0), 0);
                  return (
                    <tr key={m.id}>
                      <td>{m.display_name}{m.role === 'manager' ? <span className="tr-note"> — manager</span> : null}</td>
                      <td className="tr-mono">{fmtCurrency(totalPremium)}{sold.length ? <span className="tr-note"> ({sold.length})</span> : null}</td>
                      <td>{recruited.length === 0 ? '—' : recruited.map(a => a.client).join(', ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function ManagerView({ user }) {
  const [tab, setTab] = useState('mine');
  return (
    <Shell>
      <Header user={user} />
      <main className="tr-main">
        <div className="tr-tabs" style={{ maxWidth: 460 }}>
          <button className={`tr-tab ${tab === 'mine' ? 'tr-tab-active' : ''}`} onClick={() => setTab('mine')}>My Appointments</button>
          <button className={`tr-tab ${tab === 'pace' ? 'tr-tab-active' : ''}`} onClick={() => setTab('pace')}>Team Pace</button>
          <button className={`tr-tab ${tab === 'production' ? 'tr-tab-active' : ''}`} onClick={() => setTab('production')}>Track Production</button>
        </div>
        {tab === 'mine' && <MyAppointmentsBody user={user} />}
        {tab === 'pace' && <TeamPaceBody user={user} />}
        {tab === 'production' && <TrackProductionBody user={user} />}
      </main>
    </Shell>
  );
}

// ---------------------------------------------------------------------
// super admin — promote/demote people, plus the same team pace view
// ---------------------------------------------------------------------
async function fetchAllUsers() {
  const { data, error } = await supabase.from('profiles').select('*').order('display_name');
  if (error) { console.error(error); return []; }
  return data;
}
async function changeUserRole(id, newRole) {
  const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', id);
  return !error ? null : error.message;
}
async function deleteUserProfile(id) {
  const { error } = await supabase.from('profiles').delete().eq('id', id);
  return !error ? null : error.message;
}
async function changeUserManager(id, newManagerId) {
  const { error } = await supabase.from('profiles').update({ manager_id: newManagerId || null }).eq('id', id);
  return !error ? null : error.message;
}
function ManageUsersView({ currentUserId }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setUsers(await fetchAllUsers());
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const managerOptions = users.filter(u => u.role === 'manager');

  async function handleChange(id, newRole) {
    setSavingId(id);
    setError('');
    const err = await changeUserRole(id, newRole);
    setSavingId(null);
    if (err) { setError(err); return; }
    setUsers(prev => prev.map(u => u.id === id ? { ...u, role: newRole } : u));
  }

  async function handleManagerChange(id, newManagerId) {
    setSavingId(id);
    setError('');
    const err = await changeUserManager(id, newManagerId);
    setSavingId(null);
    if (err) { setError(err); return; }
    setUsers(prev => prev.map(u => u.id === id ? { ...u, manager_id: newManagerId || null } : u));
  }

  async function handleDelete(id, name) {
    const ok = window.confirm(`Remove ${name} from the team? They'll no longer be able to use the app. Their past appointment history is kept, not deleted.`);
    if (!ok) return;
    setSavingId(id);
    setError('');
    const err = await deleteUserProfile(id);
    setSavingId(null);
    if (err) { setError(err); return; }
    setUsers(prev => prev.filter(u => u.id !== id));
  }

  return (
    <div className="tr-card tr-summary-card">
      {error && <div className="tr-error" style={{ margin: 16 }}>{error}</div>}
      {loading ? <Spinner label="Loading team…" /> : (
        <div className="tr-table-wrap">
          <table className="tr-table tr-table-summary">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Manager</th><th></th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    {u.display_name}{u.id === currentUserId ? ' (you)' : ''}
                    <div className="tr-tenure">Member for {tenureSince(u.created_at)}</div>
                  </td>
                  <td>{u.email || '—'}</td>
                  <td>
                    <select value={u.role} disabled={savingId === u.id} onChange={e => handleChange(u.id, e.target.value)}>
                      <option value="advisor">Advisor</option>
                      <option value="manager">Manager</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </td>
                  <td>
                    {u.role === 'advisor' ? (
                      <select value={u.manager_id || ''} disabled={savingId === u.id} onChange={e => handleManagerChange(u.id, e.target.value)}>
                        <option value="">— none —</option>
                        {managerOptions.map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)}
                      </select>
                    ) : '—'}
                  </td>
                  <td>
                    {u.id !== currentUserId && (
                      <button className="tr-icon-btn" onClick={() => handleDelete(u.id, u.display_name)} disabled={savingId === u.id} title="Remove from team">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
function AdminView({ user }) {
  const [tab, setTab] = useState('mine');
  return (
    <Shell>
      <Header user={user} />
      <main className="tr-main">
        <div className="tr-tabs" style={{ maxWidth: 620 }}>
          <button className={`tr-tab ${tab === 'mine' ? 'tr-tab-active' : ''}`} onClick={() => setTab('mine')}>My Appointments</button>
          <button className={`tr-tab ${tab === 'pace' ? 'tr-tab-active' : ''}`} onClick={() => setTab('pace')}>Team Pace</button>
          <button className={`tr-tab ${tab === 'production' ? 'tr-tab-active' : ''}`} onClick={() => setTab('production')}>Track Production</button>
          <button className={`tr-tab ${tab === 'users' ? 'tr-tab-active' : ''}`} onClick={() => setTab('users')}>Manage Team</button>
        </div>
        {tab === 'mine' && <MyAppointmentsBody user={user} />}
        {tab === 'pace' && <TeamPaceBody user={user} />}
        {tab === 'production' && <TrackProductionBody user={user} />}
        {tab === 'users' && <ManageUsersView currentUserId={user.id} />}
      </main>
    </Shell>
  );
}

// ---------------------------------------------------------------------
// root — handles the Supabase session/profile lifecycle
// ---------------------------------------------------------------------
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = checking, null = logged out
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (session && session.user) {
      setProfileLoading(true);
      setProfileError('');
      supabase.from('profiles').select('*').eq('id', session.user.id).single()
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) setProfileError('Could not load your profile. Try refreshing the page.');
          setProfile(data || null);
          setProfileLoading(false);
        });
    } else {
      setProfile(null);
    }
    return () => { cancelled = true; };
  }, [session]);

  if (session === undefined) return <Shell><Spinner label="Loading…" /></Shell>;
  if (recoveryMode) return <ResetPasswordScreen onDone={() => setRecoveryMode(false)} />;
  if (!session) return <AuthScreen />;
  if (profileError) {
    return (
      <Shell>
        <div className="tr-auth-wrap"><div className="tr-card"><p className="tr-error">{profileError}</p></div></div>
      </Shell>
    );
  }
  if (profileLoading || !profile) return <Shell><Spinner label="Loading your account…" /></Shell>;

  const user = { id: session.user.id, displayName: profile.display_name, role: profile.role };
  if (user.role === 'super_admin') return <AdminView user={user} />;
  if (user.role === 'manager') return <ManagerView user={user} />;
  return <AdvisorView user={user} />;
}

// ---------------------------------------------------------------------
// styles
// ---------------------------------------------------------------------
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,600;6..72,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap');

.tr-root {
  --ink: #14202B;
  --ink-2: #1C2E3D;
  --paper: #FBFAF6;
  --paper-dim: #EFEBDF;
  --card: #FFFFFF;
  --brass: #C9A24B;
  --brass-dark: #A9843A;
  --green: #3F8F6C;
  --amber: #D98E3B;
  --rust: #B8503D;
  --violet: #7C5FA6;
  --violet-dark: #6B4E96;
  --type-recruit: #3574B8;
  --type-recruit-dark: #285A91;
  --type-sale: #D9772E;
  --type-sale-dark: #B45F1E;
  --slate: #33414D;
  --slate-light: #7C8998;
  --line: rgba(19,35,48,0.12);

  font-family: 'IBM Plex Sans', system-ui, sans-serif;
  color: var(--slate);
  background: var(--paper-dim);
  min-height: 100vh;
  width: 100%;
}
.tr-root *, .tr-root *::before, .tr-root *::after { box-sizing: border-box; }
.tr-root :focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }
.tr-mono { font-family: 'IBM Plex Mono', monospace; }

/* header */
.tr-header {
  background: var(--ink);
  color: var(--paper);
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 24px;
  position: sticky; top: 0; z-index: 10;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.tr-brand { display: flex; align-items: center; gap: 8px; font-family: 'Newsreader', serif; font-size: 20px; font-weight: 600; color: var(--brass); letter-spacing: 0.2px; }
.tr-brand em { font-style: italic; color: var(--paper); font-weight: 600; }
.tr-brand-center { justify-content: center; }
.tr-header-user { display: flex; align-items: center; gap: 12px; }
.tr-header-name { font-weight: 500; }
.tr-header-role { text-transform: capitalize; font-size: 12px; padding: 3px 9px; border-radius: 999px; background: rgba(201,162,75,0.18); color: var(--brass); border: 1px solid rgba(201,162,75,0.35); }

/* layout */
.tr-main { max-width: 980px; margin: 0 auto; padding: 24px 20px 64px; display: flex; flex-direction: column; gap: 20px; }
.tr-row-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.tr-h2 { font-family: 'Newsreader', serif; font-size: 21px; font-weight: 600; color: var(--ink); display: flex; align-items: center; gap: 8px; margin: 0; }
.tr-h3 { font-family: 'Newsreader', serif; font-size: 16px; font-weight: 600; color: var(--ink); margin: 0 0 10px; }

/* card */
.tr-card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 18px 20px; box-shadow: 0 1px 2px rgba(19,35,48,0.04); }
.tr-appt-group + .tr-appt-group { margin-top: 0; }

/* week nav */
.tr-weeknav { display: flex; align-items: center; gap: 10px; }
.tr-weeknav-label { display: flex; align-items: center; gap: 8px; font-weight: 500; color: var(--ink); margin-right: auto; font-size: 15px; }

/* buttons */
.tr-btn { display: inline-flex; align-items: center; gap: 6px; font-family: inherit; font-size: 14px; font-weight: 500; padding: 9px 16px; border-radius: 7px; border: 1px solid transparent; cursor: pointer; transition: background .15s, border-color .15s, transform .1s; }
.tr-btn:active { transform: translateY(1px); }
.tr-btn-brass { background: var(--brass); color: var(--ink); }
.tr-btn-brass:hover { background: var(--brass-dark); }
.tr-btn-brass:disabled { opacity: 0.6; cursor: default; }
.tr-btn-ghost { background: transparent; border-color: var(--line); color: var(--slate); }
.tr-btn-ghost:hover { background: var(--paper-dim); }
.tr-btn-sm { padding: 6px 12px; font-size: 13px; }
.tr-btn-block { width: 100%; justify-content: center; margin-top: 6px; }
.tr-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 7px; border: 1px solid transparent; background: transparent; color: inherit; cursor: pointer; }
.tr-header .tr-icon-btn { color: var(--paper); }
.tr-header .tr-icon-btn:hover { background: rgba(255,255,255,0.1); }
.tr-main .tr-icon-btn:hover { background: var(--paper-dim); }

/* pace strip (signature element) */
.tr-pace { display: flex; flex-direction: column; gap: 14px; }
.tr-pace-hint { margin: 0; font-size: 13px; color: var(--slate-light); }
.tr-pace-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px 28px; }
.tr-pace-group { display: flex; flex-direction: column; gap: 8px; }
.tr-pace-label { display: flex; justify-content: space-between; font-size: 13px; font-weight: 500; color: var(--ink); text-transform: uppercase; letter-spacing: 0.04em; }
.tr-pace-count { color: var(--brass-dark); }
.tr-pace-row { display: flex; flex-wrap: wrap; gap: 7px; }
.tr-pill { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--line); background: transparent; display: inline-block; transition: background .15s, border-color .15s; }
.tr-pill-filled { background: var(--brass); border-color: var(--brass-dark); }
.tr-pill-alt.tr-pill-filled { background: var(--green); border-color: #2E6E51; }

/* forms */
.tr-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.tr-field { display: flex; flex-direction: column; gap: 5px; font-size: 13px; font-weight: 500; color: var(--slate); }
.tr-field-wide { grid-column: 1 / -1; }
.tr-field input, .tr-field select { font-family: inherit; font-size: 14px; padding: 9px 10px; border-radius: 6px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); }
.tr-field input:focus, .tr-field select:focus { border-color: var(--brass); }
.tr-badge { font-size: 12.5px; font-weight: 500; padding: 8px 10px; border-radius: 6px; border: 1px dashed var(--line); background: var(--paper); }
.tr-badge-weekend { color: var(--brass-dark); border-color: rgba(201,162,75,0.5); background: rgba(201,162,75,0.08); }
.tr-badge-weekday { color: #2E6E51; border-color: rgba(63,143,108,0.4); background: rgba(63,143,108,0.08); }
.tr-form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; }
.tr-error { margin-top: 10px; font-size: 13px; color: var(--rust); background: rgba(184,80,61,0.08); border: 1px solid rgba(184,80,61,0.3); padding: 8px 10px; border-radius: 6px; }
.tr-link-btn { align-self: flex-start; background: none; border: none; padding: 0; margin-top: -4px; font-family: inherit; font-size: 12.5px; font-weight: 500; color: var(--brass-dark); cursor: pointer; text-decoration: underline; }
.tr-link-btn:hover { color: var(--ink); }
.tr-link-btn:disabled { opacity: 0.6; cursor: default; }

/* follow-up modal + pill choices */
.tr-modal-backdrop { position: fixed; inset: 0; background: rgba(20,32,43,0.55); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
.tr-modal-card { background: var(--card); border-radius: 12px; padding: 24px 22px; max-width: 440px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 8px 40px rgba(19,35,48,0.28); }
.tr-followup-list { display: flex; flex-direction: column; gap: 16px; margin-top: 4px; }
.tr-pillrow { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 5px; }
.tr-pill-btn { font-family: inherit; font-size: 12.5px; font-weight: 500; padding: 7px 13px; border-radius: 999px; border: 1px solid var(--line); background: var(--paper); color: var(--slate); cursor: pointer; transition: background .15s, border-color .15s, color .15s; }
.tr-pill-btn:hover { border-color: var(--brass); }
.tr-pill-btn-active { background: var(--brass); border-color: var(--brass-dark); color: var(--ink); }

/* tables */
.tr-table-wrap { overflow-x: auto; }
.tr-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.tr-table th { text-align: left; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--slate-light); padding: 6px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; }
.tr-table td { padding: 9px 10px; border-bottom: 1px solid var(--line); color: var(--ink); vertical-align: top; }
.tr-table tbody tr:last-child td { border-bottom: none; }
.tr-note { color: var(--slate-light); }
.tr-empty { font-size: 13.5px; color: var(--slate-light); margin: 4px 0 0; }

.tr-summary-card { padding: 0; overflow: hidden; }
.tr-table-summary th, .tr-table-summary td { padding: 12px 16px; }
.tr-clickable-row { cursor: pointer; }
.tr-clickable-row:hover { background: var(--paper-dim); }
.tr-expand-row td { background: var(--paper); padding: 16px; }
.tr-expand-row .tr-card { margin-bottom: 12px; }
.tr-expand-row .tr-card:last-child { margin-bottom: 0; }

.tr-minibar-wrap { display: flex; align-items: center; gap: 6px; min-width: 84px; }
.tr-minibar-track { flex: 1; height: 7px; border-radius: 999px; background: var(--paper-dim); overflow: hidden; }
.tr-minibar-fill { height: 100%; background: var(--brass); border-radius: 999px; }
.tr-minibar-num { font-size: 12px; color: var(--slate-light); white-space: nowrap; }

.tr-status { font-size: 12px; font-weight: 500; padding: 4px 10px; border-radius: 999px; white-space: nowrap; }
.tr-status-green { background: rgba(63,143,108,0.12); color: #2E6E51; }
.tr-status-amber { background: rgba(217,142,59,0.14); color: #9C6423; }
.tr-status-rust { background: rgba(184,80,61,0.12); color: var(--rust); }
.tr-status-violet { background: rgba(124,95,166,0.14); color: var(--violet-dark); }
.tr-status-none { background: transparent; color: var(--slate-light); border: 1px dashed var(--line); }

/* recruit/sale type coding */
.tr-type-recruit { box-shadow: inset 3px 0 0 0 var(--type-recruit); }
.tr-type-sale { box-shadow: inset 3px 0 0 0 var(--type-sale); }
.tr-pill-recruit.tr-pill-btn-active-recruit { background: var(--type-recruit); border-color: var(--type-recruit-dark); color: #fff; }
.tr-pill-sale.tr-pill-btn-active-sale { background: var(--type-sale); border-color: var(--type-sale-dark); color: #fff; }
.tr-legend-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }

/* tenure */
.tr-tenure { font-size: 11px; color: var(--slate-light); margin-top: 2px; }

/* needs-attention sidebar */
.tr-appts-shell { display: flex; gap: 24px; align-items: flex-start; }
.tr-appts-sidebar { display: flex; flex-direction: column; gap: 4px; min-width: 190px; flex-shrink: 0; }
.tr-appts-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 20px; }
.tr-sidebar-item { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 9px 12px; border-radius: 8px; border: 1px solid transparent; border-left-width: 3px; background: transparent; font-family: inherit; font-size: 13px; font-weight: 500; color: var(--slate); cursor: pointer; text-align: left; }
.tr-sidebar-item:hover { background: var(--paper-dim); }
.tr-sidebar-item-active { background: var(--paper-dim); border-color: var(--line); }
.tr-sidebar-item .tr-mono { font-size: 11.5px; color: var(--slate-light); background: var(--paper); border-radius: 999px; padding: 1px 7px; }
.tr-sidebar-item-week { border-left-color: var(--brass); font-family: 'Newsreader', serif; font-size: 14.5px; }
.tr-sidebar-item-none { border-left-color: var(--slate-light); }
.tr-sidebar-item-green { border-left-color: var(--green); }
.tr-sidebar-item-amber { border-left-color: var(--amber); }
.tr-sidebar-item-rust { border-left-color: var(--rust); }
.tr-sidebar-item-violet { border-left-color: var(--violet); }
.tr-sidebar-divider { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--slate-light); padding: 14px 12px 2px; }

/* auth */
.tr-auth-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
.tr-auth-card { width: 100%; max-width: 400px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 28px 26px; box-shadow: 0 4px 24px rgba(19,35,48,0.08); }
.tr-auth-sub { text-align: center; font-size: 13.5px; color: var(--slate-light); margin: 6px 0 18px; }
.tr-tabs { display: flex; background: var(--paper-dim); border-radius: 8px; padding: 3px; margin-bottom: 18px; }
.tr-tab { flex: 1; padding: 8px; border: none; background: transparent; border-radius: 6px; font-family: inherit; font-size: 13.5px; font-weight: 500; color: var(--slate-light); cursor: pointer; }
.tr-tab-active { background: var(--card); color: var(--ink); box-shadow: 0 1px 2px rgba(19,35,48,0.08); }
.tr-auth-form { display: flex; flex-direction: column; gap: 12px; }

/* spinner */
.tr-spinner { display: flex; align-items: center; gap: 8px; color: var(--slate-light); font-size: 13.5px; padding: 24px; justify-content: center; }
@media (prefers-reduced-motion: no-preference) { .tr-spin { animation: tr-rotate 0.9s linear infinite; } }
@keyframes tr-rotate { to { transform: rotate(360deg); } }

/* responsive */
@media (max-width: 720px) {
  .tr-pace-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
  .tr-form-grid { grid-template-columns: 1fr; }
  .tr-pace-grid { grid-template-columns: 1fr; }
  .tr-header { padding: 12px 16px; }
  .tr-header-name { display: none; }
  .tr-main { padding: 18px 14px 48px; }
  .tr-tabs { flex-wrap: wrap; }
  .tr-tabs .tr-tab { flex: 1 1 45%; }
  .tr-appts-shell { flex-direction: column; }
  .tr-appts-sidebar { flex-direction: row; flex-wrap: wrap; min-width: 0; width: 100%; gap: 6px; }
  .tr-sidebar-divider { flex-basis: 100%; padding: 8px 4px 0; }
}
`;
