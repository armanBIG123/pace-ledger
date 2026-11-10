// Calendar: month and list views, trainings and manager availability.
import { useCallback, useEffect, useState } from 'react';
import { Ban, CalendarClock, CalendarDays, ChevronLeft, ChevronRight, GraduationCap, Pencil, Plus, Settings, Trash2, X } from 'lucide-react';
import { isNativeApp } from '../native.js';
import { deleteScheduleBlock, deleteScheduleBlockSeries, fetchScheduleBlocksInRange } from '../schedule.js';
import { addDays, apptEndClock, apptLocalDate, buildMonthGrid, fmtApptDateTime, fmtDate, fmtDisplayDate, fmtTime, monthStartOf, parseDate, shiftMonth, todayStr, trainingEndClock, trainingLocalDate, trainingLocalTimeKey } from '../lib/dates.js';
import { fetchAppointmentsInRange, isRecruitType, isSaleType, typeLabel } from '../data/appointments.js';
import { deleteTraining, deleteTrainingSeries, fetchTrainingsInRange } from '../data/trainings.js';
import { fetchTeamMembers, seesTeam } from '../data/team.js';
import { fetchGoogleConnectionStatus, fetchGoogleEvents, googleEventTimeKey } from '../data/integrations.js';
import { Modal, MoreMenu, PageHead, SkeletonCalendar, useIsPhone } from '../components/ui.jsx';
import { useLive } from '../data/live.js';
import { applyAppointmentEdit, openAppointment, useAppointmentEdits } from '../components/appointmentPanel.jsx';
import { isAdmin } from '../lib/roles.js';
import { askChoice, askConfirm, undoable } from '../components/confirm.jsx';
import { ConnectionsSheet, startGoogleConnect } from '../components/connections.jsx';
import { PresentingHoursCard } from '../components/presentingHours.jsx';
import { fetchMyPresentingHours } from '../data/availability.js';
import { CalendarDay, CalendarItemInfo, calendarItems } from './calendar/CalendarDay.jsx';
import { SchedulePostCard } from './calendar/SchedulePostCard.jsx';
import { TrainingPostCard } from './calendar/TrainingPostCard.jsx';

const EMPTY_MONTH = { appts: [], google: { connected: false }, events: [], trainings: [], blocks: [], members: [] };

