// My work → Clients: everyone you've put on your list, booked, presented,
// sold or recruited, one profile per person, with the next step on top. It
// replaced Pipeline's five stage tabs; those lists are still a tap away
// under "Other lists". Stages come from lib/clients.js.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Check, ChevronLeft, ChevronRight, GitMerge, ListChecks, NotebookPen, Pencil, Plus, Presentation, Search, UserPlus, X } from 'lucide-react';
import { addPolicyNote, fetchAppointmentsImOn, fetchMyAppointments, fetchPolicyNotes, isRecruitType, isSaleType, linkAppointmentToProspect, logPresentedAppointment, persistFollowUp, updatePolicyFields } from '../data/appointments.js';
import { ALL_CHARACTERISTICS, fetchMyProspects, insertProspect, prospectToAppointmentPrefill, updateProspect } from '../data/prospects.js';
import { fetchRecruitSignups } from '../data/recruits.js';
import { fetchOrgDirectory } from '../data/team.js';
import { fetchMyIntakeStatus } from '../clientIntake.js';
import { addFollowUpNote, fetchMyFollowUpNotes } from '../followUpNotes.js';
import { buildClients, CLIENT_FILTERS, CLIENT_STAGES, clientMatches, dayWord, filterCounts, filterLabel, inFilter, initialsOf, sortClients } from '../lib/clients.js';
import { fmtApptDateTime, todayStr } from '../lib/dates.js';
import { fmtCurrency } from '../lib/format.js';
import { Modal, SkelBlock, TitleInfo } from '../components/ui.jsx';
import { appointmentTexts, ContactRow, prospectTexts } from '../components/contact.jsx';
import { FollowUpModal } from '../components/followUpModal.jsx';
import { openAppointment, useAppointmentEdits } from '../components/appointmentPanel.jsx';
import { askText } from '../components/confirm.jsx';
import { ProspectForm } from './Prospecting.jsx';
import { AppointmentsCard, LinksCard } from './clientProfileParts.jsx';
import { QUICK_NOTE_TAGS } from '../lib/quickNotes.js';

const firstOf = n => (n || '').trim().split(/\s+/)[0] || n;
// "Not the same person" on a possible match, remembered on this device
// (the same list Prospecting uses).
const NOT_SAME = 'pl_not_same';
const readNotSame = () => { try { return new Set(JSON.parse(localStorage.getItem(NOT_SAME) || '[]')); } catch { return new Set(); } };

function StageChip({ stage, short = false }) {
  const s = CLIENT_STAGES[stage];
  return <span className={`tr-cl-chip tr-cl-chip-${stage}`}>{short && s.short ? s.short : s.label}</span>;
}
function Avatar({ c, big = false }) {
  return <span className={`tr-cl-avatar tr-cl-avatar-${c.stage} ${big ? 'tr-cl-avatar-big' : ''}`} aria-hidden="true">{initialsOf(c.name)}</span>;
}
function ForTag({ c }) {
  if (!c.presented) return null;
  return <span className="tr-cl-for"><Presentation size={12} aria-hidden="true" /> for {firstOf(c.owner.name) || 'your team'}</span>;
}

// The appointment form, filled in for this person.
function bookingFor(c) {
  if (c.prospect) return prospectToAppointmentPrefill(c.prospect);
  const last = c.appts[c.appts.length - 1];
  return {
    client: c.name, notes: '', clientEmail: c.email, clientPhone: c.phone, prospectId: '',
    typeRecruit: !!last && isRecruitType(last), typeSale: !last || isSaleType(last),
  };
}
// A prospect's saved details, as the prospect form takes them.
function prospectForm(p, changes = {}) {
  const f = { firstName: p.firstName, lastName: p.lastName, age: p.age ?? '', relationshipStrength: p.relationshipStrength ?? 5, notes: p.notes || '', source: p.source || '', email: p.email || '', phone: p.phone || '' };
  ALL_CHARACTERISTICS.forEach(ch => { f[ch.key] = !!p[ch.key]; });
  return { ...f, ...changes };
}
function blankProspect(name, extra = {}) {
  const w = (name || '').trim().split(/\s+/);
  const f = { firstName: w[0] || '', lastName: w.slice(1).join(' '), age: '', relationshipStrength: 5, notes: '', source: '', email: '', phone: '' };
  ALL_CHARACTERISTICS.forEach(ch => { f[ch.key] = false; });
  return { ...f, ...extra };
}

