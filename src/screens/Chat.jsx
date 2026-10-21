// Chat: General, Work and Urgent help for everyone in the agency. Opens from
// the chat button in the top bar. Before anything shows, each person agrees
// to the chat rules once (Apple requires it). Any message can be reported
// or its sender blocked; super admins review reports here too.
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, Briefcase, Flag, Hash, LifeBuoy, Megaphone, Send, ShieldCheck, X } from 'lucide-react';
import {
  acceptChatRules, blockChatUser, CHAT_CHANNELS, CHAT_MAX_LENGTH, deleteChatMessage, fetchChatBlocks, fetchChatMessages,
  fetchChatRulesAccepted, fetchChatUnread, fetchOpenChatReports, markChatRead, notifyUrgent, postChatMessage,
  reportChatMessage, resolveChatReport, unblockChatUser,
} from '../data/chat.js';
import { fetchHierarchyPeopleShared } from '../data/team.js';
import { useAnnouncements, waitingFor } from '../data/announcements.js';
import { Modal, MoreMenu, SkelBlock, useIsPhone } from '../components/ui.jsx';
import { Avatar, useAvatars } from '../components/avatar.jsx';
import { MEGAPHONE_ABOUT, MegaPhoneRoom } from './MegaPhone.jsx';

const ICONS = { megaphone: Megaphone, general: Hash, work: Briefcase, urgent: LifeBuoy, reports: Flag };
// Rooms that aren't conversations (no messages to load or mark read).
const NOT_MESSAGES = new Set(['reports', 'megaphone']);
const REASONS = ['Harassment or bullying', 'Hate or discrimination', 'Sexual or graphic content', "A client's private information", 'Spam', 'Something else'];
const GROUP_MS = 5 * 60 * 1000;
const POLL_MS = 20000;
const first = n => (n || '').trim().split(/\s+/)[0] || n || 'them';
const initials = n => (n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const AVATAR = ['#2E5E8C', '#6B4E9B', '#2E7D4F', '#A0522D', '#8C6D1F', '#7A3E5C', '#3D6B6B', '#5B6770'];
const avatarColor = id => AVATAR[([...String(id)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261) >>> 13) % AVATAR.length];
const timeOf = iso => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
function dayLabel(iso) {
  const d = new Date(iso); const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
}
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

// Web links in a message open in a new tab; everything else is plain text.
function MessageText({ text }) {
  const parts = text.split(/(https?:\/\/[^\s<>"]+)/g);
  return (
    <p className="tr-chat-text">
      {parts.map((p, i) => (i % 2 === 1
        ? <a key={i} href={p} target="_blank" rel="noopener noreferrer">{p.replace(/^https?:\/\//, '').replace(/[.,!?)]+$/, '')}</a>
        : <Fragment key={i}>{p}</Fragment>))}
    </p>
  );
}

// Keeps the chat exactly as tall as the space left on screen, so the
// messages scroll and the box to type in stays put.
function useFillHeight(ref) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => {
      // The page's own bottom padding already clears the phone's tab bar.
      const main = el.closest('.tr-main');
      const pad = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 16;
      const top = el.getBoundingClientRect().top + window.scrollY;
      el.style.height = `${Math.max(360, window.innerHeight - top - pad)}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    const t = setTimeout(fit, 300);
    return () => { window.removeEventListener('resize', fit); clearTimeout(t); };
  });
}

function RulesCard({ onAgree, busy, error, readOnly = false, onClose }) {
  return (
    <div className={readOnly ? 'tr-chat-rules' : 'tr-card tr-chat-rules'}>
      <div className="tr-chat-rules-icon"><ShieldCheck size={22} aria-hidden="true" /></div>
      <h2 className="tr-h2" id="tr-chat-rules-title">Chat rules</h2>
      <p>Chat is for everyone at Big Insurance Network. {readOnly ? 'Everyone agreed to these before joining:' : 'Before you join, please agree to these:'}</p>
      <ul>
        <li><strong>Be respectful.</strong> No harassment, bullying, threats, hate or discrimination.</li>
        <li><strong>Keep it clean.</strong> No sexual, violent or graphic content, and no spam.</li>
        <li><strong>Keep clients private.</strong> Never post a client's Social Security number, date of birth, health details, policy numbers or other personal information.</li>
        <li><strong>Urgent help is for things that can't wait.</strong> Your manager and their leader get an email when you post there.</li>
        <li><strong>Report anything that breaks these rules</strong> with ⋯ on the message. Super admins review every report within 24 hours and remove the message, and the person, when it breaks them.</li>
        <li><strong>Block anyone</strong> you don't want to hear from. You won't see their messages.</li>
        <li><strong>Chat keeps 90 days.</strong> Older messages are deleted automatically, so save anything you need somewhere else.</li>
      </ul>
      <p className="tr-chat-rules-zero">There is no tolerance for objectionable content or abusive behavior. Breaking these rules can lose you access to PaceLedger.</p>
      {error ? <div className="tr-error">{error}</div> : null}
      {readOnly
        ? <button type="button" className="tr-btn tr-btn-ghost" onClick={onClose}>Close</button>
        : <button type="button" className="tr-btn tr-btn-brass" onClick={onAgree} disabled={busy}>{busy ? 'Saving…' : 'I agree'}</button>}
    </div>
  );
}

function ReportDialog({ message, name, onClose, onBlock }) {
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  async function send() {
    setBusy(true); setError('');
    const res = await reportChatMessage(message.id, [reason, detail.trim()].filter(Boolean).join(': '));
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setDone(true);
  }
  return (
    <Modal onClose={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="tr-chat-report-title">
        <div className="tr-row-head">
          <h3 className="tr-h3" id="tr-chat-report-title" style={{ margin: 0 }}>{done ? 'Thanks for reporting it' : `Report ${first(name)}'s message`}</h3>
          <button type="button" className="tr-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        {done ? (
          <>
            <p className="tr-chat-dialog-p">A super admin will look at it within 24 hours and remove it if it breaks the chat rules.</p>
            <p className="tr-chat-dialog-p">Don't want to see {first(name)}'s messages at all? You can block them.</p>
            <div className="tr-chat-dialog-actions">
              <button type="button" className="tr-btn tr-btn-ghost" onClick={() => { onBlock(); onClose(); }}>Block {first(name)}</button>
              <button type="button" className="tr-btn tr-btn-brass" onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <>
            <blockquote className="tr-chat-quote">{message.body}</blockquote>
            <fieldset className="tr-chat-reasons">
              <legend>What's wrong with it?</legend>
              {REASONS.map(r => (
                <label key={r}><input type="radio" name="tr-chat-reason" value={r} checked={reason === r} onChange={() => setReason(r)} /> {r}</label>
              ))}
            </fieldset>
            <label className="tr-field">
              <span>Anything else? (optional)</span>
              <textarea rows={2} maxLength={400} value={detail} onChange={e => setDetail(e.target.value)} />
            </label>
            {error ? <div className="tr-error">{error}</div> : null}
            <div className="tr-chat-dialog-actions">
              <button type="button" className="tr-btn tr-btn-ghost" onClick={onClose}>Cancel</button>
              <button type="button" className="tr-btn tr-btn-brass" onClick={send} disabled={!reason || busy}>{busy ? 'Sending…' : 'Report'}</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function BlockedDialog({ blocked, people, onUnblock, onClose }) {
  return (
    <Modal onClose={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="tr-chat-blocked-title">
        <div className="tr-row-head">
          <h3 className="tr-h3" id="tr-chat-blocked-title" style={{ margin: 0 }}>Blocked people</h3>
          <button type="button" className="tr-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        {blocked.length === 0 ? (
          <p className="tr-chat-dialog-p">You haven't blocked anyone. To block someone, tap ⋯ on one of their messages.</p>
        ) : (
          <>
            <p className="tr-chat-dialog-p">You don't see their messages in Chat. They aren't told.</p>
            <ul className="tr-chat-blocked">
              {blocked.map(id => (
                <li key={id}>
                  <span>{(people.get(id) || {}).display_name || 'Someone'}</span>
                  <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => onUnblock(id)}>Unblock</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}

function Reports({ people, onChanged }) {
  const [reports, setReports] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const res = await fetchOpenChatReports();
    setReports(res.reports);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function resolve(id, remove) {
    setBusy(id); setError('');
    const res = await resolveChatReport(id, remove);
    setBusy(null);
    if (!res.ok) { setError(res.error); return; }
    await load();
    onChanged();
  }
  if (!reports) return <div className="tr-chat-reports"><SkelBlock w="100%" h="120px" /></div>;
  // One card per message, however many people reported it.
  const byMessage = new Map();
  reports.forEach(r => { if (!byMessage.has(r.message_id)) byMessage.set(r.message_id, []); byMessage.get(r.message_id).push(r); });
  const name = id => (people.get(id) || {}).display_name || 'Someone';
  return (
    <div className="tr-chat-reports">
      {error ? <div className="tr-error">{error}</div> : null}
      {byMessage.size === 0 ? (
        <div className="tr-card"><p className="tr-empty" style={{ margin: 0 }}>No reports waiting. When someone reports a message, it shows up here and the super admins get an email.</p></div>
      ) : [...byMessage.values()].map(list => {
        const r = list[0];
        const chan = CHAT_CHANNELS.find(c => c.key === r.channel);
        return (
          <div key={r.message_id} className="tr-card tr-chat-report">
            <div className="tr-chat-report-meta">
              <strong>{name(r.message_author)}</strong> in {chan ? chan.label : 'Chat'}{r.postedAt ? ` · ${dayLabel(r.postedAt)}, ${timeOf(r.postedAt)}` : ''}
            </div>
            <blockquote className="tr-chat-quote">{r.message_body}</blockquote>
            <ul className="tr-chat-report-why">
              {list.map(x => <li key={x.id}><strong>{name(x.reporter_id)}</strong>: {x.reason || 'No reason given'}</li>)}
            </ul>
            <div className="tr-chat-dialog-actions">
              <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" disabled={busy === r.id} onClick={() => resolve(r.id, false)}>Keep it</button>
              <button type="button" className="tr-btn tr-btn-danger tr-btn-sm" disabled={busy === r.id} onClick={() => resolve(r.id, true)}>Remove message</button>
            </div>
          </div>
        );
      })}
      <p className="tr-chat-report-foot">Removing a message erases its text for everyone. To take away someone's access, delete them in Manage Team.</p>
    </div>
  );
}

export function ChatBody({ user, initialChannel, onIntentConsumed }) {
  const isPhone = useIsPhone();
  const isAdmin = user.role === 'super_admin';
  const startChannel = ['megaphone', 'general', 'work', 'urgent'].includes(initialChannel) || (initialChannel === 'reports' && isAdmin) ? initialChannel : 'general';
  const [accepted, setAccepted] = useState(null); // null = checking
  const [agreeBusy, setAgreeBusy] = useState(false);
  const [agreeError, setAgreeError] = useState('');
  const [channel, setChannel] = useState(startChannel);
  const [phoneList, setPhoneList] = useState(!initialChannel);
  const [byChannel, setByChannel] = useState({}); // channel -> { messages, more, loading }
  const [people, setPeople] = useState(new Map());
  const avatars = useAvatars();
  const announcements = useAnnouncements(user);
  const [blocked, setBlocked] = useState([]);
  const [unread, setUnread] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [notice, setNotice] = useState('');
  const [reporting, setReporting] = useState(null);
  const [showBlocked, setShowBlocked] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [newBelow, setNewBelow] = useState(false);
  const shell = useRef(null);
  const scroller = useRef(null);
  const atBottom = useRef(true);
  const keepOffset = useRef(null);
  useFillHeight(shell);

  useEffect(() => { if (initialChannel) onIntentConsumed?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Opened again from an email link or the top bar while already here.
  useEffect(() => {
    if (initialChannel && (initialChannel !== 'reports' || isAdmin)) { setChannel(initialChannel); setPhoneList(false); onIntentConsumed?.(); }
  }, [initialChannel]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    Promise.all([fetchChatRulesAccepted(user.id), fetchHierarchyPeopleShared(), fetchChatBlocks(user.id)]).then(([rules, list, blocks]) => {
      if (!alive) return;
      setAccepted(rules.ok ? rules.accepted : false);
      setPeople(new Map((list || []).map(p => [p.id, p])));
      setBlocked(blocks);
    });
    return () => { alive = false; };
  }, [user.id]);

  const refreshUnread = useCallback(() => { fetchChatUnread().then(u => { if (u) setUnread(u); }); }, []);
  useEffect(() => { refreshUnread(); }, [refreshUnread, channel]);

  const load = useCallback(async (ch, { earlier = false } = {}) => {
    if (NOT_MESSAGES.has(ch)) return;
    const current = byChannel[ch];
    if (earlier) {
      const oldest = current && current.messages[0];
      if (!oldest) return;
      const el = scroller.current;
      keepOffset.current = el ? el.scrollHeight - el.scrollTop : null;
      const res = await fetchChatMessages(ch, { before: oldest.createdAt });
      setByChannel(prev => ({ ...prev, [ch]: { ...prev[ch], messages: [...res.messages, ...prev[ch].messages], more: res.more } }));
      return;
    }
    const res = await fetchChatMessages(ch);
    if (!res.ok) {
      // Offline for a moment: keep what's on screen.
      setByChannel(prev => ({ ...prev, [ch]: prev[ch] ? { ...prev[ch], failed: true } : { messages: [], more: false, failed: true } }));
      return;
    }
    setByChannel(prev => {
      const had = prev[ch] && prev[ch].messages ? prev[ch].messages : [];
      // Keep earlier pages that are already loaded; take the newest from the server.
      const ids = new Set(res.messages.map(m => m.id));
      const keep = had.filter(m => !ids.has(m.id) && res.messages.length && m.createdAt < res.messages[0].createdAt);
      return { ...prev, [ch]: { messages: [...keep, ...res.messages], more: keep.length ? prev[ch].more : res.more, failed: false } };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byChannel]);
  const loadRef = useRef(load);
  loadRef.current = load;

  // Open a chat: load it, then keep it fresh (live updates come through the
  // top bar's connection; this is the backup if that connection drops).
  useEffect(() => {
    if (!accepted || NOT_MESSAGES.has(channel)) return undefined;
    atBottom.current = true;
    setNewBelow(false);
    loadRef.current(channel);
    const t = setInterval(() => { if (document.visibilityState === 'visible') loadRef.current(channel); }, POLL_MS);
    return () => clearInterval(t);
  }, [channel, accepted]);

  // Live messages, passed along by the top bar.
  useEffect(() => {
    const on = e => {
      const { message } = e.detail || {};
      if (!message) return;
      setByChannel(prev => {
        const cur = prev[message.channel];
        if (!cur) return prev;
        const i = cur.messages.findIndex(m => m.id === message.id);
        const messages = i >= 0 ? cur.messages.map(m => (m.id === message.id ? message : m)) : [...cur.messages, message];
        return { ...prev, [message.channel]: { ...cur, messages } };
      });
      if (message.channel !== channel) refreshUnread();
    };
    window.addEventListener('paceledger:chat-message', on);
    return () => window.removeEventListener('paceledger:chat-message', on);
  }, [channel, refreshUnread]);

  const blockedSet = useMemo(() => new Set(blocked), [blocked]);
  const current = byChannel[channel];
  const messages = useMemo(() => (current ? current.messages.filter(m => !blockedSet.has(m.userId)) : []), [current, blockedSet]);
  const lastId = messages.length ? messages[messages.length - 1].id : null;

  // Stay at the newest message, unless you've scrolled up to read.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (keepOffset.current != null) { el.scrollTop = el.scrollHeight - keepOffset.current; keepOffset.current = null; return; }
    if (atBottom.current) el.scrollTop = el.scrollHeight;
    else if (lastId) setNewBelow(true);
  }, [lastId, messages.length, channel, phoneList]);

  // Reading the newest message marks the chat read.
  useEffect(() => {
    if (!accepted || NOT_MESSAGES.has(channel) || !lastId || !atBottom.current) return undefined;
    const t = setTimeout(() => { markChatRead(channel).then(refreshUnread); }, 800);
    return () => clearTimeout(t);
  }, [accepted, channel, lastId, refreshUnread]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    atBottom.current = bottom;
    if (bottom && newBelow) { setNewBelow(false); markChatRead(channel).then(refreshUnread); }
  }
  function toBottom() {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    atBottom.current = true;
    setNewBelow(false);
    markChatRead(channel).then(refreshUnread);
  }

  function pick(ch) {
    atBottom.current = true;
    setChannel(ch);
    setPhoneList(false);
    setSendError('');
    setNotice('');
  }

  // Who an Urgent help post emails: your manager and theirs, or the super admins.
  const urgentTo = useMemo(() => {
    const me = people.get(user.id);
    const mgr = me && me.manager_id ? people.get(me.manager_id) : null;
    const above = mgr && mgr.manager_id && mgr.manager_id !== user.id ? people.get(mgr.manager_id) : null;
    const names = [mgr, above].filter(Boolean).map(p => p.display_name);
    return names.length ? names.join(' and ') : 'the super admins';
  }, [people, user.id]);

  const draft = drafts[channel] || '';
  async function send(e) {
    if (e) e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true); setSendError(''); setNotice('');
    const res = await postChatMessage(channel, text);
    setSending(false);
    if (!res.ok) { setSendError(res.error); return; }
    setDrafts(d => ({ ...d, [channel]: '' }));
    atBottom.current = true;
    setByChannel(prev => {
      const cur = prev[channel] || { messages: [], more: false };
      if (cur.messages.some(m => m.id === res.message.id)) return prev;
      return { ...prev, [channel]: { ...cur, messages: [...cur.messages, res.message] } };
    });
    if (channel === 'urgent') {
      setNotice(`Emailing ${urgentTo}…`);
      const out = await notifyUrgent(res.message.id);
      if (out.ok && out.emailed) setNotice(`Emailed ${(out.to && out.to.length ? out.to.join(' and ') : urgentTo)}. They'll see your message here too.`);
      else if (out.ok && out.reason === 'recent') setNotice(`${out.to && out.to.length ? out.to.join(' and ') : 'Your leaders'} got an email about your last Urgent help message a few minutes ago, so no new email went out.`);
      else setNotice("Your message is posted, but the email to your leaders didn't go out. If it can't wait, call them.");
    }
  }
  function onKey(e) {
    // Enter sends on a computer; on a phone, Enter adds a line and the button sends.
    if (e.key === 'Enter' && !e.shiftKey && !isPhone && !e.nativeEvent.isComposing) send(e);
  }

  async function remove(m) {
    const mine = m.userId === user.id;
    if (!window.confirm(mine ? 'Delete this message? Everyone will see "Message removed".' : `Remove ${first((people.get(m.userId) || {}).display_name)}'s message for everyone?`)) return;
    const res = await deleteChatMessage(m.id);
    if (!res.ok) { setSendError(res.error); return; }
    setByChannel(prev => ({ ...prev, [m.channel]: { ...prev[m.channel], messages: prev[m.channel].messages.map(x => (x.id === m.id ? { ...x, body: '', deletedAt: new Date().toISOString() } : x)) } }));
  }
  async function block(id) {
    const name = (people.get(id) || {}).display_name || 'them';
    const res = await blockChatUser(user.id, id);
    if (!res.ok) { setSendError(res.error); return; }
    setBlocked(b => (b.includes(id) ? b : [...b, id]));
    setNotice(`You blocked ${name}. Unblock them any time in Blocked people.`);
    refreshUnread();
  }
  async function confirmBlock(id) {
    const name = first((people.get(id) || {}).display_name);
    if (window.confirm(`Block ${name}? You won't see ${name}'s messages in Chat. They aren't told, and you can unblock them later.`)) block(id);
  }
  async function unblock(id) {
    const res = await unblockChatUser(user.id, id);
    if (!res.ok) return;
    setBlocked(b => b.filter(x => x !== id));
    loadRef.current(channel);
    refreshUnread();
  }

  async function agree() {
    setAgreeBusy(true); setAgreeError('');
    const res = await acceptChatRules();
    setAgreeBusy(false);
    if (!res.ok) { setAgreeError(res.error); return; }
    setAccepted(true);
  }

  if (accepted === null) return <div className="tr-chat-loading"><SkelBlock w="100%" h="420px" /></div>;
  if (!accepted) return <div className="tr-chat-gate"><RulesCard onAgree={agree} busy={agreeBusy} error={agreeError} /></div>;

  const channels = [{ key: 'megaphone', label: 'MegaPhone', about: MEGAPHONE_ABOUT }, ...CHAT_CHANNELS, ...(isAdmin ? [{ key: 'reports', label: 'Reports', about: 'Messages people reported. Remove them or keep them.' }] : [])];
  const info = channels.find(c => c.key === channel) || channels[1];
  // MegaPhone counts the announcements you haven't confirmed yet.
  const count = k => (k === 'megaphone' ? waitingFor(announcements, user).length : unread ? unread[k] || 0 : 0);
  const name = id => (people.get(id) || {}).display_name || 'Someone';
  const roleTag = id => { const r = (people.get(id) || {}).role; return r === 'super_admin' ? 'Admin' : r === 'manager' ? 'Manager' : null; };

  const side = (
    <aside className="tr-chat-side" aria-label="Chats">
      <div className="tr-chat-side-title">Chat</div>
      {channels.map(c => {
        const Icon = ICONS[c.key];
        const n = count(c.key);
        return (
          <button key={c.key} type="button" className={`tr-chat-chan ${c.key === channel && !(isPhone && phoneList) ? 'tr-chat-chan-on' : ''} ${n ? 'tr-chat-chan-unread' : ''}`}
            aria-current={c.key === channel ? 'page' : undefined} onClick={() => pick(c.key)}>
            <Icon size={16} aria-hidden="true" />
            <span className="tr-chat-chan-text"><span className="tr-chat-chan-label">{c.label}</span>{isPhone ? <span className="tr-chat-chan-about">{c.about}</span> : null}</span>
            {n ? <span className={`tr-chat-count ${c.key === 'urgent' || c.key === 'reports' ? 'tr-chat-count-hot' : ''}`}>{n > 99 ? '99+' : n}</span> : null}
          </button>
        );
      })}
      <div className="tr-chat-side-foot">
        <button type="button" className="tr-link-btn" onClick={() => setShowBlocked(true)}>Blocked people{blocked.length ? ` (${blocked.length})` : ''}</button>
        <button type="button" className="tr-link-btn" onClick={() => setShowRules(true)}>Chat rules</button>
      </div>
    </aside>
  );

  // The conversation, one row per message; a name only where the sender changes.
  const rows = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    if (!prev || !sameDay(prev.createdAt, m.createdAt)) rows.push(<div key={`d-${m.id}`} className="tr-chat-day"><span>{dayLabel(m.createdAt)}</span></div>);
    const grouped = prev && prev.userId === m.userId && sameDay(prev.createdAt, m.createdAt) && new Date(m.createdAt) - new Date(prev.createdAt) < GROUP_MS;
    const mine = m.userId === user.id;
    const items = m.deletedAt ? [] : [
      !mine && { label: 'Report message', onClick: () => setReporting(m) },
      !mine && { label: `Block ${first(name(m.userId))}`, onClick: () => confirmBlock(m.userId) },
      (mine || isAdmin) && { label: mine ? 'Delete message' : 'Remove message', onClick: () => remove(m) },
    ];
    const tag = roleTag(m.userId);
    rows.push(
      <div key={m.id} className={`tr-chat-msg ${grouped ? '' : 'tr-chat-msg-first'} ${mine ? 'tr-chat-msg-mine' : ''}`}>
        {grouped
          ? <span className="tr-chat-gutter" aria-hidden="true"><time>{timeOf(m.createdAt)}</time></span>
          : <Avatar url={avatars.get(m.userId)} className="tr-chat-avatar" style={{ background: avatarColor(m.userId) }}>{initials(name(m.userId))}</Avatar>}
        <div className="tr-chat-msg-main">
          {grouped ? null : (
            <div className="tr-chat-meta">
              <strong>{mine ? `${name(m.userId)} (you)` : name(m.userId)}</strong>
              {tag ? <span className="tr-chat-tag">{tag}</span> : null}
              <time dateTime={m.createdAt}>{timeOf(m.createdAt)}</time>
            </div>
          )}
          {m.deletedAt ? <p className="tr-chat-text tr-chat-removed">Message removed</p> : <MessageText text={m.body} />}
        </div>
        <div className="tr-chat-actions"><MoreMenu items={items} label="Message options" /></div>
      </div>,
    );
  });

  const conversation = channel === 'megaphone' ? (
    <MegaPhoneRoom user={user} isPhone={isPhone} onBack={() => setPhoneList(true)} />
  ) : channel === 'reports' ? (
    <section className="tr-chat-main" aria-label="Reports">
      <header className="tr-chat-head">
        {isPhone ? <button type="button" className="tr-icon-btn" onClick={() => setPhoneList(true)} aria-label="All chats"><ArrowLeft size={18} /></button> : null}
        <div><h2 className="tr-chat-title">Reports</h2><p className="tr-chat-about">{info.about}</p></div>
      </header>
      <div className="tr-chat-scroll"><Reports people={people} onChanged={() => { refreshUnread(); setByChannel({}); }} /></div>
    </section>
  ) : (
    <section className={`tr-chat-main ${channel === 'urgent' ? 'tr-chat-main-urgent' : ''}`} aria-label={info.label}>
      <header className="tr-chat-head">
        {isPhone ? <button type="button" className="tr-icon-btn" onClick={() => setPhoneList(true)} aria-label="All chats"><ArrowLeft size={18} /></button> : null}
        <div>
          <h2 className="tr-chat-title">{channel === 'urgent' ? <LifeBuoy size={17} aria-hidden="true" /> : null}{info.label}</h2>
          <p className="tr-chat-about">{info.about}</p>
        </div>
      </header>
      <div className="tr-chat-scroll" ref={scroller} onScroll={onScroll} aria-live="polite">
        {!current ? <SkelBlock w="100%" h="160px" /> : (
          <>
            {current.more ? <button type="button" className="tr-link-btn tr-chat-earlier" onClick={() => load(channel, { earlier: true })}>Show earlier messages</button> : null}
            {current.failed && !messages.length ? <p className="tr-error">Couldn't load messages. Check your connection; it tries again on its own.</p> : null}
            {!current.failed && !messages.length ? (
              <div className="tr-chat-empty">
                <p><strong>No messages yet.</strong></p>
                <p>{channel === 'urgent' ? `Post here when you need help right away. ${urgentTo === 'the super admins' ? 'The super admins' : urgentTo} will get an email.` : 'Say hi to the team.'}</p>
              </div>
            ) : rows}
          </>
        )}
      </div>
      {newBelow ? <button type="button" className="tr-chat-newpill" onClick={toBottom}><ArrowDown size={14} /> New messages</button> : null}
      <form className="tr-chat-compose" onSubmit={send}>
        {notice ? <p className="tr-chat-notice" role="status">{notice}</p> : null}
        {sendError ? <p className="tr-chat-senderr" role="alert">{sendError}</p> : null}
        {channel === 'urgent' && !notice ? <p className="tr-chat-urgent-note"><LifeBuoy size={14} aria-hidden="true" /> Posting here emails {urgentTo}.</p> : null}
        <div className="tr-chat-compose-row">
          <textarea
            value={draft} rows={1} maxLength={CHAT_MAX_LENGTH} aria-label={`Message ${info.label}`}
            placeholder={channel === 'urgent' ? 'What do you need help with?' : `Message ${info.label}`}
            onChange={e => { setDrafts(d => ({ ...d, [channel]: e.target.value })); setSendError(''); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`; }}
            onKeyDown={onKey} />
          <button type="submit" className="tr-btn tr-btn-brass tr-chat-send" disabled={!draft.trim() || sending} aria-label="Send">
            <Send size={16} aria-hidden="true" /><span className="tr-hide-mobile">Send</span>
          </button>
        </div>
        {draft.length > CHAT_MAX_LENGTH - 200 ? <span className="tr-chat-left">{CHAT_MAX_LENGTH - draft.length} characters left</span> : null}
      </form>
    </section>
  );

  return (
    <div className="tr-chat" ref={shell}>
      {isPhone ? (phoneList ? side : conversation) : <>{side}{conversation}</>}
      {reporting ? <ReportDialog message={reporting} name={name(reporting.userId)} onClose={() => setReporting(null)} onBlock={() => block(reporting.userId)} /> : null}
      {showBlocked ? <BlockedDialog blocked={blocked} people={people} onUnblock={unblock} onClose={() => setShowBlocked(false)} /> : null}
      {showRules ? <Modal onClose={() => setShowRules(false)}><RulesCard readOnly onClose={() => setShowRules(false)} /></Modal> : null}
    </div>
  );
}
