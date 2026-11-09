// My Appointments (Pipeline → Appointments): the week's batches, search and
// outcomes. Section "booked" shows just the week and the form; past ones by
// status live in Pipeline → Log outcome, and Submitted / Issued Premium in
// Pipeline → Won. The form, the list groups and Submitted Premium are in
// ./appointments/.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Plus, Search, X } from 'lucide-react';
import { isNativeApp } from '../native.js';
import { DATE_SET_OPTIONS } from '../lib/pace.js';
import { addMinutesToDateTime, addMinutesToTime, apptEndMs, apptStartMs, fmtApptDateTime, shiftWeekStr, todayStr, weekStartOf } from '../lib/dates.js';
import { downloadCSV } from '../lib/format.js';
import { applyFollowUpToList, fetchAppointmentsImPresenting, fetchMyAppointments, insertAppointment, inviteFailureMessage, isPastAppointment, isRecruitType, isSaleType, ISSUED_PREMIUM_VIEW, markInviteSent, persistFollowUp, SOLD_PREMIUM_VIEW, STATUS_OPTIONS, typeLabel, upsertAppointment } from '../data/appointments.js';
import { useLive } from '../data/live.js';
import { createZoomMeeting, fetchZoomConnectionStatus, pushAppointmentToGoogleCalendar, sendAppointmentInviteEmail, startZoomConnect, updateAppointmentZoomUrl } from '../data/integrations.js';
import { PageHead, SkeletonRows, TypeFilter, useIsPhone, WeekNav } from '../components/ui.jsx';
import { MyCoachingNotes, PaceStrip, PaceTrend, PersonalBests } from '../components/pace.jsx';
import { ZoomNudge } from '../components/integrations.jsx';
import { FollowUpModal } from '../components/followUpModal.jsx';
import { applyAppointmentEdit, deleteAppointmentWithUndo, openAppointment, useAppointmentEdits } from '../components/appointmentPanel.jsx';
import { sendIntakeAfterBooking } from '../components/intakePanel.jsx';
import { AppointmentForm, addToListFirst } from './appointments/AppointmentForm.jsx';
import { ApptGroup } from './appointments/ApptGroup.jsx';
import { OpenRequirementsBody } from './appointments/SubmittedPremium.jsx';

const NONE = [];
const NO_ZOOM = { connected: false };

