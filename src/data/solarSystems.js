// Solar systems (see migration-solar-systems.sql): the partner groups in
// the Galaxy. Super admins see every one; everyone else, their own.
import { supabase } from '../supabaseClient.js';
import { tidyName } from '../lib/names.js';

const missing = error => !!error && (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202' || /does not exist|could not find/i.test(error.message || ''));

// [{ id, short_name, name }], or [] before the database update.
export async function fetchSolarSystems() {
  const { data, error } = await supabase.from('solar_systems').select('id, short_name, name').order('created_at');
  if (error) { if (!missing(error)) console.error(error); return []; }
  return data || [];
}

// A sign-up link for someone to lead a solar system as its Super Manager
// (super admins only).
export async function createLeaderInvite({ creatorId, systemId, name }) {
  const { data, error } = await supabase.from('recruit_invites').insert({
    upline_id: creatorId, created_by: creatorId, invitee_name: tidyName(name || '') || null,
    solar_system_id: systemId, invite_role: 'super_manager',
  }).select().single();
  if (error) { console.error(error); return { ok: false, error: error.message }; }
  return { ok: true, invite: data };
}

// Move someone (and everyone under them) to another solar system. They
// report to no one there until a leader is picked.
export async function moveToSystem(personId, systemId) {
  const { error } = await supabase.rpc('move_to_solar_system', { p_person: personId, p_system: systemId });
  if (!error) return null;
  if (!missing(error)) return error.message;
  // Before migration-solar-system-tabs.sql.
  const res = await supabase.from('profiles').update({ solar_system_id: systemId, manager_id: null }).eq('id', personId);
  return res.error ? res.error.message : null;
}
