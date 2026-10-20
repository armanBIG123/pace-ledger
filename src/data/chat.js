// Chat: General, Work and Urgent help for everyone in the agency. Writing
// goes through database functions (migration-chat.sql) that check who you
// are, mask filtered words and keep blocked people's messages away from you.
import { supabase } from '../supabaseClient.js';

export const CHAT_CHANNELS = [
  { key: 'general', label: 'General', about: 'Everyone in the agency. Say hi, share news.' },
  { key: 'work', label: 'Work', about: 'Questions about products, apps, carriers and appointments.' },
  { key: 'urgent', label: 'Urgent help', about: "Need a hand right now? Your leaders get an email the moment you post." },
];
export const CHAT_MAX_LENGTH = 2000;
const PAGE = 60;

function toMessage(row) {
  return {
    id: row.id,
    channel: row.channel,
    userId: row.user_id,
    body: row.body || '',
    createdAt: row.created_at,
    deletedAt: row.deleted_at || null,
  };
}

// Plain-language versions of the database's error codes.
const ERRORS = {
  rules_not_accepted: 'Agree to the chat rules first.',
  empty: 'Type a message first.',
  too_long: `Messages can be up to ${CHAT_MAX_LENGTH.toLocaleString()} characters.`,
  slow_down: "You're sending a lot of messages. Wait a minute and try again.",
  own_message: "You can't report your own message.",
  not_found: 'That message was removed.',
  not_allowed: "You can't do that.",
};
const say = error => {
  const code = Object.keys(ERRORS).find(k => String(error && error.message || '').includes(k));
  return code ? ERRORS[code] : "Couldn't reach PaceLedger. Check your connection and try again.";
};

export async function fetchChatRulesAccepted(userId) {
  const { data, error } = await supabase.from('chat_rules').select('accepted_at').eq('user_id', userId).maybeSingle();
  if (error) return { ok: false };
  return { ok: true, accepted: !!data };
}

export async function acceptChatRules() {
  const { error } = await supabase.rpc('accept_chat_rules');
  return error ? { ok: false, error: say(error) } : { ok: true };
}

// The newest messages in a chat (oldest first), or the ones before a time.
export async function fetchChatMessages(channel, { before = null, limit = PAGE } = {}) {
  let q = supabase.from('chat_messages').select('id, channel, user_id, body, created_at, deleted_at').eq('channel', channel);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);
  if (error) return { ok: false, messages: [] };
  const rows = (data || []).slice(0, limit).map(toMessage).reverse();
  return { ok: true, messages: rows, more: (data || []).length >= limit };
}

export async function postChatMessage(channel, body) {
  const { data, error } = await supabase.rpc('post_chat_message', { p_channel: channel, p_body: body });
  if (error || !data) return { ok: false, error: say(error) };
  return { ok: true, message: toMessage(Array.isArray(data) ? data[0] : data) };
}

export async function deleteChatMessage(id) {
  const { error } = await supabase.rpc('delete_chat_message', { p_message: id });
  return error ? { ok: false, error: say(error) } : { ok: true };
}

export async function reportChatMessage(id, reason) {
  const { data, error } = await supabase.rpc('report_chat_message', { p_message: id, p_reason: reason });
  if (error) return { ok: false, error: say(error) };
  // The super admins get an email; the report is saved either way.
  callChatNotify({ reportId: data });
  return { ok: true };
}

export async function fetchChatBlocks(userId) {
  const { data, error } = await supabase.from('chat_blocks').select('blocked_id, created_at').eq('blocker_id', userId);
  if (error) return [];
  return (data || []).map(r => r.blocked_id);
}

export async function blockChatUser(userId, blockedId) {
  const { error } = await supabase.from('chat_blocks').insert({ blocker_id: userId, blocked_id: blockedId });
  return error && !String(error.message || '').includes('duplicate') ? { ok: false, error: say(error) } : { ok: true };
}

export async function unblockChatUser(userId, blockedId) {
  const { error } = await supabase.from('chat_blocks').delete().eq('blocker_id', userId).eq('blocked_id', blockedId);
  return error ? { ok: false, error: say(error) } : { ok: true };
}

// Super admins: reports still waiting, newest first.
export async function fetchOpenChatReports() {
  const { data, error } = await supabase.from('chat_reports')
    .select('id, message_id, reporter_id, reason, message_body, message_author, created_at')
    .is('resolved_at', null).order('created_at', { ascending: false });
  if (error) return { ok: false, reports: [] };
  const ids = [...new Set((data || []).map(r => r.message_id))];
  let channels = new Map();
  if (ids.length) {
    const { data: msgs } = await supabase.from('chat_messages').select('id, channel, created_at').in('id', ids);
    channels = new Map((msgs || []).map(m => [m.id, m]));
  }
  return { ok: true, reports: (data || []).map(r => ({ ...r, channel: channels.get(r.message_id)?.channel || null, postedAt: channels.get(r.message_id)?.created_at || null })) };
}

export async function resolveChatReport(id, remove) {
  const { error } = await supabase.rpc('resolve_chat_report', { p_report: id, p_remove: !!remove });
  return error ? { ok: false, error: say(error) } : { ok: true };
}

export async function markChatRead(channel) {
  await supabase.rpc('mark_chat_read', { p_channel: channel });
  window.dispatchEvent(new CustomEvent('paceledger:chat-read', { detail: { channel } }));
}

// { general, work, urgent, reports } or null if Chat isn't set up yet.
export async function fetchChatUnread() {
  const { data, error } = await supabase.rpc('chat_unread_counts');
  if (error || !data || typeof data !== 'object') return null;
  return { general: data.general || 0, work: data.work || 0, urgent: data.urgent || 0, reports: data.reports || 0 };
}

// Live updates: calls onChange({ type, message }) for every new, changed or
// removed message you're allowed to see. Returns a function that stops it.
export function subscribeChat(onChange) {
  if (!supabase.channel) return () => {};
  const ch = supabase.channel(`chat-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, payload => {
      if (payload && payload.new && payload.new.id) onChange({ type: payload.eventType, message: toMessage(payload.new) });
    })
    .subscribe();
  return () => { try { supabase.removeChannel(ch); } catch { /* already closed */ } };
}

// Emails for Urgent help and reports (supabase/functions/chat-notify).
async function callChatNotify(body) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { ok: false, error: 'not_signed_in' };
  try {
    const res = await fetch(`${supabase.supabaseUrl}/functions/v1/chat-notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData.session.access_token}`, apikey: supabase.supabaseKey },
      body: JSON.stringify(body),
    });
    const out = await res.json().catch(() => null);
    if (!out || typeof out.ok !== 'boolean') return { ok: false, error: res.status === 404 ? 'function_missing' : 'request_failed' };
    return out;
  } catch {
    return { ok: false, error: 'request_failed' };
  }
}

export function notifyUrgent(messageId) {
  return callChatNotify({ messageId });
}
