// Team overview, super admins: who gets the daily and weekly activity
// reports by email, which ones go out, a preview and a test email.
import { useEffect, useState } from 'react';
import { Eye, Mail, Plus, Send, X } from 'lucide-react';
import { Modal } from '../../components/ui.jsx';
import { fetchReportSettings, isEmail, previewReport, saveReportSettings, sendTestReport } from '../../data/reports.js';

const when = iso => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

function lastSent(sends, kind) {
  const s = sends.find(x => x.kind === kind && !x.test && x.sent_at);
  if (!s) return 'Not sent yet';
  const n = String(s.sent_to || '').split(',').filter(Boolean).length;
  return `Last sent ${when(s.sent_at)}${n ? ` to ${n} ${n === 1 ? 'person' : 'people'}` : ''}`;
}

function Preview({ kind, onClose }) {
  const [state, setState] = useState({ loading: true });
  const [test, setTest] = useState('');
  useEffect(() => {
    let alive = true;
    previewReport(kind).then(r => { if (alive) setState(r.ok ? { mail: r } : { error: r.error }); });
    return () => { alive = false; };
  }, [kind]);
  async function emailMe() {
    setTest('sending');
    const r = await sendTestReport(kind);
    setTest(r.ok ? `Sent to ${r.to}.` : r.error);
  }
  const name = kind === 'weekly' ? 'Weekly report' : 'Daily report';
  return (
    <Modal onClose={onClose} className="tr-er-modal" labelledBy="tr-er-prev-title">
      <div className="tr-modal-head">
        <div>
          <h3 className="tr-h3" id="tr-er-prev-title">{name} preview</h3>
          {state.mail ? <p className="tr-er-subject">{state.mail.subject}</p> : null}
        </div>
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </div>
      {state.loading ? <p className="tr-empty">Putting it together…</p> : null}
      {state.error ? <p className="tr-error" role="alert">{state.error}</p> : null}
      {state.mail ? <iframe className="tr-er-frame" title={`${name} preview`} sandbox="" srcDoc={state.mail.html} /> : null}
      <div className="tr-modal-foot tr-er-foot">
        <span className="tr-er-note" role="status">{test === 'sending' ? 'Sending…' : test || 'Only you get the test, marked [Test].'}</span>
        <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" disabled={!state.mail || test === 'sending'} onClick={emailMe}><Send size={14} /> Email me a test</button>
      </div>
    </Modal>
  );
}

export function EmailReportsCard() {
  const [state, setState] = useState(null);
  const [list, setList] = useState([]);
  const [daily, setDaily] = useState(true);
  const [weekly, setWeekly] = useState(true);
  const [adding, setAdding] = useState('');
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);

  function take(s) {
    setList(s.recipients || []);
    setDaily(!!s.daily_on);
    setWeekly(!!s.weekly_on);
  }
  useEffect(() => {
    let alive = true;
    fetchReportSettings().then(r => { if (!alive) return; setState(r); if (r.settings) take(r.settings); });
    return () => { alive = false; };
  }, []);

  if (!state) return null;
  const head = <div className="tr-tov-box-head"><h3 id="tr-er-h"><Mail size={15} aria-hidden="true" /> Email reports</h3></div>;
  if (state.unavailable || state.error) {
    return (
      <section className="tr-card tr-tov-box tr-er" aria-labelledby="tr-er-h">
        {head}
        <p className="tr-empty">{state.unavailable ? 'Daily and weekly activity emails need the database update (migration-activity-reports.sql) to be run first.' : "Couldn't load the email report settings."}</p>
      </section>
    );
  }
  const s = state.settings;
  const dirty = !sameList(list, s.recipients || []) || daily !== !!s.daily_on || weekly !== !!s.weekly_on;

  function add(e) {
    e.preventDefault();
    const parts = adding.split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
    if (!parts.length) return;
    const bad = parts.find(x => !isEmail(x));
    if (bad) { setMsg({ text: `“${bad}” isn’t an email address.`, bad: true }); return; }
    setList(l => [...l, ...parts.filter(x => !l.includes(x))]);
    setAdding('');
    setMsg({ text: '', bad: false });
  }
  async function save() {
    setSaving(true);
    const r = await saveReportSettings({ recipients: list, daily, weekly });
    setSaving(false);
    if (!r.ok) { setMsg({ text: r.error, bad: true }); return; }
    setState(x => ({ ...x, settings: r.settings }));
    take(r.settings);
    setMsg({ text: 'Saved.', bad: false });
  }

  return (
    <section className="tr-card tr-tov-box tr-er" aria-labelledby="tr-er-h">
      {head}
      <p className="tr-er-sub">Company, team and agent numbers: team members added, appointments set and completed, applications and target premium.</p>
      <ul className="tr-er-kinds">
        <li>
          <label className="tr-checkbox-field"><input type="checkbox" checked={daily} onChange={e => setDaily(e.target.checked)} /> <span><strong>Daily</strong> at 7 AM Central, for the day before</span></label>
          <small>{lastSent(state.sends, 'daily')}</small>
        </li>
        <li>
          <label className="tr-checkbox-field"><input type="checkbox" checked={weekly} onChange={e => setWeekly(e.target.checked)} /> <span><strong>Weekly</strong> Saturdays at 7 AM, Saturday to Friday vs. the week before</span></label>
          <small>{lastSent(state.sends, 'weekly')}</small>
        </li>
      </ul>
      {s.last_error ? <p className="tr-error tr-er-err" role="alert">The last report didn’t send ({s.last_error_at ? when(s.last_error_at) : 'recently'}): {s.last_error}. It tries again every hour.</p> : null}
      <h4 className="tr-er-h4">Sent to</h4>
      {list.length ? (
        <ul className="tr-er-list">
          {list.map(e => (
            <li key={e}><span>{e}</span><button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => setList(l => l.filter(x => x !== e))} aria-label={`Remove ${e}`}><X size={14} /></button></li>
          ))}
        </ul>
      ) : <p className="tr-empty">Nobody yet. Add an email so the reports have somewhere to go.</p>}
      <form className="tr-er-add" onSubmit={add} noValidate>
        <label className="tr-field"><span className="tr-sr-only">Add an email</span>
          <input type="email" inputMode="email" autoComplete="off" placeholder="name@biginsurancenetwork.com" value={adding} onChange={e => setAdding(e.target.value)} />
        </label>
        <button type="submit" className="tr-btn tr-btn-ghost tr-btn-sm"><Plus size={14} /> Add</button>
      </form>
      {msg.text ? <p className={msg.bad ? 'tr-error' : 'tr-er-ok'} role={msg.bad ? 'alert' : 'status'}>{msg.text}</p> : null}
      <div className="tr-er-acts">
        {dirty ? <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save changes'}</button> : null}
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => setPreview('daily')}><Eye size={14} /> Preview daily</button>
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => setPreview('weekly')}><Eye size={14} /> Preview weekly</button>
      </div>
      {preview ? <Preview kind={preview} onClose={() => setPreview(null)} /> : null}
    </section>
  );
}
