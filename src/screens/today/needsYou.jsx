// Promotion and licensing items for Today's "Do next" list.
import { useEffect, useState } from 'react';
import { Award, GraduationCap, Users } from 'lucide-react';
import { examWhen, fetchLicensingProgress, licensingStatus } from '../../licensing.js';
import { fmtShortDate, todayStr } from '../../lib/dates.js';
import { lowerFirst } from '../../lib/format.js';
import { loadPromotionReadiness } from '../../data/team.js';
import { isAdmin as isAdminRole } from '../../lib/roles.js';

// "Needs you" on Today: one short list instead of a stack of banners.
// Your own promotion news first, then anyone you can see (your downline;
// everyone for super admins) who has met every requirement for their next
// tier, then where you are on the path to licensed. Leaders can hide a
// name once they've passed it on.
export function readHiddenPromos() {
  try { return new Set(JSON.parse(localStorage.getItem('pl_promo_hidden') || '[]')); } catch { return new Set(); }
}

// Promotion and licensing items for the "Do next" list: your own
// promotion news, anyone you can see (your downline; everyone for super
// admins) who has met every requirement for their next tier, and where you
// are on the path to licensed. Leaders can hide a name once they've passed
// it on. `licProfile` is your NPN and writing number, already loaded by
// Today.
export function useNeedsYou({ user, licProfile, showLicensing, onMilestones, onReview, onLicensing }) {
  const [ready, setReady] = useState(null);
  const [prog, setProg] = useState(undefined);
  const [hidden, setHidden] = useState(readHiddenPromos);
  useEffect(() => {
    let alive = true;
    loadPromotionReadiness(user, undefined, { shared: true }).then(({ list }) => {
      if (alive) setReady(list.filter(x => x.progress && x.progress.allMet));
    }).catch(() => { if (alive) setReady([]); });
    return () => { alive = false; };
  }, [user.id, user.role]);
  useEffect(() => {
    let alive = true;
    const load = () => fetchLicensingProgress(user.id).then(p => { if (alive) setProg(p && p.error ? null : (p || {})); });
    load();
    window.addEventListener('paceledger:onboarding-changed', load);
    return () => { alive = false; window.removeEventListener('paceledger:onboarding-changed', load); };
  }, [user.id]);

  const isAdmin = isAdminRole(user);
  const keyOf = x => `${x.member.id}:${x.progress.nextTier.key}`;
  function hide(x) {
    const next = new Set(hidden); next.add(keyOf(x)); setHidden(next);
    try { localStorage.setItem('pl_promo_hidden', JSON.stringify([...next].slice(-200))); } catch { /* ignore */ }
  }
  const promos = [];
  const mine = ready ? ready.find(x => x.member.id === user.id) : null;
  if (mine) promos.push({
    key: 'me', Icon: Award, tone: 'brass',
    title: <>You've met every requirement for <strong>{mine.progress.nextTier.name}</strong></>,
    meta: isAdmin ? 'Approve it from Team Pace → Promotion.' : 'Your direct manager submits it for approval.',
    action: { label: 'See my progress', run: onMilestones },
  });
  const others = ready ? ready.filter(x => x.member.id !== user.id && !hidden.has(keyOf(x))) : [];
  others.slice(0, 3).forEach(x => {
    const submits = !isAdmin && x.member.manager_id === user.id;
    promos.push({
      key: keyOf(x), Icon: Users, tone: 'brass', primary: true,
      title: isAdmin ? <>Approve <strong>{x.member.display_name}</strong> for {x.progress.nextTier.name}</>
        : submits ? <>Submit <strong>{x.member.display_name}</strong> for {x.progress.nextTier.name}</>
          : <><strong>{x.member.display_name}</strong> is ready for {x.progress.nextTier.name}</>,
      meta: submits || isAdmin ? 'Every requirement met' : 'Every requirement met. Their direct manager submits it.',
      action: onReview ? { label: isAdmin ? 'Review' : submits ? 'Submit' : 'Review', run: onReview } : null,
      onHide: isAdmin ? null : () => hide(x),
    });
  });
  if (others.length > 3) promos.push({
    key: 'more-promos', Icon: Users, tone: 'brass',
    title: <>{others.length - 3} more ready for promotion</>, meta: '',
    action: onReview ? { label: 'See all', run: onReview } : null,
  });
  let licensing = null;
  if (showLicensing && !isAdmin && prog && licProfile) {
    const st = licensingStatus(prog, licProfile);
    if (!st.licensed && st.next) {
      const examSoon = prog.exam_on && !st.done.examPassed && prog.exam_on >= todayStr();
      licensing = {
        key: 'lic', Icon: GraduationCap, tone: 'blue',
        title: examSoon ? <>Your licensing exam is <strong>{examWhen(prog.exam_on)}</strong></> : <>Licensing: {lowerFirst(st.next.title)}</>,
        meta: examSoon ? `${fmtShortDate(prog.exam_on)} · step ${st.nextIndex + 1} of ${st.total}` : `Step ${st.nextIndex + 1} of ${st.total}`,
        action: { label: 'Licensing', run: onLicensing },
      };
    }
  }
  return { promos, licensing };
}