// The policy on one sold appointment: premium, split, requirements, the
// effective date and notes (yours and your leaders').
function PolicyCard({ pol, c, user, nameOf, onChanged }) {
  const a = pol.appt;
  const mine = !c.presented;
  const [notes, setNotes] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [eff, setEff] = useState(pol.effectiveDate);
  const [req, setReq] = useState(pol.requirementsCompleted);
  useEffect(() => { setEff(pol.effectiveDate); }, [pol.effectiveDate]);
  useEffect(() => { setReq(pol.requirementsCompleted); }, [pol.requirementsCompleted]);
  useEffect(() => {
    let alive = true;
    fetchPolicyNotes(a.id).then(n => { if (alive) setNotes(n || []); }).catch(() => { if (alive) setNotes([]); });
    return () => { alive = false; };
  }, [a.id]);
  async function save(fields) {
    setBusy(true);
    const ok = await updatePolicyFields(a.id, fields);
    setBusy(false);
    if (ok) { window.dispatchEvent(new Event('paceledger:appointments-changed')); onChanged(); }
    else { setReq(pol.requirementsCompleted); setEff(pol.effectiveDate); }
  }
  async function addNote() {
    if (!draft.trim()) return;
    setBusy(true);
    const res = await addPolicyNote(a.id, user.id, user.displayName, draft);
    setBusy(false);
    if (res.ok) { setNotes(prev => [...(prev || []), res.record]); setDraft(''); }
  }
  const partner = nameOf(pol.partnerId) || 'your partner';
  const share = pct => (pol.premium ? fmtCurrency(Math.round(pol.premium * pct) / 100) : '');
  return (
    <section className="tr-card tr-cl-card" id={`cl-policy-${a.id}`} aria-labelledby={`cl-pol-h-${a.id}`}>
      <div className="tr-row-head">
        <h3 className="tr-cl-h" id={`cl-pol-h-${a.id}`}>Policy</h3>
        <span className={`tr-cl-chip tr-cl-chip-${pol.issued ? 'client' : 'pending'}`}>{pol.issued ? 'Issued' : 'Pending issue'}</span>
      </div>
      <p className="tr-cl-premium">{pol.premium ? fmtCurrency(pol.premium) : 'Premium not entered'} {pol.premium ? <span>target premium</span> : null}</p>
      <p className="tr-cl-muted">Sold {dayWord(new Date(`${pol.soldOn}T12:00:00`).getTime())} · {pol.effectiveDate ? `effective ${dayWord(new Date(`${pol.effectiveDate}T12:00:00`).getTime())}` : 'effective date not set'}</p>
      {pol.split ? (
        <p className="tr-cl-split">Split {pol.myPercent}/{100 - pol.myPercent} with {partner}{pol.premium ? (pol.myPercent === 50 ? `: ${share(50)} each` : `: ${share(pol.myPercent)} yours, ${share(100 - pol.myPercent)} theirs`) : ''}</p>
      ) : null}
      {mine ? (
        <div className="tr-cl-policy-edit">
          <label className="tr-checkbox-field">
            <input type="checkbox" checked={req} disabled={busy} onChange={e => { setReq(e.target.checked); save({ requirementsCompleted: e.target.checked }); }} />
            <span>Every requirement is done<small className="tr-field-hint">{req ? 'Done.' : 'Check this once the carrier has everything it asked for.'}</small></span>
          </label>
          <label className="tr-field">
            <span>Effective date</span>
            <input type="date" value={eff} disabled={busy} onChange={e => setEff(e.target.value)} onBlur={() => { if (eff !== pol.effectiveDate) save({ effectiveDate: eff }); }} />
          </label>
          {!pol.issued ? <p className="tr-cl-muted">It counts as issued once the effective date is here and every requirement is done.</p> : null}
        </div>
      ) : (
        <p className="tr-cl-muted">Requirements {pol.requirementsCompleted ? 'done' : 'open'}. {firstOf(c.owner.name) || 'The advisor'} keeps this up to date.</p>
      )}
      <div className="tr-cl-pnotes">
        {notes && notes.length ? (
          <ul>
            {notes.map(n => <li key={n.id}><strong>{n.author_name || 'Note'}</strong> · {dayWord(new Date(n.created_at).getTime())}: {n.note}</li>)}
          </ul>
        ) : null}
        {mine ? (
          <div className="tr-intake-link-row">
            <input className="tr-search-input" style={{ flex: 1 }} type="text" value={draft} placeholder="Add a policy note (APS ordered…)" aria-label="Add a policy note"
              onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addNote(); }} />
            <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" disabled={busy || !draft.trim()} onClick={addNote}>Add</button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

// selected / onSelect(key, name): the open profile (kept by the app, so
// Cancel on the appointment form comes back to it). intent from elsewhere:
// { open: key } (search), { search } or { add: true } (+ New → Add a
// prospect). bar: the pipeline bar (Pipeline.jsx), under the heading.
export function ClientsBody({ user, selected, onSelect, onLogAppointment, intent, onIntentConsumed, bar = null }) {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('next');
  const [flash, setFlash] = useState('');
  const [outcome, setOutcome] = useState(null); // { appt, presenter }
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null); // { editing: prospect | null }
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notSame, setNotSame] = useState(readNotSame);
  const [noting, setNoting] = useState(false);
  useEffect(() => { if (!flash) return undefined; const t = setTimeout(() => setFlash(''), 6000); return () => clearTimeout(t); }, [flash]);
  // A message about one person doesn't follow you to the next.
  useEffect(() => { setFlash(''); }, [selected]);

  const load = useCallback(async () => {
    const [prospects, appointments, presenting, notes, intakes, signups, org] = await Promise.all([
      fetchMyProspects(user.id), fetchMyAppointments(user.id), fetchAppointmentsImOn(user.id).catch(() => []),
      fetchMyFollowUpNotes(user.id).catch(() => []), fetchMyIntakeStatus(user.id).catch(() => []),
      fetchRecruitSignups('2000-01-01', todayStr()).catch(() => ({ rows: [] })), fetchOrgDirectory().catch(() => []),
    ]);
    setData({ prospects, appointments, presenting, notes, intakes, signups: (signups && signups.rows) || [], org });
  }, [user.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const again = () => load();
    window.addEventListener('paceledger:appointments-changed', again);
    window.addEventListener('paceledger:intake-changed', again);
    return () => { window.removeEventListener('paceledger:appointments-changed', again); window.removeEventListener('paceledger:intake-changed', again); };
  }, [load]);
  useAppointmentEdits(() => load());
  // Search (or anywhere else) asked for one person.
  useEffect(() => {
    if (!intent) return;
    if (intent.open) onSelect(intent.open);
    if (intent.search) { onSelect(null); setQuery(intent.search); setFilter('all'); }
    if (intent.add) { onSelect(null); setFormError(''); setForm({ editing: null }); }
    onIntentConsumed && onIntentConsumed();
  }, [intent]); // eslint-disable-line react-hooks/exhaustive-deps

  const names = useMemo(() => new Map(((data && data.org) || []).map(p => [p.id, p.display_name])), [data]);
  const nameOf = useCallback(id => names.get(id) || (id === user.id ? user.displayName : ''), [names, user.id, user.displayName]);
  const clients = useMemo(() => {
    if (!data) return [];
    const list = buildClients({ ...data, userId: user.id, nameOf });
    // "Not the same person" answers stay answered.
    list.forEach(c => {
      c.maybeSame = c.maybeSame.filter(m => {
        const pid = c.prospect ? c.prospect.id : m.key.replace(/^p:/, '');
        const apptIds = c.prospect ? m.apptIds : c.appts.map(a => a.id);
        return !apptIds.every(id => notSame.has(`${pid}:${id}`));
      });
    });
    return list;
  }, [data, user.id, nameOf, notSame]);
  const byKey = useMemo(() => new Map(clients.map(c => [c.key, c])), [clients]);
  // Each appointment's intake form (the newest, if there are two).
  const intakeByAppt = useMemo(() => {
    const m = new Map();
    ((data && data.intakes) || []).forEach(x => { if (x.source_appointment_id && !m.has(x.source_appointment_id)) m.set(x.source_appointment_id, x); });
    return m;
  }, [data]);

  if (!data) return <div className="tr-clients"><SkelBlock w="100%" h="320px" /></div>;
  const open = selected ? byKey.get(selected) : null;
  // Open a profile (null: back to everyone). The name is for the back bar
  // on the other lists ("← Sam Carter").
  const pick = (k, name) => onSelect(k, k ? name || (byKey.get(k) || {}).name || '' : '');

  // ---- actions --------------------------------------------------------
  function act(c, action) {
    if (!action) return;
    if (action.kind === 'book') onLogAppointment(bookingFor(c));
    else if (action.kind === 'change') openAppointment(action.appt);
    else if (action.kind === 'log') setOutcome({ appt: action.appt, presenter: false });
    else if (action.kind === 'logPresented') setOutcome({ appt: action.appt, presenter: true });
    else if (action.kind === 'policy') {
      if (selected !== c.key) pick(c.key);
      const pol = c.policies.find(x => !x.issued) || c.policies[0];
      setTimeout(() => { const el = pol && document.getElementById(`cl-policy-${pol.appt.id}`); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 60);
    } else if (action.kind === 'referrals') addReferrals(c);
  }
  async function saveOutcome(id, values) {
    setSaving(true);
    if (outcome.presenter) {
      const res = await logPresentedAppointment(id, values);
      setSaving(false);
      const who = firstOf(outcome.appt.setByName) || 'The advisor';
      setOutcome(null);
      if (!res.ok) setFlash(/already_logged/.test(res.error || '') ? `${who} already logged this one, so it's theirs to change.` : "Couldn't save. Check your connection and try again.");
      else setFlash(`Saved. ${who} will see it on their Today.`);
    } else {
      const res = await persistFollowUp(user, id, outcome.appt, values);
      setSaving(false);
      if (!res.ok) { setFlash("Couldn't save. Check your connection and try again."); return; }
      setOutcome(null);
      setFlash(res.newAppt ? `Saved. The follow-up is booked for ${fmtApptDateTime(res.newAppt)}.` : 'Saved.');
    }
    window.dispatchEvent(new Event('paceledger:appointments-changed'));
  }
  async function addNote(c) {
    const text = await askText({ title: `Note about ${firstOf(c.name)}`, label: 'Note', placeholder: 'Called, left a voicemail…', confirmLabel: 'Save note' });
    if (!text || !text.trim()) return;
    await saveNote(c, text);
  }
  // On their latest appointment that's started (or the next one), or, with
  // none, on your list's notes for them.
  async function saveNote(c, text) {
    const target = c.lastPast || c.appts[c.appts.length - 1];
    if (target && !c.presented) {
      const res = await addFollowUpNote({ appointmentId: target.id, authorId: user.id, authorName: user.displayName, note: text });
      if (!res.ok) { setFlash("Couldn't save the note. Check your connection and try again."); return; }
    } else if (c.prospect) {
      const stamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const res = await updateProspect(c.prospect.id, prospectForm(c.prospect, { notes: [c.prospect.notes, `${stamp}: ${text.trim()}`].filter(Boolean).join('\n') }));
      if (!res.ok) { setFlash("Couldn't save the note. Check your connection and try again."); return; }
    }
    await load();
  }
  async function addReferrals(c) {
    if (!c.prospect) return;
    const text = await askText({
      title: `Names ${firstOf(c.name)} gave you`, body: `Each one goes on your list, referred by ${c.name}.`,
      label: 'Names (one per line)', placeholder: 'Jamie Cole\nRob Diaz', confirmLabel: 'Add to my list',
    });
    const lines = (text || '').split(/\n|,/).map(s => s.trim()).filter(Boolean).slice(0, 20);
    if (!lines.length) return;
    let added = 0;
    for (const line of lines) {
      const res = await insertProspect(user.id, blankProspect(line, { source: 'Referral', referredById: c.prospect.id, referredByName: c.name }));
      if (res.ok) added += 1;
    }
    await load();
    setFlash(added === lines.length
      ? `${added} name${added === 1 ? '' : 's'} added to your list, referred by ${c.name}.`
      : `Added ${added} of ${lines.length}. Check your connection and try the rest again.`);
  }
  // Someone booked who isn't on your list: add them, with every appointment.
  async function addToList(c) {
    const res = await insertProspect(user.id, blankProspect(c.name, { phone: c.phone, email: c.email }));
    if (!res.ok) { setFlash(`Couldn't add ${c.name}. Check your connection and try again.`); return; }
    await Promise.all(c.appts.map(a => linkAppointmentToProspect(a.id, res.record.id)));
    window.dispatchEvent(new Event('paceledger:appointments-changed'));
    await load();
    pick(`p:${res.record.id}`, c.name);
    setFlash(`${c.name} is on your list now.`);
  }
  // "Rob Smith" and Robert Smith are the same person: Rob's appointments
  // join Robert's profile.
  async function merge(c, m) {
    const intoKey = c.prospect ? c.key : m.key;
    const pid = intoKey.replace(/^p:/, '');
    const ids = c.prospect ? m.apptIds : c.appts.map(a => a.id);
    const results = await Promise.all(ids.map(id => linkAppointmentToProspect(id, pid)));
    window.dispatchEvent(new Event('paceledger:appointments-changed'));
    await load();
    pick(intoKey, c.prospect ? c.name : m.name);
    setFlash(results.every(r => r && r.ok) ? 'Merged. Everything is on one profile now.' : "Some of it didn't merge. Check your connection and try again.");
  }
  function notTheSame(c, m) {
    const pid = c.prospect ? c.prospect.id : m.key.replace(/^p:/, '');
    const ids = c.prospect ? m.apptIds : c.appts.map(a => a.id);
    setNotSame(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(`${pid}:${id}`));
      try { localStorage.setItem(NOT_SAME, JSON.stringify([...next])); } catch { /* fine */ }
      return next;
    });
  }
  async function submitProspect(values, { another } = {}) {
    setFormSaving(true); setFormError('');
    const editing = form && form.editing;
    const res = editing ? await updateProspect(editing.id, values) : await insertProspect(user.id, values);
    setFormSaving(false);
    if (!res.ok) { setFormError(res.error || "Couldn't save. Try again."); return; }
    if (!editing) setFlash(`Added ${res.record.firstName} ${res.record.lastName} to your list.`);
    // "Save & add another": a fresh form, right here.
    if (another && !editing) { setForm(f => ({ editing: null, n: ((f && f.n) || 0) + 1 })); await load(); return; }
    setForm(null);
    await load();
    pick(`p:${res.record.id}`, `${res.record.firstName} ${res.record.lastName}`.trim());
  }

  const modals = (
    <>
      {outcome ? (
        <FollowUpModal appointment={outcome.appt} presenter={outcome.presenter} setByName={outcome.presenter ? outcome.appt.setByName || '' : ''}
          onClose={() => setOutcome(null)} onSave={saveOutcome} saving={saving}
          onRescheduled={outcome.presenter ? null : rec => { setOutcome(null); setFlash(`Moved ${rec.client} to ${fmtApptDateTime(rec)}.`); window.dispatchEvent(new Event('paceledger:appointments-changed')); }}
          onEdit={outcome.presenter ? null : () => { const x = outcome.appt; setOutcome(null); openAppointment(x); }} />
      ) : null}
      {form ? (
        <Modal onClose={() => setForm(null)} className="tr-cl-form-modal" labelledBy="cl-form-title">
          <span id="cl-form-title" className="tr-sr-only">{form.editing ? 'Edit details' : 'Add a name'}</span>
          {formError ? <div className="tr-error" role="alert">{formError}</div> : null}
          {!form.editing && flash ? <div className="tr-flash" role="status">{flash}</div> : null}
          <ProspectForm key={form.n || 0} editing={form.editing} saving={formSaving} onCancel={() => setForm(null)} onSubmit={(v, o) => submitProspect(v, o)} />
        </Modal>
      ) : null}
    </>
  );
  const flashEl = flash ? <div className="tr-flash" role="status">{flash}</div> : null;

  // ---- one person -------------------------------------------------------
  if (open) {
    const c = open;
    const p = c.prospect;
    const first = firstOf(c.name);
    const texts = c.nextUp ? appointmentTexts(c.nextUp, user.displayName) : prospectTexts(c.name, user.displayName);
    const referrer = p && p.referredById ? byKey.get(`p:${p.referredById}`) : null;
    const secondary = [];
    if (!c.presented && (!c.action || c.action.kind !== 'book')) secondary.push({ label: 'Book another appointment', Icon: CalendarPlus, run: () => onLogAppointment(bookingFor(c)) });
    if (!c.presented && (c.appts.length || p)) secondary.push({ label: 'Add a note', Icon: NotebookPen, run: () => addNote(c) });
    return (
      <div className="tr-clients tr-cl-profile">
        <button type="button" className="tr-cl-back" data-android-back onClick={() => pick(null)}><ChevronLeft size={16} aria-hidden="true" /> Clients</button>
        <header className="tr-cl-head">
          <Avatar c={c} big />
          <div>
            <h1 className="tr-cl-name">{c.name}</h1>
            <div className="tr-cl-head-tags"><StageChip stage={c.stage} /><ForTag c={c} />{c.virtual ? <span className="tr-cl-muted">Not on your list yet</span> : null}</div>
          </div>
        </header>
        {flashEl}
        <ContactRow phone={c.phone} email={c.email} name={c.name} texts={texts} />

        <section className="tr-card tr-cl-card tr-cl-next" aria-label="Next step">
          <p className="tr-cl-label">Next step</p>
          <p className="tr-cl-next-line">{c.next}</p>
          {c.sub ? <p className="tr-cl-muted">{c.sub}</p> : null}
          <div className="tr-cl-actions">
            {c.action ? <button type="button" className="tr-btn tr-btn-brass" onClick={() => act(c, c.action)}>{c.action.label}</button> : null}
            {secondary.map(s => <button key={s.label} type="button" className="tr-btn tr-btn-ghost" onClick={s.run}><s.Icon size={15} aria-hidden="true" /> {s.label}</button>)}
          </div>
          {c.presented ? <p className="tr-cl-muted">{firstOf(c.owner.name) || 'Your teammate'} booked {first}, so {first} is on their list. You see {first} here because you presented.</p> : null}
        </section>

        {c.virtual ? (
          <section className="tr-card tr-cl-card tr-cl-merge">
            <p><strong>{c.name}</strong> isn't on your list yet. Add them so their notes, score and referrals live here too.</p>
            <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => addToList(c)}><UserPlus size={14} aria-hidden="true" /> Add to your list</button>
          </section>
        ) : null}
        {c.maybeSame.map(m => (
          <section key={m.key} className="tr-card tr-cl-card tr-cl-merge">
            <p>{c.prospect
              ? <>Is <strong>{m.name}</strong> (booked, not on your list) the same person as {c.name}?</>
              : <>Is this the same person as <strong>{m.name}</strong> on your list?</>}</p>
            <div className="tr-cl-actions">
              <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => merge(c, m)}><GitMerge size={14} aria-hidden="true" /> Yes, merge</button>
              <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => notTheSame(c, m)}><X size={14} aria-hidden="true" /> Not the same</button>
            </div>
          </section>
        ))}

        {c.policies.slice().reverse().map(pol => <PolicyCard key={pol.appt.id} pol={pol} c={c} user={user} nameOf={nameOf} onChanged={load} />)}

        <AppointmentsCard c={c} user={user} intakeByAppt={intakeByAppt} onBook={() => onLogAppointment(bookingFor(c))}
          onLog={(a, presenter) => setOutcome({ appt: a, presenter })} />
        {!c.presented ? <LinksCard key={c.key} c={c} user={user} intakeByAppt={intakeByAppt} /> : null}

        <section className="tr-card tr-cl-card" aria-labelledby="cl-tl-h">
          <div className="tr-row-head">
            <h3 className="tr-cl-h" id="cl-tl-h">Everything so far</h3>
            {!c.presented && (c.appts.length || p) ? <button type="button" className="tr-link-btn" onClick={() => addNote(c)}>Add a note</button> : null}
          </div>
          {!c.presented && (c.appts.length || p) ? (
            <div className="tr-fu-quicktags tr-cl-quicktags" role="group" aria-label="Quick notes">
              {QUICK_NOTE_TAGS.map(tag => (
                <button key={tag} type="button" className="tr-pill-btn" disabled={noting} title={`Log "${tag}" with today's date`}
                  onClick={async () => { setNoting(true); await saveNote(c, tag); setNoting(false); }}>+ {tag}</button>
              ))}
            </div>
          ) : null}
          {c.timeline.length ? (
            <ol className="tr-cl-timeline">
              {c.timeline.map((t, i) => (
                <li key={`${t.at}-${i}`}>
                  <span className={`tr-cl-dot tr-cl-dot-${t.tone}`} aria-hidden="true" />
                  <div>
                    <strong>{t.title}</strong>
                    <span className="tr-cl-muted">{dayWord(t.at).replace(/^./, x => x.toUpperCase())}{t.detail ? ` · ${t.detail}` : ''}</span>
                    {t.act ? (
                      <button type="button" className="tr-link-btn" onClick={() => (t.act === 'change' ? openAppointment(t.appt) : setOutcome({ appt: t.appt, presenter: t.act === 'logPresented' }))}>
                        {t.act === 'change' ? 'Change' : 'Log outcome'}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : <p className="tr-empty">Nothing yet.</p>}
        </section>

        <section className="tr-card tr-cl-card" aria-labelledby="cl-about-h">
          <div className="tr-row-head">
            <h3 className="tr-cl-h" id="cl-about-h">About</h3>
            {p && !c.presented ? <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => { setFormError(''); setForm({ editing: p }); }}><Pencil size={13} aria-hidden="true" /> Edit details</button> : null}
          </div>
          <dl className="tr-cl-about">
            <dt>Phone</dt><dd>{c.phone || '—'}</dd>
            <dt>Email</dt><dd>{c.email || '—'}</dd>
            {p ? <><dt>Age</dt><dd>{p.age || '—'}</dd></> : null}
            {p ? <><dt>Relationship</dt><dd>{p.relationshipStrength ?? '—'} of 10{c.score ? ` · ${c.score} of 9 scored` : ' · not scored yet'}</dd></> : null}
            {p && (referrer || p.source) ? <><dt>{referrer ? 'Referred by' : 'Source'}</dt><dd>{referrer ? <button type="button" className="tr-link-btn tr-cl-inline" onClick={() => pick(referrer.key)}>{referrer.name}</button> : p.source}</dd></> : null}
            {p && p.createdAt ? <><dt>On your list</dt><dd>Since {dayWord(new Date(p.createdAt).getTime())}</dd></> : null}
            {c.presented ? <><dt>Booked by</dt><dd>{c.owner.name || '—'}</dd></> : null}
          </dl>
          {p && p.notes ? <p className="tr-cl-notes">{p.notes}</p> : null}
        </section>

        {p && !c.presented ? (
          <section className="tr-card tr-cl-card" aria-labelledby="cl-ref-h">
            <h3 className="tr-cl-h" id="cl-ref-h">Referrals</h3>
            {c.referrals.length ? (
              <>
                <p className="tr-cl-muted">People {first} sent you, and where they are now.</p>
                <ul className="tr-cl-refs">
                  {c.referrals.map(k => byKey.get(k)).filter(Boolean).map(r => (
                    <li key={r.key}><button type="button" onClick={() => pick(r.key)}><span>{r.name}</span><StageChip stage={r.stage} short /></button></li>
                  ))}
                </ul>
              </>
            ) : <p className="tr-cl-muted">No one yet. {c.stage === 'client' || c.stage === 'pending' ? 'Right after a sale is the best time to ask for 3 names.' : 'Happy clients are the best source of new names.'}</p>}
            <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => addReferrals(c)}><Plus size={14} aria-hidden="true" /> Add names {first} gave you</button>
          </section>
        ) : null}
        {modals}
      </div>
    );
  }

  // ---- everyone -----------------------------------------------------------
  const counts = filterCounts(clients);
  const shown = sortClients(clients.filter(c => inFilter(c, filter) && clientMatches(c, query)), sort);
  // Searching looks through everyone: "Not interested" and the people you
  // presented for your team too.
  const extra = query.trim() && filter === 'all' ? sortClients(clients.filter(c => !inFilter(c, 'all') && clientMatches(c, query)), sort) : [];
  const list = [...shown, ...extra];
  const chips = CLIENT_FILTERS.filter(f => f === 'all' || f === filter || counts[f] > 0);
  return (
    <div className="tr-clients">
      <div className="tr-row-head tr-screen-head">
        <TitleInfo title="Clients" info="Up top: your pipeline, from first name to results; tap a stage for that list. Below: everyone you've put on your list, booked, presented, sold or recruited, one profile each, with the next step on top. Stages set themselves from what you log; there's nothing to move by hand." />
        <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => { setFormError(''); setForm({ editing: null }); }}><Plus size={14} aria-hidden="true" /> Add a name</button>
      </div>
      {bar}
      {flashEl}
      <div className="tr-search-row tr-cl-search">
        <Search size={15} className="tr-search-icon" aria-hidden="true" />
        <input className="tr-search-input" type="search" placeholder="Find a client" aria-label="Find a client by name or phone" value={query} onChange={e => setQuery(e.target.value)} />
        {query ? <button type="button" className="tr-icon-btn" onClick={() => setQuery('')} aria-label="Clear search"><X size={15} /></button> : null}
      </div>
      <div className="tr-cl-filters" role="group" aria-label="Show">
        {chips.map(f => (
          <button key={f} type="button" className={`tr-cl-filter ${filter === f ? 'tr-cl-filter-on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {filterLabel(f)} <span className="tr-cl-count">{counts[f]}</span>
          </button>
        ))}
      </div>
      <div className="tr-cl-sortrow">
        <span className="tr-cl-muted">{list.length} {list.length === 1 ? 'person' : 'people'}</span>
        <label className="tr-cl-sort"><span className="tr-sr-only">Sort</span>
          <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort">
            <option value="next">Next step first</option>
            <option value="recent">Recent activity</option>
            <option value="name">Name A to Z</option>
          </select>
        </label>
      </div>
      {list.length === 0 ? (
        <div className="tr-card"><p className="tr-empty">{clients.length === 0 ? 'No one yet. Add a name, or book an appointment, and they show up here.' : query ? `No one matches “${query.trim()}”.` : 'No one here right now.'}</p></div>
      ) : (
        <ul className="tr-cl-list">
          {list.map(c => (
            <li key={c.key} className="tr-cl-item">
              <button type="button" className="tr-cl-row" onClick={() => pick(c.key)}>
                <Avatar c={c} />
                <span className="tr-cl-row-main">
                  <span className="tr-cl-row-top"><strong>{c.name}</strong><ForTag c={c} /><StageChip stage={c.stage} short /></span>
                  <span className="tr-cl-row-next">{c.presented ? <span className="tr-cl-for-inline">For {firstOf(c.owner.name) || 'your team'} · </span> : null}{c.next}{c.sub ? ` · ${c.sub}` : ''}</span>
                </span>
                <ChevronRight size={16} className="tr-cl-row-go" aria-hidden="true" />
              </button>
              {c.action ? (
                <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm tr-cl-row-act" onClick={() => act(c, c.action)} aria-label={`${c.action.label}: ${c.name}`}>
                  {c.action.kind === 'log' || c.action.kind === 'logPresented' ? <ListChecks size={14} aria-hidden="true" /> : c.action.kind === 'book' ? <CalendarPlus size={14} aria-hidden="true" /> : c.action.kind === 'policy' ? <Check size={14} aria-hidden="true" /> : null}
                  {c.action.label}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {modals}
    </div>
  );
}
