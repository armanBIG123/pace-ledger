// Today's checklist on Team → Overview: each day PaceLedger picks a leader's
// most important things to do for their team (promotions to review, team
// appointments they're on, exams, people gone quiet, new recruits, today's
// batch, wins to recognize). They check them off, and can add their own;
// their own unfinished tasks carry over to the next day.
import { useCallback, useEffect, useState } from 'react';
import { Award, CalendarDays, CalendarX, Check, ClipboardCheck, GraduationCap, PartyPopper, Plus, Rocket, TrendingUp, Video, X } from 'lucide-react';
import { examWhen } from '../../licensing.js';
import { dateSetMeta, WEEKLY_TOTAL_TARGET } from '../../lib/pace.js';
import { apptClock, parseDate, todayStr } from '../../lib/dates.js';
import { addOwnTask, deleteOwnTask, fetchChecklist, setOwnTaskDone, setSuggestedDone } from '../../data/checklist.js';
import { ProgressRing } from '../../components/ui.jsx';

const DAY = 864e5;
const firstName = name => (name || '').trim().split(/\s+/)[0] || '';
const mailto = (email, subject, body) => `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
const MAX_SUGGESTED = 8;

// Today's suggested tasks, most important first. Pure, so it's easy to
// check. `signals` comes from buildTeamOverview; `fieldToday` is today's team
// appointments the leader is presenting or training on.
export function buildDailyChecklist({ user, signals, teamSize, fieldToday = [] }) {
  const isAdmin = user.role === 'super_admin';
  const sign = `\n\n${user.displayName || ''}`;
  const items = [];
  // One task per person a day (the most important one), so the list covers
  // more of the team instead of piling onto one name.
  const seen = new Set();
  const fresh = p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; };
  const emailOr = (p, subject, body, fallback) => (p.email ? { label: 'Email', href: mailto(p.email, subject, `Hi ${firstName(p.display_name)},\n\n${body}${sign}`) } : fallback);

  signals.readyList.slice(0, 3).filter(x => fresh(x.member)).forEach(x => items.push({
    key: `promo:${x.member.id}:${x.progress.nextTier.key}`, Icon: Award, tone: 'brass',
    label: `Review ${x.member.display_name}'s promotion to ${x.progress.nextTier.name}`,
    title: <>Review <strong>{x.member.display_name}</strong>'s promotion to {x.progress.nextTier.name}</>,
    sub: 'Every requirement is met',
    action: { label: isAdmin ? 'Review & approve' : 'Review', go: 'teampromo', primary: true },
  }));

  if (fieldToday.length) {
    const a = fieldToday[0];
    const owner = signals.byId && signals.byId.get(a.userId);
    const n = fieldToday.length;
    items.push({
      key: 'field', Icon: Video, tone: 'blue',
      label: `Be on ${n} team appointment${n === 1 ? '' : 's'} today`,
      title: <>Be on <strong>{n}</strong> team appointment{n === 1 ? '' : 's'} today</>,
      sub: `First: ${apptClock(a)} · ${a.client}${owner ? ` (${firstName(owner.display_name)}'s ${a.traineeId === user.id ? 'appointment' : 'client'})` : ''}`,
      action: a.zoomUrl ? { label: 'Join', href: a.zoomUrl, external: true, primary: true } : { label: 'See Today', go: 'today' },
    });
  }

  const today = parseDate(todayStr()).getTime();
  signals.examsSoon.forEach(p => {
    const r = signals.lic.get(p.id).row;
    const days = Math.round((parseDate(r.exam_on).getTime() - today) / DAY);
    if (days > 3 || !fresh(p)) return;
    items.push({
      key: `exam:${p.id}:${r.exam_on}`, Icon: GraduationCap, tone: 'blue',
      label: `Wish ${p.display_name} luck on their licensing exam`,
      title: <>Wish <strong>{p.display_name}</strong> luck: licensing exam {examWhen(r.exam_on)}</>,
      sub: 'A quick message goes a long way',
      action: emailOr(p, 'Good luck on your exam', "Good luck on your licensing exam. You've got this!", { label: 'Licensing', go: 'licensing' }),
    });
  });

  signals.quiet.filter(fresh).slice(0, 2).forEach(p => items.push({
    key: `quiet:${p.id}`, Icon: CalendarX, tone: 'rust',
    label: `Check in with ${p.display_name}`,
    title: <>Check in with <strong>{p.display_name}</strong></>,
    sub: 'Nothing scheduled this week or last',
    action: emailOr(p, 'Checking in', "Haven't seen any appointments from you in a couple of weeks. Everything OK? Let's get a plan together.", { label: 'See pace', go: 'pace' }),
  }));

  signals.newBehind.filter(x => fresh(x.p)).slice(0, 2).forEach(({ p, day, next }) => items.push({
    key: `f30:${p.id}`, Icon: Rocket, tone: 'blue',
    label: `Coach ${p.display_name} on First 30 days`,
    title: <>Coach <strong>{p.display_name}</strong> on First 30 days</>,
    sub: `Day ${day}${next ? ` · next: ${next}` : " · hasn't started the checklist"}`,
    action: { label: 'Coach', go: 'pace' },
  }));

  if (teamSize > 0) {
    const meta = dateSetMeta(signals.todayOpt);
    const batch = signals.todayOpt === 'weekend' ? 'weekend' : meta.label;
    const notYet = teamSize - signals.batchStarted;
    items.push({
      key: `batch:${signals.todayOpt}`, Icon: CalendarDays, tone: notYet > 0 ? 'amber' : 'blue',
      label: `Push today's ${batch} batch`,
      title: notYet > 0
        ? <><strong>{notYet}</strong> of {teamSize} haven't scheduled any of today's {batch} batch</>
        : <>Everyone has started today's {batch} batch</>,
      sub: notYet > 0 ? `Remind them before the day ends: ${meta.target} each` : 'Help the ones closest to finishing it',
      action: { label: 'See pace', go: 'pace' },
    });
  }

  signals.stuck.filter(fresh).slice(0, 2).forEach(p => {
    const { st, row } = signals.lic.get(p.id);
    const last = row && row.updated_at ? row.updated_at : p.created_at;
    const idle = Math.floor((Date.now() - new Date(last).getTime()) / DAY);
    items.push({
      key: `stuck:${p.id}`, Icon: GraduationCap, tone: 'rust',
      label: `Help ${p.display_name} with licensing`,
      title: <>Help <strong>{p.display_name}</strong> with licensing</>,
      sub: `No progress in ${idle} days · next: ${st.next ? st.next.title.toLowerCase() : 'licensing'}`,
      action: emailOr(p, 'Checking in on licensing', "How's licensing going? Anything I can help with to get you to the next step?", { label: 'Licensing', go: 'licensing' }),
    });
  });

  if (signals.behindOnly.length) {
    const k = signals.behindOnly.length;
    items.push({
      key: 'behind', Icon: TrendingUp, tone: 'amber',
      label: `Talk to the ${k} behind pace`,
      title: <>Talk to the <strong>{k}</strong> {k === 1 ? 'person' : 'people'} behind pace</>,
      sub: signals.behindOnly.slice(0, 3).map(p => firstName(p.display_name)).join(', ') + (k > 3 ? ` and ${k - 3} more` : '') + ` · the standard is ${WEEKLY_TOTAL_TARGET} a week`,
      action: { label: 'See pace', go: 'pace' },
    });
  }

  // Always leave room for one win to recognize.
  const main = items.splice(0, items.length).slice(0, MAX_SUGGESTED - 1);
  items.push(...main);
  signals.wins.filter(w => w.person && w.what).slice(0, 1).forEach(w => items.push({
    key: `win:${w.key}`, Icon: PartyPopper, tone: 'green',
    label: `Recognize ${w.person.display_name}`,
    title: <>Recognize <strong>{w.person.display_name}</strong></>,
    sub: w.what.charAt(0).toUpperCase() + w.what.slice(1),
    action: w.person.email ? { label: 'Recognize', href: mailto(w.person.email, 'Congrats!', `Hi ${firstName(w.person.display_name)},\n\n${w.congrats}${sign}`) } : null,
  }));

  const list = items.slice(0, MAX_SUGGESTED);
  if (list.length < 3) list.push({
    key: 'habit:pace', Icon: TrendingUp, tone: 'blue',
    label: "Look over the week's pace with your team",
    title: <>Look over the week's pace with your team</>,
    sub: 'Who is close to 33, and who needs a hand',
    action: { label: 'See pace', go: 'pace' },
  });
  return list;
}

