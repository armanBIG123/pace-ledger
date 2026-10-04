import { supabase } from './supabaseClient.js';

// Dated running log of follow-up notes per appointment (see
// migration-follow-up-notes.sql). Reads are scoped by RLS to whoever can
// already see the appointment; only its owner can add or delete.

// One query for all of a person's appointments (joins through the
// appointment so a long list of ids never has to go in the URL).
export async function fetchMyFollowUpNotes(userId) {
  const { data, error } = await supabase
    .from('follow_up_notes')
    .select('id, appointment_id, author_id, author_name, note, created_at, appointments!inner(user_id)')
    .eq('appointments.user_id', userId)
    .order('created_at', { ascending: false });
  if (error) { console.error(error); return []; }
  return data.map(({ appointments, ...row }) => row);
}
export async function addFollowUpNote({ appointmentId, authorId, authorName, note }) {
  const { data, error } = await supabase
    .from('follow_up_notes')
    .insert({ appointment_id: appointmentId, author_id: authorId, author_name: authorName || null, note: note.trim() })
    .select('id, appointment_id, author_id, author_name, note, created_at').single();
  if (error) { console.error(error); return { ok: false, error: error.message }; }
  return { ok: true, record: data };
}
export async function deleteFollowUpNote(id) {
  const { error } = await supabase.from('follow_up_notes').delete().eq('id', id);
  return !error;
}