export function MyAppointmentsBody({ user, prefillData, onPrefillConsumed, initialIntent, onIntentConsumed, cameFrom = null, onReturn, section = null }) {
  const isPhone = useIsPhone();
  // Yours, the ones someone else set that you're presenting (they count
  // toward your pace), and whether your Zoom is connected.
  const live = useLive(['my-appointments', user.id], async () => {
    const [list, zoom, presenting] = await Promise.all([fetchMyAppointments(user.id), fetchZoomConnectionStatus(), fetchAppointmentsImPresenting(user.id).catch(() => [])]);
    return { list, zoom, presenting };
  }, { topics: ['appointments', 'connections'] });
  const appointments = live.data ? live.data.list : NONE;
  const presenting = live.data ? live.data.presenting : NONE;
  const zoomStatus = live.data ? live.data.zoom : NO_ZOOM;
  const loading = live.loading;
  const setAppointments = fn => live.set(d => (d ? { ...d, list: fn(d.list) } : d));
  const setZoomStatus = z => live.set(d => (d ? { ...d, zoom: z } : d));
  const refresh = live.reload;
  const [weekMonday, setWeekMonday] = useState(weekStartOf(todayStr()));
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [followUpTarget, setFollowUpTarget] = useState(null);
  const [followUpSaving, setFollowUpSaving] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'recruit' | 'sale'
  const [zoomConnecting, setZoomConnecting] = useState(false);
  // null = the normal "This week" view; otherwise one of STATUS_OPTIONS.value
  // (including '' for "No status") — a real sub-page, not a nested widget.
  const [statusView, setStatusView] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingPrefillData, setPendingPrefillData] = useState(null);

  // Arriving here from a prospect's "Log appointment" button — jump
  // straight to the weekly view with the log form open, pre-filled with
  // the prospect's name, notes, and recruit/sale leaning. The data is
  // captured into local state immediately, since the parent clears its
  // own copy right after handing it off — AppointmentForm reads from
  // this local copy instead, which isn't affected by that.
  const fromElsewhere = useRef(false);
  useEffect(() => {
    if (prefillData) {
      fromElsewhere.current = !!cameFrom;
      setStatusView(null);
      setPendingPrefillData(prefillData);
      setShowForm(true);
      onPrefillConsumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillData]);

  // Arriving from search: show that client's appointments.
  useEffect(() => {
    if (!initialIntent) return;
    if (typeof initialIntent === 'object' && initialIntent.search) {
      setStatusView(null);
      setShowForm(false);
      setSearchQuery(initialIntent.search);
    }
    if (onIntentConsumed) onIntentConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIntent]);

  const searchDigits = searchQuery.replace(/\D/g, '');
  const searchResults = searchQuery.trim()
    ? appointments
        .filter(a => a.client.toLowerCase().includes(searchQuery.trim().toLowerCase())
          || (searchDigits.length >= 3 && (a.clientPhone || '').replace(/\D/g, '').includes(searchDigits)))
        .sort((a, b) => (b.appointmentDate + b.appointmentTime).localeCompare(a.appointmentDate + a.appointmentTime))
    : [];
  const [showHistory, setShowHistory] = useState(false);
  const [showEarlier, setShowEarlier] = useState(false);
  const [notice, setNotice] = useState(null); // { kind: 'ok' | 'warn', text }
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 9000);
    return () => clearTimeout(t);
  }, [notice]);

  function handleExportAppointments() {
    const rows = [['Date set', 'Appointment date', 'Time', 'End time', 'Timezone', 'Presenter', 'Trainee', 'Client', 'Client email', 'Client phone', 'Type', 'Status', 'Notes', 'Zoom link']];
    appointments
      .slice()
      .sort((a, b) => (b.appointmentDate + b.appointmentTime).localeCompare(a.appointmentDate + a.appointmentTime))
      .forEach(a => {
        rows.push([
          a.dateSetOption, a.appointmentDate, a.appointmentTime, addMinutesToTime(a.appointmentTime, a.durationMinutes), a.appointmentTimezone,
          a.presenter, a.trainee, a.client, a.clientEmail, a.clientPhone, typeLabel(a), a.status, a.notes, a.zoomUrl,
        ]);
      });
    downloadCSV(`my-appointments-${todayStr()}.csv`, rows);
  }

  function byType(list) {
    if (typeFilter === 'all') return list;
    if (typeFilter === 'recruit') return list.filter(isRecruitType);
    if (typeFilter === 'sale') return list.filter(isSaleType);
    return list;
  }

  // (Phone reminders re-sync on their own after any saved change: reminders.jsx.)

  async function handleZoomConnect() {
    if (!isNativeApp()) setZoomConnecting(true);
    await startZoomConnect(() => refresh());
  }

  // This week's pace: the ones you set plus the ones you're presenting for your team.
  const weekAppts = [...appointments, ...presenting]
    .filter(a => a.weekOf === weekMonday && !a.isFollowUp)
    .sort((a, b) => (a.appointmentDate + a.appointmentTime).localeCompare(b.appointmentDate + b.appointmentTime));
  const groups = DATE_SET_OPTIONS.map(opt => ({
    option: opt,
    list: weekAppts.filter(a => a.dateSetOption === opt.value),
  }));
  // Auto-created follow-up appointments never count toward a batch — they
  // show here instead, sorted by when they'll actually happen, regardless
  // of which pace week is currently being viewed.
  const upcomingFollowUps = appointments
    .filter(a => a.isFollowUp && !isPastAppointment(a))
    .sort((a, b) => (a.appointmentDate + a.appointmentTime).localeCompare(b.appointmentDate + b.appointmentTime));

  const pastAppts = appointments.filter(isPastAppointment);
  const statusCounts = STATUS_OPTIONS.reduce((acc, opt) => {
    acc[opt.value] = pastAppts.filter(a => (a.status || '') === opt.value).length;
    return acc;
  }, {});
  const statusFiltered = statusView === null ? [] : pastAppts
    .filter(a => (a.status || '') === statusView)
    .sort((a, b) => (b.appointmentDate + b.appointmentTime).localeCompare(a.appointmentDate + a.appointmentTime));

  function closeForm() { setShowForm(false); setPendingPrefillData(null); setError(''); fromElsewhere.current = false; }
  // Cancel on a form you opened from another screen takes you back there.
  function cancelForm() { const back = fromElsewhere.current; closeForm(); if (back && onReturn) onReturn(); }
  // Editing opens the same window as on Calendar and Today, right where you
  // are (the form at the top of the page could be far off-screen).
  function openEdit(appt) { openAppointment(appt); }
  function openNewForm() { fromElsewhere.current = false; setShowForm(true); }
  useAppointmentEdits(change => {
    if (change.reload) refresh();
    else setAppointments(prev => applyAppointmentEdit(prev, change));
  });

  async function handleFormSubmit(input) {
    setSaving(true);
    setError('');
    const { form, listNote } = await addToListFirst(user, input);
    const res = await insertAppointment(user.id, { ...form, weekOf: weekMonday });
    if (!res.ok) { setSaving(false); setError(res.error || 'Could not save. Try again.'); return; }
    let record = res.record;
    // Create a real meeting if either the current user has Zoom connected,
    // or they picked a specific presenting manager's Zoom to use instead.
    if (zoomStatus.connected || form.zoomHostId) {
      const zoomRes = await createZoomMeeting({
        topic: `Meeting with ${form.client}`,
        startTime: `${form.appointmentDate}T${form.appointmentTime}:00`,
        durationMinutes: record.durationMinutes,
        timezone: form.timezone,
        hostUserId: form.zoomHostId,
      });
      if (zoomRes.connected && zoomRes.joinUrl) {
        const ok = await updateAppointmentZoomUrl(record.id, zoomRes.joinUrl);
        if (ok) record = { ...record, zoomUrl: zoomRes.joinUrl };
      } else if (zoomRes.error === 'reconnect_required' && !form.zoomHostId) {
        // Only clear my own connection status — a failure on a presenting
        // manager's account isn't something I need to reconnect.
        setZoomStatus({ connected: false });
      }
    }
    // Best-effort push to Google Calendar — the advisor's own, and the
    // presenting manager's too if their Zoom was used. Never blocks the
    // appointment from being saved even if this fails entirely (e.g.
    // neither side has reconnected to grant the newer write scope yet).
    const inviteEmails = form.inviteEmails || [];
    const google = await pushAppointmentToGoogleCalendar({
      title: `Meeting with ${form.client}`,
      description: record.zoomUrl ? `Join Zoom: ${record.zoomUrl}` : undefined,
      location: record.zoomUrl || undefined,
      attendees: inviteEmails,
      startDateTime: `${form.appointmentDate}T${form.appointmentTime}:00`,
      endDateTime: addMinutesToDateTime(form.appointmentDate, form.appointmentTime, record.durationMinutes),
      timezone: form.timezone,
      managerHostId: form.zoomHostId,
    });
    // Invites: Google Calendar emails everyone it can when it's connected.
    // Google never emails the calendar's owner (usually the advisor's own
    // "Me" address), so PaceLedger emails whoever Google didn't — or
    // everyone, when Google Calendar isn't connected.
    if (inviteEmails.length) {
      const norm = e => String(e).trim().toLowerCase();
      const byGoogle = google.ownPushed && Array.isArray(google.invited) ? google.invited.map(norm) : [];
      const byEmail = inviteEmails.filter(e => !byGoogle.includes(norm(e)));
      let emailed = [];
      let emailError = null;
      // Email first: send-appointment-invite refuses a second send within
      // a minute of invite_sent_at, which markInviteSent sets.
      if (byEmail.length) {
        const r = await sendAppointmentInviteEmail(record.id, byEmail);
        if (r.sent) emailed = r.recipients || byEmail;
        else emailError = r.error;
      }
      const reached = [...byGoogle, ...emailed];
      if (reached.length) {
        const method = byGoogle.length ? 'google' : 'email';
        if (byGoogle.length) await markInviteSent(record.id, reached, method);
        record = { ...record, inviteeEmails: reached, inviteMethod: method, inviteSentAt: new Date().toISOString() };
      }
      const zoomBit = record.zoomUrl ? ' with the Zoom link' : '';
      const parts = [];
      if (byGoogle.length) parts.push(`Google Calendar invite sent to ${byGoogle.join(', ')}`);
      if (emailed.length) parts.push(`invite emailed to ${emailed.join(', ')}`);
      if (emailError) {
        const missed = byEmail.filter(e => !emailed.map(norm).includes(norm(e)));
        const failText = inviteFailureMessage(emailError);
        setNotice({ kind: 'warn', text: parts.length ? `${parts.join('; ')}${zoomBit}. Not sent to ${missed.join(', ')}: ${failText}` : failText });
      } else if (parts.length) {
        const text = parts.join('; ');
        setNotice({ kind: 'ok', text: `${text.charAt(0).toUpperCase()}${text.slice(1)}${zoomBit}.` });
      }
    }
    setSaving(false);
    setAppointments(prev => upsertAppointment(prev, record));
    if (listNote) setNotice({ kind: 'warn', text: listNote });
    closeForm();
    // "Send them the client intake form": emailed, or the send window opens.
    if (form.sendIntake) {
      const n = await sendIntakeAfterBooking(user, record);
      if (n) setNotice(prev => (prev && prev.kind === 'warn' ? prev : prev ? { kind: n.kind, text: `${prev.text} ${n.text}` } : n));
    }
  }
  async function handleDelete(id) {
    const target = appointments.find(a => a.id === id);
    if (target) await deleteAppointmentWithUndo(target);
  }
  async function handleSaveFollowUp(id, data) {
    setFollowUpSaving(true);
    const original = appointments.find(a => a.id === id);
    const res = await persistFollowUp(user, id, original, data);
    setFollowUpSaving(false);
    if (!res.ok) return;
    setAppointments(prev => applyFollowUpToList(prev, id, data, res.followUpTimezone, res.newAppt));
    setFollowUpTarget(null);
  }
  function handleRescheduled(rec, info) {
    setAppointments(prev => prev.map(a => (a.id === rec.id ? rec : a)));
    setFollowUpTarget(null);
    setNotice({ kind: info && info.emailed === false ? 'warn' : 'ok', text: `Moved ${rec.client} to ${fmtApptDateTime(rec)}.${info && info.emailed === true ? ' Updated invite emailed.' : info && info.emailed === false ? " The updated invite didn't send; edit the appointment to try again." : ''}` });
  }

  return (
    <div className="tr-appts-shell">
      {section === 'booked' ? null : <nav className="tr-appts-sidebar">
        <button
          type="button"
          className={`tr-sidebar-item tr-sidebar-item-week ${statusView === null ? 'tr-sidebar-item-active' : ''}`}
          onClick={() => setStatusView(null)}>
          <span>This week</span>
        </button>
        <div className="tr-sidebar-divider">Past appointments by status</div>
        {STATUS_OPTIONS.map(opt => (
          <button
            key={opt.value || 'none'} type="button"
            className={`tr-sidebar-item tr-sidebar-item-${opt.color} ${statusView === opt.value ? 'tr-sidebar-item-active' : ''}`}
            onClick={() => setStatusView(opt.value)}>
            <span>{opt.label}</span>
            <span className="tr-mono">{statusCounts[opt.value]}</span>
          </button>
        ))}
        <div className="tr-sidebar-divider">Open Requirements</div>
        <button
          type="button"
          className={`tr-sidebar-item tr-sidebar-item-amber ${statusView === SOLD_PREMIUM_VIEW ? 'tr-sidebar-item-active' : ''}`}
          onClick={() => setStatusView(SOLD_PREMIUM_VIEW)}>
          <span>Submitted Premium</span>
        </button>
        <button
          type="button"
          className={`tr-sidebar-item tr-sidebar-item-green ${statusView === ISSUED_PREMIUM_VIEW ? 'tr-sidebar-item-active' : ''}`}
          onClick={() => setStatusView(ISSUED_PREMIUM_VIEW)}>
          <span>Issued Premium</span>
        </button>
      </nav>}

      <div className="tr-appts-main">
        <PageHead title={section === 'booked' ? 'Appointments' : 'My appointments'}>
          <button className="tr-btn tr-btn-brass" onClick={() => (showForm ? closeForm() : openNewForm())}>
            {showForm ? <><X size={16} /> Close</> : <><Plus size={16} /> Log appointment</>}
          </button>
        </PageHead>
        {/* A save that fails shows in the form itself (on a phone the form
            covers the page). */}
        {error && !showForm && <div className="tr-error">{error}</div>}
        {notice && <div className={notice.kind === 'ok' ? 'tr-flash' : 'tr-error'}>{notice.text}</div>}
        {showForm && (
          <AppointmentForm user={user} weekMonday={weekMonday} prefillData={pendingPrefillData} onCancel={cancelForm} onSubmit={handleFormSubmit} saving={saving} sheet={isPhone} saveError={error} />
        )}
        <div className="tr-toolbar">
          <div className="tr-search-row">
            <Search size={15} className="tr-search-icon" />
            <input
              className="tr-search-input" type="text" placeholder="Search by name or phone…" aria-label="Search appointments by client name or phone"
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            {searchQuery && (
              <button type="button" className="tr-icon-btn" onClick={() => setSearchQuery('')} title="Clear search"><X size={15} /></button>
            )}
          </div>
          <div title="Filters the lists below. Your weekly pace always counts everything.">
            <TypeFilter value={typeFilter} onChange={setTypeFilter} />
          </div>
          <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={handleExportAppointments} disabled={appointments.length === 0} title="Download every appointment as a spreadsheet (CSV)">
            <Download size={14} /><span className="tr-hide-mobile"> Export</span>
          </button>
        </div>
        {searchQuery.trim() ? (
          <>
            <h2 className="tr-section-title">Search results for "{searchQuery.trim()}"</h2>
            <p className="tr-subtitle">Across every appointment you've ever logged, regardless of week.</p>
            {searchResults.length === 0 ? (
              <div className="tr-card"><p className="tr-empty">No matches.</p></div>
            ) : (
              <ApptGroup me={user.displayName} list={byType(searchResults)} onDelete={handleDelete} onFollowUp={setFollowUpTarget} onEdit={openEdit} empty="" />
            )}
          </>
        ) : statusView === null ? (
          <>
            <MyCoachingNotes userId={user.id} weekOf={weekMonday} />
            {/* Zoom: a one-line reminder until it's connected (you can wave
                it off for a month; it's also under Your account). */}
            {!loading && !zoomStatus.connected ? <ZoomNudge connecting={zoomConnecting} onConnect={handleZoomConnect} /> : null}
            <PaceStrip
              collapsible
              header={<WeekNav weekMonday={weekMonday} onShift={d => setWeekMonday(shiftWeekStr(weekMonday, d))} onToday={() => setWeekMonday(weekStartOf(todayStr()))} />}
              groups={groups.map(g => ({ option: g.option, count: g.list.length, list: g.list }))}
              note={(() => { const n = weekAppts.filter(a => a.presentingFor).length; return n ? `Includes ${n} you're presenting for your team.` : ''; })()} />
            {loading ? <SkeletonRows count={5} /> : (() => {
              // What's next first; then the ones that need how they went
              // logged; then the rest of this week, folded away.
              const nowMs = Date.now();
              const thisWeek = weekMonday === weekStartOf(todayStr());
              const listed = byType(weekAppts);
              const ahead = listed.filter(a => apptEndMs(a) > nowMs).sort((a, b) => apptStartMs(a) - apptStartMs(b));
              const over = listed.filter(a => apptEndMs(a) <= nowMs).sort((a, b) => apptStartMs(b) - apptStartMs(a));
              const needs = over.filter(a => !a.presentingFor && !a.followUpCompletedAt);
              const rest = over.filter(a => !needs.includes(a));
              const kind = typeFilter === 'all' ? '' : `${typeFilter} `;
              return (
                <>
                  {ahead.length > 0 ? (
                    <ApptGroup
                      title={`Coming up (${ahead.length})`} me={user.displayName}
                      list={ahead} onDelete={handleDelete} onFollowUp={setFollowUpTarget} onEdit={openEdit} empty="" />
                  ) : (thisWeek || weekMonday > weekStartOf(todayStr())) ? (
                    <div className="tr-card"><p className="tr-empty" style={{ margin: 0 }}>
                      {listed.length ? `Nothing else ${kind ? `(${kind.trim()}) ` : ''}coming up this week.` : `No ${kind}appointments set for this week yet. Log one above, or start from a prospect.`}
                    </p></div>
                  ) : null}
                  {upcomingFollowUps.length > 0 && (
                    <ApptGroup
                      title={`Upcoming follow-ups (${upcomingFollowUps.length})`} me={user.displayName}
                      list={byType(upcomingFollowUps)} onDelete={handleDelete} onFollowUp={setFollowUpTarget}
                      onEdit={openEdit} empty="" />
                  )}
                  {needs.length > 0 && (
                    <ApptGroup
                      title={`Needs an outcome (${needs.length})`} me={user.displayName}
                      list={needs} onDelete={handleDelete} onFollowUp={setFollowUpTarget} onEdit={openEdit} empty="" />
                  )}
                  {rest.length > 0 && (thisWeek ? (
                    <div className="tr-list-fold">
                      <button type="button" className="tr-list-fold-head" aria-expanded={showEarlier} onClick={() => setShowEarlier(v => !v)}>
                        {showEarlier ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                        <strong>Earlier this week</strong><span>{rest.length} done</span>
                      </button>
                      {showEarlier ? <ApptGroup me={user.displayName} list={rest} onDelete={handleDelete} onFollowUp={setFollowUpTarget} onEdit={openEdit} empty="" /> : null}
                    </div>
                  ) : (
                    <ApptGroup
                      title={`${weekMonday < weekStartOf(todayStr()) ? 'That week' : 'Done'} (${rest.length})`} me={user.displayName}
                      list={rest} onDelete={handleDelete} onFollowUp={setFollowUpTarget} onEdit={openEdit} empty="" />
                  ))}
                  {!thisWeek && listed.length === 0 && weekMonday < weekStartOf(todayStr()) ? (
                    <div className="tr-card"><p className="tr-empty" style={{ margin: 0 }}>No {kind}appointments that week.</p></div>
                  ) : null}
                </>
              );
            })()}
            <button type="button" className="tr-ov-link" style={{ alignSelf: 'flex-start' }} onClick={() => setShowHistory(h => !h)}>
              {showHistory ? 'Hide pace history' : 'Show pace history (last 6 weeks, streaks, best week)'}
            </button>
            {showHistory && (
              <>
                <PaceTrend appointments={[...appointments, ...presenting]} currentWeekMonday={weekMonday} />
                <PersonalBests appointments={[...appointments, ...presenting]} />
              </>
            )}
          </>
        ) : statusView === SOLD_PREMIUM_VIEW ? (
          <OpenRequirementsBody view="sold" user={user} />
        ) : statusView === ISSUED_PREMIUM_VIEW ? (
          <OpenRequirementsBody view="issued" user={user} />
        ) : (
          <>
            <h2 className="tr-section-title">{STATUS_OPTIONS.find(o => o.value === statusView)?.label}</h2>
            <p className="tr-subtitle">Every past appointment currently in this state.</p>
            {loading ? <SkeletonRows count={4} /> : byType(statusFiltered).length === 0 ? (
              <div className="tr-card"><p className="tr-empty">Nothing here.</p></div>
            ) : (
              <ApptGroup me={user.displayName} list={byType(statusFiltered)} onDelete={handleDelete} onFollowUp={setFollowUpTarget} onEdit={openEdit} empty="" />
            )}
          </>
        )}
        {followUpTarget && (
          <FollowUpModal
            appointment={followUpTarget}
            onClose={() => setFollowUpTarget(null)}
            onSave={handleSaveFollowUp}
            onRescheduled={handleRescheduled}
            onEdit={() => { const a = followUpTarget; setFollowUpTarget(null); openAppointment(a); }}
            saving={followUpSaving} />
        )}
      </div>
    </div>
  );
}
