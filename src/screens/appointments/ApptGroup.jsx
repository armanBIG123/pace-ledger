// A group of appointments in a list (a day, a status, search results), each with
// its outcome, invite and contact buttons.
import { ClipboardCheck } from 'lucide-react';
import { fmtApptDateTime, fmtFollowUpDateTime } from '../../lib/dates.js';
import { isPastAppointment, isRecruitType, isSaleType } from '../../data/appointments.js';
import { StatusChip, TypeBadge } from '../../components/ui.jsx';
import { appointmentTexts, CallButton, TextButton } from '../../components/contact.jsx';
import { openAppointment } from '../../components/appointmentPanel.jsx';

export function ApptGroup({ title, list, onDelete, onFollowUp, onEdit, empty, hideSet, me = '' }) {
  // Only show the Trainee column when someone in this group actually has one.
  const showTrainee = list.some(a => a.trainee);
  return (
    <div className={`tr-card tr-appt-group ${hideSet ? 'tr-appt-group-week' : ''}`}>
      {title ? <h3 className="tr-h3 tr-appt-group-title">{title}</h3> : null}
      {list.length === 0 ? <p className="tr-empty">{empty}</p> : (
        <div className="tr-table-wrap">
          <table className="tr-table">
            <thead>
              <tr>{!hideSet && <th className="th-set">Set</th>}<th className="th-when">Appointment</th><th className="th-client">Client / recruit</th><th className="th-presenter">Presenter</th>{showTrainee && <th className="th-trainee">Trainee</th>}{onDelete && <th className="th-actions"><span className="tr-sr-only">Actions</span></th>}</tr>
            </thead>
            <tbody>
              {list.map(a => {
                const typeClass = isRecruitType(a) && isSaleType(a) ? 'tr-type-both' : isRecruitType(a) ? 'tr-type-recruit' : isSaleType(a) ? 'tr-type-sale' : '';
                return (
                  <tr key={a.id} className={`tr-appt-row tr-appt-row-${typeClass ? typeClass.replace('tr-type-', '') : 'none'}`}>
                    {!hideSet && <td className={`td-set ${typeClass}`}>{a.dateSetLabel}</td>}
                    <td className={`td-when ${hideSet ? typeClass : ''}`}>{fmtApptDateTime(a)}</td>
                    <td className="td-client">
                      <button type="button" className="tr-appt-client-btn" onClick={() => openAppointment(a)}><strong className="tr-appt-client">{a.client}</strong></button>
                      <TypeBadge appt={a} />
                      {a.status ? <span style={{ marginLeft: 6 }}><StatusChip status={a.status} /></span> : null}
                      {a.zoomUrl || a.clientPhone ? (
                        <div className="tr-appt-links">
                          {a.zoomUrl ? <a href={a.zoomUrl} target="_blank" rel="noopener noreferrer" className="tr-note tr-link">Join Zoom</a> : null}
                          {a.clientPhone ? (
                            <span className="tr-appt-contact">
                              <CallButton phone={a.clientPhone} compact />
                              <TextButton phone={a.clientPhone} name={a.client} texts={appointmentTexts(a, me)} compact />
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {a.followUpAppointmentDate ? <div className="tr-note" style={{ marginTop: 2 }}>Follow-up: {fmtFollowUpDateTime(a)}</div> : null}
                      {a.inviteSentAt ? <div className="tr-note" style={{ marginTop: 2 }} title={(a.inviteeEmails || []).join(', ')}>Invite sent to {(a.inviteeEmails || []).length} {(a.inviteeEmails || []).length === 1 ? 'person' : 'people'}{a.inviteMethod === 'google' ? ' (Google)' : ''}</div> : null}
                      {a.notes ? <span className="tr-note"> — {a.notes}</span> : null}
                    </td>
                    <td className="td-presenter">{a.presentingFor
                      ? <><span className="tr-presenting-chip">You're presenting</span><div className="tr-note">set by {a.setByName || 'your team'}</div></>
                      : <><span className="tr-mobile-only">with </span>{a.presenter}</>}</td>
                    {showTrainee && <td className="td-trainee"><span className="tr-mobile-only">trainee </span>{a.trainee || '—'}</td>}
                    {onDelete && a.presentingFor && <td className="td-actions" />}
                    {onDelete && !a.presentingFor && (
                      <td className="td-actions" style={{ whiteSpace: 'nowrap' }}>
                        {onFollowUp && isPastAppointment(a) && !a.followUpCompletedAt && (
                          <button className="tr-btn tr-btn-brass tr-btn-sm" style={{ marginRight: 4 }} onClick={() => onFollowUp(a)} title="Log how it went">Log outcome</button>
                        )}
                        {onFollowUp && isPastAppointment(a) && a.followUpCompletedAt && (
                          <button className="tr-icon-btn" onClick={() => onFollowUp(a)} title="Edit outcome">
                            <ClipboardCheck size={14} />
                          </button>
                        )}
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
