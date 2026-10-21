// The chat button in the top bar, with the number of messages you haven't
// read. Red when something's waiting in Urgent help (or, for super admins,
// a report).
import { useCallback, useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { fetchChatUnread, subscribeChat } from '../data/chat.js';
import { useAnnouncements, waitingFor } from '../data/announcements.js';

// Unread counts, kept fresh: right away when a message arrives, when you come
// back to the app, and once a minute otherwise. Each live message is also
// passed on to the Chat screen if it's open ('paceledger:chat-message').
// megaphone: the announcements you haven't confirmed yet.
export function useChatUnread(user) {
  const [counts, setCounts] = useState(null);
  const announcements = useAnnouncements(user);
  const megaphone = waitingFor(announcements, user).length;
  const refresh = useCallback(() => { fetchChatUnread().then(c => setCounts(c)); }, []);
  useEffect(() => {
    refresh();
    let timer = null;
    const soon = () => { clearTimeout(timer); timer = setTimeout(refresh, 600); };
    const stop = subscribeChat(evt => {
      window.dispatchEvent(new CustomEvent('paceledger:chat-message', { detail: evt }));
      if (evt.message.userId !== user.id) soon();
    });
    const back = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    window.addEventListener('paceledger:chat-read', soon);
    const every = setInterval(back, 60000);
    return () => {
      stop();
      clearTimeout(timer);
      clearInterval(every);
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener('focus', back);
      window.removeEventListener('paceledger:chat-read', soon);
    };
  }, [refresh, user.id]);
  if (!megaphone) return counts;
  return { general: 0, work: 0, urgent: 0, reports: 0, ...(counts || {}), megaphone };
}

export function ChatButton({ counts, onOpen, active = false }) {
  const total = counts ? counts.general + counts.work + counts.urgent + counts.reports + (counts.megaphone || 0) : 0;
  const hot = !!counts && (counts.urgent > 0 || counts.reports > 0);
  return (
    <button type="button" className={`tr-icon-btn tr-header-chat ${active ? 'tr-header-chat-on' : ''}`} onClick={onOpen}
      aria-label={total ? `Chat, ${total} unread` : 'Chat'} title="Chat" aria-current={active ? 'page' : undefined}>
      <MessageCircle size={18} aria-hidden="true" />
      {total ? <span className={`tr-header-chat-badge ${hot ? 'tr-header-chat-badge-hot' : ''}`}>{total > 99 ? '99+' : total}</span> : null}
    </button>
  );
}
