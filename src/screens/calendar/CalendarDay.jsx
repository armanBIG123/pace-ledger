// One day on the month grid, and the window for a training or blocked-out time.
import { Ban, GraduationCap, Pencil, Trash2, Video, X } from 'lucide-react';
import { apptEndClock, apptLocalTimeKey, fmtDisplayDate, fmtTime, todayStr, trainingEndClock, trainingLocalDate, trainingLocalTimeKey } from '../../lib/dates.js';
import { isRecruitType, isSaleType } from '../../data/appointments.js';
import { googleEventTimeKey } from '../../data/integrations.js';
import { Modal } from '../../components/ui.jsx';
import { openAppointment } from '../../components/appointmentPanel.jsx';
import { isAdmin } from '../../lib/roles.js';

export function calendarItems(appts, googleEvents, trainings, scheduleBlocks) {
  return [
    ...appts.map(a => ({ kind: 'appt', data: a, timeKey: apptLocalTimeKey(a) })),
    ...googleEvents.map(e => ({ kind: 'google', data: e, timeKey: googleEventTimeKey(e) })),
    ...trainings.map(t => ({ kind: 'training', data: t, timeKey: trainingLocalTimeKey(t) })),
    ...scheduleBlocks.map(b => ({ kind: 'block', data: b, timeKey: b.start_time.slice(0, 5) })),
  ].sort((a, b) => a.timeKey.localeCompare(b.timeKey));
}