export function CalendarBody({ user, onLogAppointment, intent = null, onIntentConsumed }) {
  const isPhone = useIsPhone();
  const [monthStartStr, setMonthStartStr] = useState(monthStartOf(todayStr()));
  // The month grid gets cramped on a phone, so phones start on the list.
  const [calView, setCalView] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 'agenda' : 'month'));
  // The day window: { date }. What's in it comes from the lists below, so a
  // delete or an edit shows right away.
  const [dayModal, setDayModal] = useState(null);
  // A training or blocked-out time opened on its own: { kind, data }.
  const [infoItem, setInfoItem] = useState(null);
  // Which form is open under the heading: 'training', 'block' or null.
  const [posting, setPosting] = useState(null);
  // A training being changed (super admins and Super Managers).
  const [editingTraining, setEditingTraining] = useState(null);
  const [googleConnecting, setGoogleConnecting] = useState(false);
  const [highlightTrainings, setHighlightTrainings] = useState(false);
  // Presenting hours (leaders): whether you've set any, for the nudge, and
  // the line shown once you save them.
  const presents = seesTeam(user) || isAdmin(user);
  const [hoursSet, setHoursSet] = useState(null); // null: not known yet
  const [hoursNote, setHoursNote] = useState('');
  const [nudgeHidden, setNudgeHidden] = useState(() => { try { return localStorage.getItem(`pl-hours-nudge-${user.id}`) === 'hidden'; } catch { return false; } });
  const [googleHintHidden, setGoogleHintHidden] = useState(() => { try { return localStorage.getItem(`pl-google-hint-${user.id}`) === 'hidden'; } catch { return false; } });
  // Calendar settings: Google Calendar, Zoom and presenting hours.
  const [connOpen, setConnOpen] = useState(false);
  const checkHours = useCallback(() => {
    if (!presents) return;
    fetchMyPresentingHours(user.id).then(r => setHoursSet(r.unavailable || r.error ? null : r.saved && r.hours.length > 0));
  }, [user.id, presents]);
  useEffect(() => { checkHours(); }, [checkHours]);
  function hideNudge() {
    setNudgeHidden(true);
    try { localStorage.setItem(`pl-hours-nudge-${user.id}`, 'hidden'); } catch { /* private window */ }
  }
  function hideGoogleHint() {
    setGoogleHintHidden(true);
    try { localStorage.setItem(`pl-google-hint-${user.id}`, 'hidden'); } catch { /* private window */ }
  }
  // Opened from the account menu's "Presenting hours".
  useEffect(() => {
    if (intent === 'hours' && presents) { setHoursNote(''); setPosting('hours'); }
    if (intent && onIntentConsumed) onIntentConsumed();
  }, [intent]); // eslint-disable-line react-hooks/exhaustive-deps
  // 'all' | 'mine' | a specific person's userId — only meaningful for
  // managers/admins, who see more than just their own appointments here.
  const [personFilter, setPersonFilter] = useState('all');

  const cells = buildMonthGrid(monthStartStr);
  const rangeStart = cells[0].date;
  const rangeEnd = cells[cells.length - 1].date;

  // Everything on the month, kept fresh by the shared data layer: it also
  // reloads after an appointment is saved anywhere, and when Google or Zoom
  // is connected or disconnected.
  const live = useLive(['calendar', user.id, user.role, !!user.isLeader, rangeStart, rangeEnd], async () => {
    // One extra day each side: appointments are placed by your local date,
    // which can differ by a day from the stored date across timezones.
    const tasks = [fetchAppointmentsInRange(fmtDate(addDays(parseDate(rangeStart), -1)), fmtDate(addDays(parseDate(rangeEnd), 1))), fetchGoogleConnectionStatus(), fetchTrainingsInRange(rangeStart, rangeEnd), fetchScheduleBlocksInRange(rangeStart, rangeEnd)];
    if (seesTeam(user)) tasks.push(fetchTeamMembers(user));
    const [appts, status, trainings, blocks, members] = await Promise.all(tasks);
    let google = status;
    let events = [];
    if (status.connected) {
      const g = await fetchGoogleEvents(rangeStart, rangeEnd);
      events = g.events || [];
      if (g.connected === false) google = { connected: false }; // token was revoked server-side
    }
    return { appts, google, events, trainings, blocks, members: members || [] };
  }, { topics: ['appointments', 'connections', 'trainings'] });
  const { appts, google: googleStatus, events: googleEvents, trainings, blocks: scheduleBlocks, members } = live.data || EMPTY_MONTH;
  const loading = live.loading;
  const patch = field => fn => live.set(d => (d ? { ...d, [field]: typeof fn === 'function' ? fn(d[field]) : fn } : d));
  const setAppts = patch('appts');
  const setTrainings = patch('trainings');
  const setScheduleBlocks = patch('blocks');
  const refresh = live.reload;
  // An appointment opened from here was saved, moved or deleted.
  useAppointmentEdits(change => {
    if (change.reload) live.reload();
    else setAppts(prev => applyAppointmentEdit(prev, change));
  });
  function openAppt(a) { setDayModal(null); openAppointment(a); }

  async function handleConnect() {
    if (!isNativeApp()) setGoogleConnecting(true);
    await startGoogleConnect(user, refresh);
  }
  // Removing a training or a blocked-out time: one date or, for a weekly
  // series, this date and every later one. It disappears right away with
  // Undo; the database delete happens a few seconds later.
  async function removeFromCalendar({ item, dateOf, setList, title, deleteOne, deleteSeries, noun }) {
    const day = fmtDisplayDate(dateOf(item));
    let scope = 'one';
    if (item.recurring_group_id) {
      scope = await askChoice({
        title,
        body: 'It repeats every week.',
        choices: [
          { value: 'one', label: `Just ${day}`, sub: 'The other weeks stay.', danger: true },
          { value: 'series', label: `${day} and every week after`, sub: 'Earlier weeks stay as history.', danger: true },
        ],
      });
      if (!scope) return false;
    } else if (!(await askConfirm({ title, body: day, confirmLabel: 'Remove', danger: true }))) {
      return false;
    }
    const gone = scope === 'series'
      ? x => x.recurring_group_id === item.recurring_group_id && dateOf(x) >= dateOf(item)
      : x => x.id === item.id;
    let removed = [];
    undoable({
      text: scope === 'series' ? `${noun} removed from ${day} on` : `${noun} removed`,
      apply: () => setList(prev => { removed = prev.filter(gone); return prev.filter(x => !gone(x)); }),
      revert: () => setList(prev => [...prev.filter(x => !removed.some(r => r.id === x.id)), ...removed]),
      commit: () => (scope === 'series' ? deleteSeries(item.recurring_group_id, dateOf(item)) : deleteOne(item.id)),
      failText: `Couldn't remove the ${noun.toLowerCase()}. Check your connection and try again. It's been put back.`,
    });
    return true;
  }
  function handleDeleteTraining(training) {
    return removeFromCalendar({
      item: training, dateOf: t => t.training_date, setList: setTrainings, noun: 'Training',
      title: `Remove "${training.title}" for everyone?`, deleteOne: deleteTraining, deleteSeries: deleteTrainingSeries,
    });
  }
  function handleDeleteScheduleBlock(block) {
    return removeFromCalendar({
      item: block, dateOf: b => b.block_date, setList: setScheduleBlocks, noun: 'Blocked time',
      title: block.user_id === user.id ? 'Remove this blocked-out time?' : `Remove ${block.user_name || 'their'}${block.user_name ? '’s' : ''} blocked-out time?`,
      deleteOne: deleteScheduleBlock, deleteSeries: deleteScheduleBlockSeries,
    });
  }

  function apptsForDay(dateStr) {
    let list = appts.filter(a => apptLocalDate(a) === dateStr);
    if (personFilter === 'mine') list = list.filter(a => a.userId === user.id);
    else if (personFilter !== 'all') list = list.filter(a => a.userId === personFilter);
    return list;
  }
  function googleForDay(dateStr) {
    if (personFilter !== 'all' && personFilter !== 'mine') return []; // Google events are always mine, not theirs
    return googleEvents.filter(e => (e.start || '').slice(0, 10) === dateStr);
  }
  function trainingsForDay(dateStr) { return trainings.filter(t => trainingLocalDate(t) === dateStr); }
  function scheduleBlocksForDay(dateStr) { return scheduleBlocks.filter(b => b.block_date === dateStr); }
  function ownerName(userId) {
    if (!seesTeam(user)) return '';
    if (userId === user.id) return user.displayName;
    const m = members.find(mm => mm.id === userId);
    return m ? m.display_name : '';
  }

  const monthLabel = parseDate(monthStartStr).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const monthShort = parseDate(monthStartStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  return (
    <>
      {/* Posting a training and blocking out time are buttons up here; their
          forms open under the heading only when you use them, so the month
          isn't pushed down the page. */}
      <PageHead className="tr-cal-head" title="Calendar" sub="Your appointments, team trainings and Google events in one place.">
        {isAdmin(user) ? (
          <button type="button" className={`tr-btn tr-btn-sm ${posting === 'training' ? 'tr-btn-brass' : 'tr-btn-ghost'}`} aria-expanded={posting === 'training'} onClick={() => setPosting(p => (p === 'training' ? null : 'training'))}>
            <GraduationCap size={14} aria-hidden="true" /> New training
          </button>
        ) : null}
        {user.role === 'manager' || isAdmin(user) ? (
          <button type="button" className={`tr-btn tr-btn-sm ${posting === 'block' ? 'tr-btn-brass' : 'tr-btn-ghost'}`} aria-expanded={posting === 'block'} onClick={() => setPosting(p => (p === 'block' ? null : 'block'))}>
            <Ban size={14} aria-hidden="true" /> Block out time
          </button>
        ) : null}
        <button type="button" className={`tr-btn tr-btn-sm tr-btn-ghost tr-cal-settings ${connOpen || posting === 'hours' ? 'tr-btn-brass' : ''}`} onClick={() => setConnOpen(true)}
          aria-label={`Calendar settings${!loading && !googleStatus.connected ? ' (Google Calendar isn’t connected)' : ''}`}>
          <Settings size={14} aria-hidden="true" /> <span className="tr-cal-settings-long">Calendar settings</span><span className="tr-cal-settings-short">Settings</span>
          {!loading && (!googleStatus.connected || (presents && hoursSet === false)) ? <span className="tr-cal-settings-dot" aria-hidden="true" /> : null}
        </button>
      </PageHead>
      {posting === 'training' && isAdmin(user) ? <TrainingPostCard user={user} onClose={() => setPosting(null)} onPosted={t => setTrainings(prev => [...prev, t])} /> : null}
      {posting === 'block' && (user.role === 'manager' || isAdmin(user)) ? <SchedulePostCard user={user} onClose={() => setPosting(null)} onPosted={b => setScheduleBlocks(prev => [...prev, b])} /> : null}
      {posting === 'hours' && presents ? (
        <PresentingHoursCard user={user} googleConnected={!!googleStatus.connected} onClose={() => setPosting(null)}
          onSaved={({ settings, hours }) => {
            setPosting(null);
            setHoursSet(hours.length > 0);
            setHoursNote(!hours.length ? 'Availability cleared. Your team picks times by hand.'
              : settings.accepting ? 'Availability saved. Your team sees your open times when they log an appointment with you.'
                : 'Saved. Your team is told you’re not accepting new appointments right now.');
          }} />
      ) : null}
      {hoursNote && posting !== 'hours' ? (
        <div className="tr-card tr-ph-saved" role="status">
          <CalendarClock size={16} aria-hidden="true" />
          <span>{hoursNote}</span>
          <button type="button" className="tr-icon-btn" aria-label="Dismiss" onClick={() => setHoursNote('')}><X size={16} /></button>
        </div>
      ) : null}
      {/* One line at most: schedule availability for anyone who presents and
          hasn't set them, otherwise Google Calendar if it isn't connected.
          Both live in Calendar settings too. */}
      {presents && hoursSet === false && !nudgeHidden && posting !== 'hours' && !hoursNote ? (
        <div className="tr-cal-hint">
          <CalendarClock size={16} aria-hidden="true" />
          <span className="tr-cal-hint-text"><strong>Let your team book appointments with you.</strong> <span className="tr-cal-hint-more">Set your availability and they see your open times.</span></span>
          <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={() => { setHoursNote(''); setPosting('hours'); }}>Set availability</button>
          <button type="button" className="tr-icon-btn" aria-label="Not now" title="Not now" onClick={hideNudge}><X size={15} /></button>
        </div>
      ) : !loading && !googleStatus.connected && !googleHintHidden && posting !== 'hours' && !hoursNote ? (
        <div className="tr-cal-hint">
          <CalendarDays size={16} aria-hidden="true" />
          <span className="tr-cal-hint-text"><strong>See your Google events here.</strong> <span className="tr-cal-hint-more">Connect Google Calendar, and appointments you log go on it too.</span></span>
          <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={handleConnect} disabled={googleConnecting}>{googleConnecting ? 'Opening…' : 'Connect'}</button>
          <button type="button" className="tr-icon-btn" aria-label="Not now" title="Not now" onClick={hideGoogleHint}><X size={15} /></button>
        </div>
      ) : null}
      {connOpen ? <ConnectionsSheet user={user} onClose={() => setConnOpen(false)} onEditHours={presents ? () => { setHoursNote(''); setPosting('hours'); } : null} /> : null}
      {/* Month / List and ‹ month › stay together on one line; the rest
          wraps under them on a phone. */}
      <div className="tr-weeknav tr-cal-toolbar">
        <div className="tr-seg" role="group" aria-label="Calendar view">
          <button type="button" className={calView === 'month' ? 'tr-seg-on' : ''} onClick={() => setCalView('month')}>Month</button>
          <button type="button" className={calView === 'agenda' ? 'tr-seg-on' : ''} onClick={() => setCalView('agenda')}>List</button>
        </div>
        <div className="tr-monthnav">
          <button type="button" className="tr-icon-btn" onClick={() => setMonthStartStr(shiftMonth(monthStartStr, -1))} title="Previous month" aria-label="Previous month"><ChevronLeft size={18} /></button>
          <div className="tr-weeknav-label"><CalendarDays size={16} aria-hidden="true" /><span className="tr-weeknav-long">{monthLabel}</span><span className="tr-weeknav-short" aria-hidden="true">{monthShort}</span></div>
          <button type="button" className="tr-icon-btn" onClick={() => setMonthStartStr(shiftMonth(monthStartStr, 1))} title="Next month" aria-label="Next month"><ChevronRight size={18} /></button>
        </div>
        {/* On a phone the less-used tools fold into ⋯ beside the month. */}
        <span className="tr-cal-more">
          <MoreMenu label="More calendar options" items={[
            { label: 'Go to this month', onClick: () => setMonthStartStr(monthStartOf(todayStr())), disabled: monthStartStr === monthStartOf(todayStr()) },
            { label: highlightTrainings ? 'Stop highlighting trainings' : 'Highlight trainings', onClick: () => setHighlightTrainings(v => !v) },
          ]} />
        </span>
        <div className="tr-cal-tools">
          <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => setMonthStartStr(monthStartOf(todayStr()))} disabled={monthStartStr === monthStartOf(todayStr())}>This month</button>
          <button
            type="button" className={`tr-btn tr-btn-sm ${highlightTrainings ? 'tr-btn-brass' : 'tr-btn-ghost'}`} aria-pressed={highlightTrainings}
            onClick={() => setHighlightTrainings(v => !v)} title="Highlight days with trainings">
            <GraduationCap size={14} aria-hidden="true" /> Trainings
          </button>
          {seesTeam(user) && (
            <select className="tr-cal-personfilter" value={personFilter} onChange={e => setPersonFilter(e.target.value)} aria-label="Whose appointments to show">
              <option value="all">Everyone</option>
              <option value="mine">Just me</option>
              {members.filter(m => m.id !== user.id).map(m => (
                <option key={m.id} value={m.id}>{m.display_name}</option>
              ))}
            </select>
          )}
        </div>
      </div>
      {loading ? <SkeletonCalendar /> : calView === 'agenda' ? (() => {
        // List view: every day in this month that has something on it,
        // starting from today when you're looking at the current month.
        const today = todayStr();
        const monthEnd = fmtDate(addDays(parseDate(shiftMonth(monthStartStr, 1)), -1));
        const fromDate = today > monthStartStr && today <= monthEnd ? today : monthStartStr;
        const days = cells.filter(c => c.inMonth && c.date >= fromDate).map(c => {
          const dayAppts = apptsForDay(c.date), dayGoogle = googleForDay(c.date), dayTrainings = trainingsForDay(c.date), dayBlocks = scheduleBlocksForDay(c.date);
          return { date: c.date, dayAppts, dayGoogle, dayTrainings, dayBlocks, items: calendarItems(dayAppts, dayGoogle, dayTrainings, dayBlocks) };
        }).filter(d => d.items.length > 0);
        return (
          <div className="tr-card tr-agenda">
            {days.length === 0 ? <p className="tr-empty" style={{ margin: 0 }}>Nothing on the calendar {fromDate === today ? 'for the rest of this month' : 'this month'}.</p> : days.map(d => (
              <div key={d.date} className={`tr-agenda-day ${d.date === today ? 'tr-agenda-today' : ''}`}>
                <button type="button" className="tr-agenda-date" onClick={() => setDayModal({ date: d.date })}>
                  {d.date === today ? 'Today' : fmtDisplayDate(d.date)}
                </button>
                {d.items.map(item => {
                  const a = item.data;
                  const time = (
                    <span className="tr-agenda-time">
                      {item.kind === 'google' && a.allDay ? 'All day' : fmtTime(item.timeKey)}
                      {item.kind === 'appt' ? <span className="tr-time-end">to {apptEndClock(a)}</span> : null}
                      {item.kind === 'block' && a.end_time ? <span className="tr-time-end">to {fmtTime(a.end_time.slice(0, 5))}</span> : null}
                      {item.kind === 'training' ? <span className="tr-time-end">to {trainingEndClock(a)}</span> : null}
                    </span>
                  );
                  return (
                    <div key={`${item.kind}-${a.id}`} className={`tr-agenda-item tr-agenda-${item.kind} ${item.kind === 'appt' ? (isRecruitType(a) && !isSaleType(a) ? 'tr-agenda-recruit' : 'tr-agenda-sale') : ''}`}>
                      {item.kind === 'appt' ? (
                        // Tap it to open it: edit yours, see the details of anyone else's.
                        <button type="button" className="tr-agenda-open" onClick={() => openAppt(a)}>
                          {time}
                          <span className="tr-agenda-what">
                            <strong>{a.client}</strong>{typeLabel(a) ? ` · ${typeLabel(a)}` : ''}{ownerName(a.userId) && a.userId !== user.id ? ` · ${ownerName(a.userId)}` : ''}
                          </span>
                        </button>
                      ) : item.kind === 'google' ? (
                        // Google events open in Google Calendar.
                        a.htmlLink ? (
                          <a className="tr-agenda-open" href={a.htmlLink} target="_blank" rel="noopener noreferrer" title="Open in Google Calendar">
                            {time}
                            <span className="tr-agenda-what">{a.title} <span className="tr-empty">· Google</span></span>
                          </a>
                        ) : (
                          <>{time}<span className="tr-agenda-what">{a.title} <span className="tr-empty">· Google</span></span></>
                        )
                      ) : (
                        // Trainings and blocked-out times open their details.
                        <button type="button" className="tr-agenda-open" onClick={() => setInfoItem({ kind: item.kind, data: a })}>
                          {time}
                          <span className="tr-agenda-what">
                            {item.kind === 'training' && <><GraduationCap size={12} /> <strong>{a.title}</strong> · Training</>}
                            {item.kind === 'block' && <><Ban size={12} /> {a.user_name || 'Someone'} unavailable{a.label ? ` — ${a.label}` : ''}</>}
                          </span>
                        </button>
                      )}
                      {(a.zoomUrl || a.zoom_url) && <a className="tr-btn tr-btn-ghost tr-btn-sm" href={a.zoomUrl || a.zoom_url} target="_blank" rel="noopener noreferrer">Join Zoom</a>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })() : (
        <div className="tr-card tr-cal-card">
          <div className="tr-cal-grid">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className="tr-cal-headcell">{d}</div>)}
            {cells.map(cell => (
              <CalendarDay
                key={cell.date} cell={cell} appts={apptsForDay(cell.date)} googleEvents={googleForDay(cell.date)} trainings={trainingsForDay(cell.date)}
                scheduleBlocks={scheduleBlocksForDay(cell.date)}
                highlightTrainings={highlightTrainings}
                canOpen={!isPhone}
                onOpen={date => setDayModal({ date })} onOpenItem={setInfoItem} />
            ))}
          </div>
        </div>
      )}
      <div className="tr-cal-legend">
        <span><i className="tr-lg tr-lg-sale" /> Sale</span>
        <span><i className="tr-lg tr-lg-recruit" /> Recruit</span>
        <span><i className="tr-lg tr-lg-training" /> Training</span>
        <span><i className="tr-lg tr-lg-block" /> Unavailable</span>
        {googleStatus.connected && <span><i className="tr-lg tr-lg-google" /> Google</span>}
        <span className="tr-cal-legend-hint">Open an appointment to see or change it, or a day to see everything on it{onLogAppointment ? ' and book one' : ''}.</span>
      </div>
      {dayModal && (() => {
        const day = { appts: apptsForDay(dayModal.date), googleEvents: googleForDay(dayModal.date), trainings: trainingsForDay(dayModal.date), blocks: scheduleBlocksForDay(dayModal.date) };
        return (
        <Modal onClose={() => setDayModal(null)}>
          <div className="tr-row-head">
            <h3 className="tr-h3" style={{ margin: 0 }}>{fmtDisplayDate(dayModal.date)}</h3>
            {onLogAppointment && dayModal.date >= todayStr() && (
              <button type="button" className="tr-btn tr-btn-brass tr-btn-sm" onClick={() => { const date = dayModal.date; setDayModal(null); onLogAppointment({ appointmentDate: date }); }}>
                <Plus size={14} /> Log appointment this day
              </button>
            )}
          </div>
          {day.appts.length + day.trainings.length + day.blocks.length + day.googleEvents.length === 0 && (
            <p className="tr-empty">Nothing scheduled.</p>
          )}
          <div className="tr-notes-list" style={{ maxHeight: '60vh', marginTop: 12 }}>
            {day.trainings.map(t => (
              <div key={t.id} className="tr-note-item tr-note-item-training">
                <div className="tr-note-meta"><GraduationCap size={12} /> {fmtTime(trainingLocalTimeKey(t))} – {trainingEndClock(t)} · Training{t.recurring_group_id ? ' · Weekly' : ''}</div>
                <div><strong>{t.title}</strong></div>
                {t.zoom_url && <div><a href={t.zoom_url} target="_blank" rel="noopener noreferrer" className="tr-note tr-link">Join Zoom</a></div>}
                {t.notes && <div className="tr-note">{t.notes}</div>}
                <div className="tr-note">Posted by {t.created_by_name}</div>
                {isAdmin(user) && (
                  <div className="tr-training-acts">
                    <button type="button" className="tr-icon-btn" onClick={() => { setDayModal(null); setEditingTraining(t); }} title="Change time or details" aria-label={`Change ${t.title}`}><Pencil size={13} /></button>
                    <button type="button" className="tr-icon-btn" onClick={() => handleDeleteTraining(t)} title="Remove training" aria-label={`Remove ${t.title}`}><Trash2 size={13} /></button>
                  </div>
                )}
              </div>
            ))}
            {day.blocks.map(b => (
              <div key={b.id} className="tr-note-item tr-note-item-unavailable">
                <div className="tr-note-meta"><Ban size={12} /> {fmtTime(b.start_time.slice(0, 5))}–{fmtTime(b.end_time.slice(0, 5))} · Unavailable{b.recurring_group_id ? ' · Weekly' : ''}</div>
                <div><strong>{b.user_name || 'Someone'}</strong>{b.label ? ` — ${b.label}` : ''}</div>
                {(user.id === b.user_id || isAdmin(user)) && (
                  <button type="button" className="tr-icon-btn" style={{ marginTop: 4 }} onClick={() => handleDeleteScheduleBlock(b)} title="Remove blocked time"><Trash2 size={13} /></button>
                )}
              </div>
            ))}
            {day.appts.map(a => (
              <div key={a.id} className="tr-note-item tr-note-item-appt">
                <button type="button" className="tr-note-open" onClick={() => openAppt(a)}>
                  <span className="tr-note-meta">
                    {fmtApptDateTime(a)}
                    {typeLabel(a) ? ` · ${typeLabel(a)}` : ''}
                    {a.isFollowUp ? ' · Follow-up' : ''}
                  </span>
                  <span className="tr-note-open-line"><strong>{a.client}</strong> — {a.presenter}{a.trainee ? ` (training ${a.trainee})` : ''}</span>
                  {ownerName(a.userId) && <span className="tr-note">Logged by {ownerName(a.userId)}</span>}
                  {a.notes && <span className="tr-note">{a.notes}</span>}
                  <span className="tr-note-open-hint">{a.userId === user.id ? 'Edit' : 'Details'}</span>
                </button>
                {a.zoomUrl && <div><a href={a.zoomUrl} target="_blank" rel="noopener noreferrer" className="tr-note tr-link">Join Zoom</a></div>}
              </div>
            ))}
            {day.googleEvents.map(e => (
              <div key={e.id} className="tr-note-item tr-note-item-google">
                <div className="tr-note-meta">{e.allDay ? 'All day' : fmtTime(googleEventTimeKey(e))} · Google Calendar</div>
                <div><strong>{e.title}</strong></div>
                {e.htmlLink ? <div><a href={e.htmlLink} target="_blank" rel="noopener noreferrer" className="tr-note tr-link">Open in Google Calendar</a></div> : null}
              </div>
            ))}
          </div>
        </Modal>
        );
      })()}
      {infoItem && (
        <CalendarItemInfo item={infoItem} user={user} onClose={() => setInfoItem(null)}
          onEdit={infoItem.kind === 'training' ? () => { const t = infoItem.data; setInfoItem(null); setEditingTraining(t); } : null}
          onDelete={async () => {
            const ok = infoItem.kind === 'training' ? await handleDeleteTraining(infoItem.data) : await handleDeleteScheduleBlock(infoItem.data);
            if (ok) setInfoItem(null);
          }} />
      )}
      {editingTraining && isAdmin(user) ? (
        <Modal onClose={() => setEditingTraining(null)} labelledBy="tr-training-edit-title" className="tr-training-edit-modal">
          <TrainingPostCard user={user} editing={editingTraining} onClose={() => setEditingTraining(null)}
            onSaved={message => { setEditingTraining(null); setPosting(null); setHoursNote(message); live.reload(); }} />
        </Modal>
      ) : null}
    </>
  );
}
