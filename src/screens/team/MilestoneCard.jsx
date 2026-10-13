// Milestone card: opens when you tap someone in the solar system. Their level,
// how close they are to the next one, the biggest gap, this week's pace, and
// quick ways to help (email, coaching note, review promotion, open their system).
import React, { useEffect, useRef, useState } from 'react';
import { Activity, ArrowRight, Award, Mail, MessageSquare, X } from 'lucide-react';
import { WEEKLY_TOTAL_TARGET } from '../../lib/pace.js';
import { BodyIcon, bodyName } from '../../components/CelestialBody.jsx';
import { GapCallout, NextLevel, RequirementList } from '../../components/milestones.jsx';
import { StatusBadge } from '../../components/ui.jsx';
import { CoachingNotesPanel } from './TeamPace.jsx';

export function MilestoneCard({ person, summary, pace, licensing, isYou, canCoach, currentUser, weekOf, onClose, onOpenSystem, onReviewPromotion, quiet }) {
  const [coaching, setCoaching] = useState(false);
  const closeRef = useRef(null);
  useEffect(() => { setCoaching(false); }, [person.id]);
  useEffect(() => { if (closeRef.current) closeRef.current.focus({ preventScroll: true }); }, [person.id]);
  const first = (person.display_name || '').trim().split(/\s+/)[0] || 'their';
  const tier = summary.tier;
  const st = pace || { total: 0, status: 'progress' };
  const showLicensing = licensing && !licensing.licensed && person.role !== 'super_admin';

  return (
    <div className="tr-ms-card" role="dialog" aria-label={`${person.display_name}: milestones`}>
      <div className="tr-ms-head">
        <BodyIcon tier={person.hierarchy_tier} size={40} faded={quiet} />
        <div className="tr-ms-who">
          <div className="tr-ms-name">{person.display_name}{isYou ? <span className="tr-org-you">you</span> : null}</div>
          <div className="tr-ms-sub">{tier ? `${tier.name} (${tier.key}) · ${bodyName(tier.key)}` : 'No level set yet'}</div>
        </div>
        <button ref={closeRef} type="button" className="tr-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </div>

      {summary.state === 'unset' && <p className="tr-ms-note">A super admin can set {isYou ? 'your' : 'their'} level in Manage Team.</p>}
      {summary.state === 'top' && <p className="tr-ms-note">Top of the ladder: Executive Vice Chairman, {tier.commission}% commission.</p>}
      <NextLevel summary={summary} />
      <RequirementList summary={summary} />
      <GapCallout summary={summary} />

      <div className="tr-ms-week">
        <span><Activity size={14} aria-hidden="true" /> This week <strong>{st.total}/{WEEKLY_TOTAL_TARGET}</strong></span>
        <StatusBadge status={st.status} />
        {showLicensing ? <span className="tr-ms-lic">Licensing {licensing.doneCount}/{licensing.total}</span> : null}
      </div>

      <div className="tr-ms-actions">
        {!isYou && person.email ? <a className="tr-btn tr-btn-ghost tr-btn-sm" href={`mailto:${person.email}`}><Mail size={14} /> Email</a> : null}
        {canCoach ? (
          <button type="button" className={`tr-btn tr-btn-ghost tr-btn-sm ${coaching ? 'tr-ms-on' : ''}`} aria-expanded={coaching} onClick={() => setCoaching(v => !v)}>
            <MessageSquare size={14} /> Coaching note
          </button>
        ) : null}
        {summary.state === 'ready' && onReviewPromotion ? (
          <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={onReviewPromotion}><Award size={14} /> Review promotion</button>
        ) : null}
      </div>
      {coaching && canCoach ? <CoachingNotesPanel advisorId={person.id} weekOf={weekOf} currentUser={currentUser} /> : null}
      {onOpenSystem ? (
        <button type="button" className="tr-btn tr-btn-brass tr-ms-open" onClick={onOpenSystem}>
          Open {isYou ? 'your' : `${first}'s`} system <ArrowRight size={15} />
        </button>
      ) : null}
    </div>
  );
}
