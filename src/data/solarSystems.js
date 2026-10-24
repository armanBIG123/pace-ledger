// Solar systems (see migration-solar-systems.sql): the partner groups in
// the Galaxy. Super admins see every one; everyone else, their own.
import { supabase } from '../supabaseClient.js';

const missing = error => !!error && (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202' || /does not exist|could not find/i.test(error.message || ''));

// [{ id, short_name, name }], or [] before the database update.
export async function fetchSolarSystems() {
  const { data, error } = await supabase.from('solar_systems').select('id, short_name, name').order('created_at');
  if (error) { if (!missing(error)) console.error(error); return []; }
  return data || [];
}

// Super admins: look at one solar system (or null: all of them).
export async function setViewingSystem(systemId) {
  const { error } = await supabase.rpc('set_viewing_system', { p_system: systemId || null });
  if (error) { console.error(error); return false; }
  return true;
}

// A sign-up link for someone to lead a solar system as its Super Manager
// (super admins only).
export async function createLeaderInvite({ creatorId, systemId, name }) {
  const { data, error } = await supabase.from('recruit_invites').insert({
    upline_id: creatorId, created_by: creatorId, invitee_name: (name || '').trim() || null,
    solar_system_id: systemId, invite_role: 'super_manager',
  }).select().single();
  if (error) { console.error(error); return { ok: false, error: error.message }; }
  return { ok: true, invite: data };
}

// Move someone (and everyone under them) to another solar system. They
// report to no one there until a leader is picked.
export async function moveToSystem(personId, systemId) {
  const { error } = await supabase.from('profiles').update({ solar_system_id: systemId, manager_id: null }).eq('id', personId);
  return error ? error.message : null;
}