// canOpen: an appointment, training or blocked-out time opens straight
// from the grid, and a Google event opens in Google Calendar (on a
// computer; on a phone they're dots, and a tap opens the day).
export function CalendarDay({ cell, appts, googleEvents, trainings, scheduleBlocks, highlightTrainings, onOpen, onOpenItem, canOpen = false }) {
  const isToday = cell.date === todayStr();
  const items = calendarItems(appts, googleEvents, trainings, scheduleBlocks);
  const visible = items.slice(0, 3);
  const extra = items.length - visible.length;
  const isHighlighted = highlightTrainings && trainings.length > 0;
  return (
    <div
      className={`tr-cal-day ${cell.inMonth ? '' : 'tr-cal-day-out'} ${isToday ? 'tr-cal-day-today' : ''} ${isHighlighted ? 'tr-cal-day-training-highlight' : ''}`}
      onClick={() => onOpen(cell.date, appts, googleEvents, trainings, scheduleBlocks)}>
      <div className="tr-cal-daynum"><span>{cell.dayNum}</span></div>
      <div className="tr-cal-appts">
        {visible.map(item => item.kind === 'appt' ? (() => {
          const cls = `tr-cal-appt ${isRecruitType(item.data) && isSaleType(item.data) ? 'tr-cal-appt-both' : isRecruitType(item.data) ? 'tr-cal-appt-recruit' : isSaleType(item.data) ? 'tr-cal-appt-sale' : ''}`;
          return canOpen ? (
            <button key={item.data.id} type="button" className={`${cls} tr-cal-appt-btn`} title={`${item.data.client} · ${fmtTime(item.timeKey)} to ${apptEndClock(item.data)}`}
              onClick={e => { e.stopPropagation(); openAppointment(item.data); }}>
              {fmtTime(item.timeKey)} {item.data.client}
            </button>
          ) : (
            <div key={item.data.id} className={cls}>{fmtTime(item.timeKey)} {item.data.client}</div>
          );
        })() : item.kind === 'training' || item.kind === 'block' ? (() => {
          const cls = `tr-cal-appt ${item.kind === 'training' ? 'tr-cal-appt-training' : 'tr-cal-appt-unavailable'}`;
          const inner = item.kind === 'training'
            ? <><GraduationCap size={9} /> {fmtTime(item.timeKey)} {item.data.title}</>
            : <><Ban size={9} /> {fmtTime(item.timeKey)} {item.data.user_name || 'Unavailable'}</>;
          return canOpen && onOpenItem
            ? <button key={item.data.id} type="button" className={`${cls} tr-cal-appt-btn`} onClick={e => { e.stopPropagation(); onOpenItem(item); }}>{inner}</button>
            : <div key={item.data.id} className={cls}>{inner}</div>;
        })() : (() => {
          const label = item.data.allDay ? item.data.title : `${fmtTime(item.timeKey)} ${item.data.title}`;
          return canOpen && item.data.htmlLink
            ? <a key={item.data.id} className="tr-cal-appt tr-cal-appt-google tr-cal-appt-btn" href={item.data.htmlLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Open in Google Calendar">{label}</a>
            : <div key={item.data.id} className="tr-cal-appt tr-cal-appt-google">{label}</div>;
        })())}
        {extra > 0 && <div className="tr-cal-more">+{extra}<span className="tr-cal-more-word"> more</span></div>}
      </div>
    </div>
  );
}

// A training or a blocked-out time, opened from the list or the month grid.
export function CalendarItemInfo({ item, user, onClose, onDelete, onEdit }) {
  const t = item.data;
  const training = item.kind === 'training';
  const canDelete = training ? isAdmin(user) : (user.id === t.user_id || isAdmin(user));
  const when = training
    ? `${fmtDisplayDate(trainingLocalDate(t))} · ${fmtTime(trainingLocalTimeKey(t))} – ${trainingEndClock(t)}`
    : `${fmtDisplayDate(t.block_date)} · ${fmtTime(t.start_time.slice(0, 5))} – ${fmtTime(t.end_time.slice(0, 5))}`;
  return (
    <Modal onClose={onClose} labelledBy="tr-calinfo-title" className="tr-apptinfo">
      <div className="tr-modal-head">
        <div className="tr-apptinfo-top">
          <h3 className="tr-h3" id="tr-calinfo-title">{training ? t.title : `${t.user_name || 'Someone'} unavailable`}</h3>
          <div className="tr-apptinfo-tags">
            <span className={`tr-calinfo-tag ${training ? 'tr-calinfo-training' : 'tr-calinfo-block'}`}>
              {training ? <GraduationCap size={12} aria-hidden="true" /> : <Ban size={12} aria-hidden="true" />} {training ? 'Training' : 'Blocked out'}
            </span>
            {t.recurring_group_id ? <span className="tr-presenting-chip">Weekly</span> : null}
          </div>
        </div>
        <button type="button" className="tr-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>
      <p className="tr-apptinfo-when">{when}</p>
      <dl className="tr-apptinfo-list">
        {training ? <div><dt>Posted by</dt><dd>{t.created_by_name || '—'}</dd></div> : null}
        {training && t.notes ? <div><dt>Notes</dt><dd>{t.notes}</dd></div> : null}
        {/* Blocks of the people above you come without the reason at all. */}
        {!training ? <div><dt>Reason</dt><dd>{'label' in t ? (t.label || 'None given') : 'Only they and the people above them see why.'}</dd></div> : null}
      </dl>
      {training && t.zoom_url ? (
        <div className="tr-apptinfo-acts">
          <a className="tr-btn tr-btn-brass tr-btn-sm" href={t.zoom_url} target="_blank" rel="noopener noreferrer"><Video size={14} aria-hidden="true" /> Join Zoom</a>
        </div>
      ) : null}
      <div className="tr-form-actions">
        {training && canDelete && onEdit ? <button type="button" className="tr-btn tr-btn-ghost" onClick={onEdit}><Pencil size={15} aria-hidden="true" /> Change time or details</button> : null}
        {canDelete ? <button type="button" className="tr-btn tr-btn-ghost tr-appt-delete" onClick={onDelete}><Trash2 size={15} aria-hidden="true" /> {training ? 'Remove training' : 'Remove'}</button> : null}
        <button type="button" className="tr-btn tr-btn-ghost" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