export function DailyChecklist({ user, items, onAct }) {
  const day = todayStr();
  const [rows, setRows] = useState(null); // saved rows (suggested checkmarks + your own tasks)
  const [saving, setSaving] = useState(true); // false when the database table isn't there yet
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const res = await fetchChecklist(user.id, day);
    setSaving(!res.missingTable);
    setRows(res.rows || []);
  }, [user.id, day]);
  useEffect(() => { load(); }, [load]);

  const doneKeys = new Set((rows || []).filter(r => !r.custom && r.day === day && r.done).map(r => r.item_key));
  const own = (rows || []).filter(r => r.custom);
  const total = items.length + own.length;
  const done = items.filter(it => doneKeys.has(it.key)).length + own.filter(r => r.done).length;

  async function toggleSuggested(it) {
    const next = !doneKeys.has(it.key);
    const before = rows;
    const local = { user_id: user.id, day, item_key: it.key, done: next, custom: false, done_at: next ? new Date().toISOString() : null };
    setRows(prev => [...(prev || []).filter(r => !(r.item_key === it.key && r.day === day)), local]);
    if (!saving) return;
    const res = await setSuggestedDone(user.id, day, it.key, next);
    if (!res.ok) { setRows(before); setErr("Couldn't save that. Check your connection and try again."); }
  }
  async function toggleOwn(r) {
    const next = !r.done;
    const before = rows;
    setRows(prev => prev.map(x => (x === r ? { ...x, done: next, done_at: next ? new Date().toISOString() : null } : x)));
    if (!saving || !r.id) return;
    const res = await setOwnTaskDone(r.id, next);
    if (!res.ok) { setRows(before); setErr("Couldn't save that. Check your connection and try again."); }
  }
  async function removeOwn(r) {
    const before = rows;
    setRows(prev => prev.filter(x => x !== r));
    if (!saving || !r.id) return;
    if (!(await deleteOwnTask(r.id))) { setRows(before); setErr("Couldn't remove that. Try again."); }
  }
  async function add(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setErr('');
    if (!saving) {
      setRows(prev => [...(prev || []), { item_key: `local:${Date.now()}`, label: text, custom: true, done: false, day }]);
      setDraft('');
      return;
    }
    setBusy(true);
    const res = await addOwnTask(user.id, day, text);
    setBusy(false);
    if (!res.ok) { setErr("Couldn't add that. Check your connection and try again."); return; }
    setRows(prev => [...(prev || []), res.row]);
    setDraft('');
  }

  const dateLabel = parseDate(day).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const shortDay = d => parseDate(d).toLocaleDateString('en-US', { weekday: 'short' });
  return (
    <section className="tr-card tr-tov-box tr-check" aria-labelledby="tr-check-title">
      <div className="tr-check-head">
        <div>
          <h3 id="tr-check-title"><ClipboardCheck size={17} /> Today's checklist</h3>
          <div className="tr-check-date">{dateLabel} · {total === 0 ? 'nothing yet' : done === total ? 'all done' : `${done} of ${total} done`}</div>
        </div>
        {rows ? (
          <ProgressRing done={done} total={Math.max(total, 1)} size={46} stroke={4.5}>
            {total > 0 && done === total ? <Check size={16} strokeWidth={3} /> : <><strong>{done}</strong><span>/{total}</span></>}
          </ProgressRing>
        ) : null}
      </div>
      <p className="tr-check-why">Picked fresh each morning from your team's promotions, licensing, pace and wins.</p>
      <ul className="tr-check-list">
        {items.map(it => {
          const isDone = doneKeys.has(it.key);
          return (
            <li key={it.key} className={isDone ? 'tr-check-done' : ''}>
              <button type="button" className="tr-check-box" role="checkbox" aria-checked={isDone} aria-label={it.label} onClick={() => toggleSuggested(it)} disabled={!rows}>
                {isDone ? <Check size={14} strokeWidth={3} /> : null}
              </button>
              <span className={`tr-needs-icon tr-needs-icon-${it.tone}`} aria-hidden="true"><it.Icon size={15} /></span>
              <div className="tr-tov-text"><div>{it.title}</div>{it.sub ? <div className="tr-tov-sub">{it.sub}</div> : null}</div>
              {!isDone && it.action ? (
                it.action.href
                  ? <a className={`tr-btn tr-btn-sm ${it.action.primary ? 'tr-btn-brass' : 'tr-btn-ghost'}`} href={it.action.href} {...(it.action.external ? { target: '_blank', rel: 'noreferrer' } : {})}>{it.action.label}</a>
                  : <button type="button" className={`tr-btn tr-btn-sm ${it.action.primary ? 'tr-btn-brass' : 'tr-btn-ghost'}`} onClick={() => onAct(it.action)}>{it.action.label}</button>
              ) : null}
            </li>
          );
        })}
        {own.map(r => (
          <li key={r.id || r.item_key} className={`tr-check-own ${r.done ? 'tr-check-done' : ''}`}>
            <button type="button" className="tr-check-box" role="checkbox" aria-checked={!!r.done} aria-label={r.label} onClick={() => toggleOwn(r)}>
              {r.done ? <Check size={14} strokeWidth={3} /> : null}
            </button>
            <span className="tr-needs-icon tr-needs-icon-ink" aria-hidden="true"><Plus size={15} /></span>
            <div className="tr-tov-text"><div>{r.label}</div>{r.day && r.day < day ? <div className="tr-tov-sub">Added {shortDay(r.day)}</div> : null}</div>
            <button type="button" className="tr-icon-btn" onClick={() => removeOwn(r)} aria-label={`Remove "${r.label}"`}><X size={15} /></button>
          </li>
        ))}
      </ul>
      <form className="tr-check-add" onSubmit={add}>
        <input value={draft} onChange={e => setDraft(e.target.value)} maxLength={200} placeholder="Add your own task for today…" aria-label="Add your own task for today" />
        <button type="submit" className="tr-btn tr-btn-ghost tr-btn-sm" disabled={busy || !draft.trim()}><Plus size={14} /> Add</button>
      </form>
      {err ? <div className="tr-error">{err}</div> : null}
      {!saving ? <p className="tr-check-note">Checkmarks aren't saved yet: the database update for this checklist hasn't been run.</p> : null}
    </section>
  );
}
