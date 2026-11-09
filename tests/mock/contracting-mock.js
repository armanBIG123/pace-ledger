// Test stand-in for migration-contracting.sql's functions and the
// "contracting" edge function. Same rules, in memory. Decrypts with the
// same algorithm as the edge function, using PL.privateText.
/* eslint-disable */
window.__PL_SETUP = function (PL) {
  const db = PL.db;
  const T = n => (db[n] = db[n] || []);
  const now = () => new Date(PL.clock ? PL.clock() : Date.now());
  const iso = () => now().toISOString();
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()));
  const err = (code, status) => { const e = new Error(code); e.status = status || 400; return e; };
  const me = () => (PL.user && PL.user.id) || null;
  const prof = id => T('profiles').find(p => p.id === id) || null;
  const settings = () => { if (!T('contracting_settings').length) T('contracting_settings').push({ id: true, enabled: false, paused: false }); return T('contracting_settings')[0]; };
  const staffIds = () => T('contracting_staff').map(s => s.user_id);
  const isStaff = (id = me()) => staffIds().includes(id) && (prof(id) || {}).role === 'super_admin';
  const fresh = () => PL.aal === 'aal2' && PL.totpAt && PL.totpAt > Math.floor(Date.now() / 1000) - 12 * 3600;
  const check = () => { if (!me()) throw err('not_signed_in'); if (!isStaff()) throw err('not_contracting_staff', 403); if (!fresh()) throw err('two_step_required', 403); };
  const log = (user_id, action, detail, actor = me()) => T('contracting_log').unshift({ id: uid(), user_id, agent_name: (prof(user_id) || {}).display_name || null, actor_id: actor, actor_name: actor ? (prof(actor) || {}).display_name : null, action, detail: detail || null, at: iso() });
  const caseOf = id => T('contracting_cases').find(c => c.user_id === id);
  const secretOf = id => T('contracting_secrets').find(s => s.user_id === id);
  const lp = id => { let r = T('licensing_progress').find(x => x.user_id === id); if (!r) { r = { user_id: id }; T('licensing_progress').push(r); } return r; };
  const today = () => now().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  const del = (id, reason) => {
    const s = secretOf(id); if (!s) return false;
    db.contracting_secrets = T('contracting_secrets').filter(x => x.user_id !== id);
    db.contracting_files = T('contracting_files').filter(x => x.user_id !== id);
    if (s.submitted_at) {
      const c = caseOf(id);
      Object.assign(c, { info_deleted_at: iso(), delete_reason: reason }, reason === 'entered' ? { entered_at: iso(), entered_by: me() } : {});
      if (reason !== 'entered') lp(id).profile_submitted_on = null;
    }
    return !!s.submitted_at;
  };
  const purge = () => {
    for (const s of [...T('contracting_secrets')]) if (new Date(s.expires_at) <= now()) {
      if (s.submitted_at) { del(s.user_id, 'expired'); log(s.user_id, 'expired', 'Deleted automatically 72 hours after it was sent', null); }
      else db.contracting_secrets = T('contracting_secrets').filter(x => x.user_id !== s.user_id);
    }
  };
  PL.purge = purge;
  const latestAg = id => T('producer_agreements').filter(a => a.user_id === id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] || null;

  Object.assign(PL.rpc, {
    contracting_start({ p_key_id, p_wrapped_key }) {
      const s = settings();
      if (!me()) throw err('not_signed_in');
      if (!s.enabled) throw err('contracting_off');
      if (s.paused) throw err('contracting_paused');
      if (!s.key_id || p_key_id !== s.key_id) throw err('key_changed');
      if (!T('producer_agreements').some(a => a.user_id === me() && a.status === 'completed')) throw err('agreement_not_countersigned');
      if (T('contracting_secrets').some(x => x.user_id === me() && x.submitted_at)) throw err('already_sent');
      db.contracting_secrets = T('contracting_secrets').filter(x => x.user_id !== me());
      db.contracting_files = T('contracting_files').filter(x => x.user_id !== me());
      T('contracting_secrets').push({ user_id: me(), key_id: p_key_id, wrapped_key: p_wrapped_key, fields: {}, submitted_at: null, expires_at: new Date(now().getTime() + 2 * 3600e3).toISOString() });
      return null;
    },
    contracting_put_file(a) {
      if (PL.failKind && a.p_kind === PL.failKind) throw err('network_error');
      const s = secretOf(me()); if (!s || s.submitted_at) throw err('no_draft');
      if (T('contracting_files').filter(f => f.user_id === me()).length >= 10) throw err('too_many_files');
      if (a.p_kind !== 'background_doc' && T('contracting_files').some(f => f.user_id === me() && f.kind === a.p_kind)) throw err('too_many_files');
      const id = uid();
      T('contracting_files').push({ id, user_id: me(), kind: a.p_kind, mime: a.p_mime, size: a.p_size, name: a.p_name, iv: a.p_iv, ct: a.p_ct });
      return id;
    },
    contracting_submit({ p_fields }) {
      const s = secretOf(me()); if (!s || s.submitted_at) throw err('no_draft');
      if (settings().paused) throw err('contracting_paused');
      const need = ['first_name', 'last_name', 'ssn', 'dob', 'gender', 'email', 'phone', 'street', 'city', 'state', 'zip', 'dl_number', 'dl_state', 'dl_expires', 'bank_name', 'account_type', 'routing', 'account', 'eo_has', 'aml_done', 'background'];
      if (need.some(k => !p_fields[k])) throw err('missing_fields');
      const until = new Date(now().getTime() + 72 * 3600e3).toISOString();
      Object.assign(s, { fields: p_fields, submitted_at: iso(), expires_at: until });
      let c = caseOf(me()); if (!c) { c = { user_id: me() }; T('contracting_cases').push(c); }
      Object.assign(c, { info_sent_at: iso(), expires_at: until, notified_at: null, info_deleted_at: null, delete_reason: null, entered_at: null, entered_by: null, review_sent_at: null, agent_signed_at: null, sent_to_carrier_at: null });
      const l = lp(me()); l.profile_submitted_on = today(); l.contracting_sent_on = l.contracting_sent_on || today();
      log(me(), 'sent', 'Sent contracting info, encrypted on their device');
      return until;
    },
    contracting_discard_draft() { db.contracting_secrets = T('contracting_secrets').filter(x => !(x.user_id === me() && !x.submitted_at)); return null; },
    contracting_withdraw() { if (!del(me(), 'withdrawn')) return false; log(me(), 'withdrawn', 'Withdrew their info; it was deleted'); return true; },
    contracting_counts() {
      if (!isStaff()) return null;
      const live = T('contracting_secrets').filter(s => s.submitted_at && new Date(s.expires_at) > now());
      const latest = [...new Set(T('producer_agreements').map(a => a.user_id))].map(latestAg);
      return { countersign: latest.filter(a => a && a.status === 'agent_signed').length, to_enter: live.length, oldest_expires_at: live.map(s => s.expires_at).sort()[0] || null };
    },
    contracting_queue() {
      check(); purge();
      const ids = [...new Set([...T('producer_agreements').map(a => a.user_id), ...T('contracting_cases').map(c => c.user_id)])].filter(Boolean);
      const rows = ids.map(id => {
        const p = prof(id) || {}; const a = latestAg(id); const c = caseOf(id) || {}; const s = T('contracting_secrets').find(x => x.user_id === id && x.submitted_at);
        const up = p.manager_id ? prof(p.manager_id) : null;
        const sort_key = s ? 0 : a && a.status === 'agent_signed' ? 1 : c.entered_at && !c.sent_to_carrier_at ? 2 : a && a.status === 'completed' && !c.info_sent_at ? 3 : a && a.status === 'sent' ? 4 : 5;
        return { user_id: id, name: p.display_name, npn: p.npn, solar_system: 'BIG', upline: up ? up.display_name : null,
          agreement_id: a && a.id, agreement_status: a && a.status, version: a && a.version, election: a && a.election, agent_signed_at: a && a.agent_signed_at, countersigned_at: a && a.countersigned_at,
          info_sent_at: c.info_sent_at, info_deleted_at: c.info_deleted_at, delete_reason: c.delete_reason, entered_at: c.entered_at, review_sent_at: c.review_sent_at, surelc_signed_at: c.agent_signed_at, sent_to_carrier_at: c.sent_to_carrier_at,
          expires_at: s ? s.expires_at : null, has_info: !!s, files: s ? T('contracting_files').filter(f => f.user_id === id).length : 0, has_writing_number: !!p.fg_writing_number, sort_key, sort_time: (s && s.expires_at) || (a && a.agent_signed_at) || c.entered_at || (a && a.created_at) || '' };
      });
      return rows.sort((x, y) => x.sort_key - y.sort_key || String(x.sort_time).localeCompare(String(y.sort_time)));
    },
    contracting_case({ p_user }) {
      check(); purge();
      const s = T('contracting_secrets').find(x => x.user_id === p_user && x.submitted_at);
      if (s && !T('contracting_log').some(l => l.user_id === p_user && l.actor_id === me() && l.action === 'opened' && now() - new Date(l.at) < 600e3)) log(p_user, 'opened', 'Opened their contracting info');
      const p = prof(p_user) || {}; const up = p.manager_id ? prof(p.manager_id) : null;
      return {
        person: { id: p.id, name: p.display_name, npn: p.npn, email: (PL.emails || {})[p.id] || null, solar_system: 'BIG', upline: up ? up.display_name : null, writing_number: p.fg_writing_number || null },
        agreements: T('producer_agreements').filter(a => a.user_id === p_user).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
        case: caseOf(p_user) || null,
        info: s ? { sent_at: s.submitted_at, expires_at: s.expires_at, key_id: s.key_id, fields: Object.keys(s.fields).sort(), files: T('contracting_files').filter(f => f.user_id === p_user).map(f => ({ id: f.id, kind: f.kind, mime: f.mime, size: f.size })) } : null,
        log: T('contracting_log').filter(l => l.user_id === p_user).map(l => ({ at: l.at, actor: l.actor_name, action: l.action, detail: l.detail })),
      };
    },
    contracting_mark_entered({ p_user }) { check(); if (!del(p_user, 'entered')) throw err('nothing_to_enter'); log(p_user, 'entered', 'Marked entered in SureLC; the info was deleted'); return caseOf(p_user); },
    contracting_mark_step({ p_user, p_step, p_on = true }) {
      check(); const c = caseOf(p_user); if (!c || !c.entered_at) throw err('not_entered_yet');
      const order = ['review_sent', 'agent_signed', 'sent_to_carrier']; const col = { review_sent: 'review_sent_at', agent_signed: 'agent_signed_at', sent_to_carrier: 'sent_to_carrier_at' };
      const i = order.indexOf(p_step); if (i < 0) throw err('unknown_step');
      if (p_on && i > 0 && !c[col[order[i - 1]]]) throw err('earlier_step_first');
      if (!p_on && i < 2 && c[col[order[i + 1]]]) throw err('undo_later_step_first');
      c[col[p_step]] = p_on ? (c[col[p_step]] || iso()) : null;
      log(p_user, p_on ? p_step : `undo_${p_step}`, null);
      return c;
    },
    contracting_kill_switch() { check(); let n = 0; for (const s of [...T('contracting_secrets')]) { if (s.submitted_at) { del(s.user_id, 'kill_switch'); log(s.user_id, 'kill_switch', 'Deleted by the kill switch'); n++; } else db.contracting_secrets = T('contracting_secrets').filter(x => x !== s); } settings().paused = true; log(null, 'kill_switch', `Kill switch: deleted ${n} submission(s) and paused the form`); return n; },
    contracting_set_paused({ p_paused }) { check(); settings().paused = p_paused; log(null, p_paused ? 'paused' : 'unpaused'); return null; },
    contracting_set_enabled({ p_enabled }) { check(); const s = settings(); if (p_enabled && (!s.key_id || !s.key_verified_at)) throw err('key_not_ready'); if (p_enabled && (!s.agreement_version || !s.docuseal_template_id)) throw err('agreement_not_ready'); s.enabled = p_enabled; log(null, p_enabled ? 'turned_on' : 'turned_off'); return null; },
    contracting_set_key({ p_public_key, p_key_id }) { check(); if (T('contracting_secrets').length) throw err('info_pending'); Object.assign(settings(), { public_key: p_public_key, key_id: p_key_id, key_set_at: iso(), key_set_by: me(), key_verified_at: null, enabled: false }); log(null, 'new_key', `Made a new encryption key ${p_key_id}`); return null; },
    contracting_set_agreement({ p_version, p_template_id }) { check(); Object.assign(settings(), { agreement_version: p_version, docuseal_template_id: p_template_id }); log(null, 'agreement', `Agreement version ${p_version}, DocuSeal template ${p_template_id}`); return null; },
    contracting_staff_list() { if (staffIds().length) check(); else if ((prof(me()) || {}).role !== 'super_admin') throw err('not_contracting_staff'); else if (!fresh()) throw err('two_step_required'); return T('profiles').filter(p => p.role === 'super_admin').map(p => ({ id: p.id, name: p.display_name, on: staffIds().includes(p.id) })); },
    contracting_set_staff({ p_user, p_on }) { if (staffIds().length) check(); else if (!fresh()) throw err('two_step_required'); if (p_on) { if ((prof(p_user) || {}).role !== 'super_admin') throw err('super_admins_only'); if (!staffIds().includes(p_user)) T('contracting_staff').push({ user_id: p_user }); } else db.contracting_staff = T('contracting_staff').filter(s => s.user_id !== p_user); log(null, p_on ? 'staff_added' : 'staff_removed', (prof(p_user) || {}).display_name); return null; },
    contracting_mark_reviewed() { check(); Object.assign(settings(), { last_review_at: iso(), last_review_by: me() }); log(null, 'access_review', 'Reviewed the contracting team and the access log'); return iso(); },
    contracting_admin_log() { check(); return T('contracting_log').slice(0, 300).map(l => ({ at: l.at, agent: l.agent_name, actor: l.actor_name, action: l.action, detail: l.detail })); },
  });

  // ---- the edge function ----
  const fromB64 = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
  const toB64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x2000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x2000)); return btoa(s); };
  async function priv() {
    const m = /^PLKEY1\.([0-9a-f]{16})\.([A-Za-z0-9+/=]+)$/.exec(String(PL.privateText || '').replace(/\s+/g, ''));
    if (!m) return null;
    return { keyId: m[1], key: await crypto.subtle.importKey('pkcs8', fromB64(m[2]), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']) };
  }
  async function open(pk, wrapped, iv, ct, aad) {
    const raw = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, pk, fromB64(wrapped));
    const k = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv), additionalData: new TextEncoder().encode(aad) }, k, fromB64(ct)));
  }
  const LABELS = { ssn: 'Social Security number', dob: 'Date of birth', routing: 'Routing number', account: 'Account number', background: 'Background answers' };
  const lbl = k => LABELS[k] || k.replace(/_/g, ' ');
  let subN = 5000;
  function syncAg(a) {
    const ds = (PL.docuseal = PL.docuseal || {})[a.docuseal_submission_id] || {};
    if (ds.agentDone && a.status === 'sent') { Object.assign(a, { status: 'agent_signed', agent_signed_at: ds.agentDone, election: ds.election || 'Exclusive' }); log(a.user_id, 'agreement_signed', `Signed producer agreement ${a.version}`, null); }
    if (ds.bigDone && a.status !== 'completed') {
      Object.assign(a, { status: 'completed', countersigned_at: ds.bigDone, pdf_path: `${a.user_id}/${a.id}/signed.pdf`, audit_path: `${a.user_id}/${a.id}/audit.pdf`, pdf_sha256: 'a3f1c0de9b7e4d21' + '0'.repeat(48) });
      const l = lp(a.user_id); l.contracting_sent_on = l.contracting_sent_on || today();
      log(a.user_id, 'agreement_completed', `Producer agreement ${a.version} countersigned; signed PDF saved`, a.countersigned_by);
    }
    return a;
  }
  PL.fn.contracting = async body => {
    const s = settings();
    switch (body.action) {
      case 'agreement-session': {
        if (!s.docuseal_template_id) throw err('agreement_not_set_up');
        if (!s.enabled && !isStaff()) throw err('contracting_off');
        let a = T('producer_agreements').filter(x => x.user_id === me() && x.version === s.agreement_version).sort((x, y) => (x.created_at < y.created_at ? 1 : -1))[0];
        if (a) a = syncAg(a);
        if (a && a.status === 'completed') return { status: 'completed', agreement: a };
        if (a && a.status === 'agent_signed') return { status: 'agent_signed', agreement: a };
        if (a && a.status === 'sent') return { status: 'sent', src: `https://docuseal.com/s/agent${a.docuseal_submission_id}`, email: a.agent_email, name: a.agent_name, adopted: !!a.adopted, agreement: a };
        const p = prof(me());
        a = { id: uid(), user_id: me(), version: s.agreement_version, docuseal_submission_id: ++subN, status: 'sent', agent_name: p.display_name, agent_email: PL.user.email, created_at: iso() };
        T('producer_agreements').push(a);
        log(me(), 'agreement_started', `Opened producer agreement ${s.agreement_version} to sign`);
        return { status: 'sent', src: `https://docuseal.com/s/agent${a.docuseal_submission_id}`, email: PL.user.email, name: a.agent_name, adopted: false, agreement: a };
      }
      case 'adopt-signature': {
        const a = T('producer_agreements').filter(x => x.user_id === me() && x.version === s.agreement_version).sort((x, y) => (x.created_at < y.created_at ? 1 : -1))[0];
        if (body.consent !== true) throw err('consent_needed');
        if (!/^data:image\/png;base64,/.test(body.signature || '')) throw err('signature_needed');
        if (!a || a.status !== 'sent') throw err('agreement_not_open');
        PL.adoptBody = { printedName: body.printedName, initials: body.initials, signatureLength: body.signature.length, consent: body.consent };
        a.adopted = true; a.agent_name = body.printedName;
        log(me(), 'signature_adopted', `Adopted a drawn signature and initials "${body.initials}" as ${body.printedName}`);
        return { ok: true, signatures: 4, initials: 39 };
      }
      case 'sync-agreement': {
        const a = T('producer_agreements').find(x => x.id === body.agreementId); if (!a) throw err('not_found', 404);
        if (a.user_id !== me()) check();
        // The stand-in DocuSeal: finishing the form signs your role.
        const ds = (PL.docuseal = PL.docuseal || {})[a.docuseal_submission_id] = (PL.docuseal[a.docuseal_submission_id] || {});
        if (a.user_id === me() && !ds.agentDone) { ds.agentDone = iso(); ds.election = PL.nextElection || 'Exclusive'; }
        else if (a.user_id !== me() && ds.agentDone && !ds.bigDone && PL.countersigning === a.id) ds.bigDone = iso();
        return { status: syncAg(a).status, agreement: a };
      }
      case 'countersign-session': {
        check();
        const a = T('producer_agreements').find(x => x.id === body.agreementId); if (!a) throw err('not_found', 404);
        syncAg(a);
        if (a.status === 'completed') return { status: 'completed', agreement: a };
        if (a.status !== 'agent_signed') throw err('agent_not_signed');
        a.countersigned_by = me(); a.countersigner_name = prof(me()).display_name; PL.countersigning = a.id;
        return { status: 'agent_signed', src: `https://docuseal.com/s/big${a.docuseal_submission_id}`, email: PL.user.email };
      }
      case 'reveal': {
        check(); purge();
        const sec = T('contracting_secrets').find(x => x.user_id === body.userId && x.submitted_at);
        if (!sec) throw err('gone', 404);
        const piece = sec.fields[body.field]; if (!piece) throw err('not_given', 404);
        const pk = await priv(); if (!pk) throw err('no_private_key', 500); if (pk.keyId !== sec.key_id) throw err('wrong_key', 500);
        const value = new TextDecoder().decode(await open(pk.key, sec.wrapped_key, piece.iv, piece.ct, `pl1|${body.userId}|${body.field}`));
        log(body.userId, body.purpose === 'copy' ? 'copied' : 'revealed', lbl(body.field));
        return { value };
      }
      case 'file': {
        check(); purge();
        const sec = T('contracting_secrets').find(x => x.user_id === body.userId && x.submitted_at); if (!sec) throw err('gone', 404);
        const f = T('contracting_files').find(x => x.id === body.fileId && x.user_id === body.userId); if (!f) throw err('not_found', 404);
        const pk = await priv();
        const bytes = await open(pk.key, sec.wrapped_key, f.iv, f.ct, `pl1|${body.userId}|file|${f.kind}`);
        const name = new TextDecoder().decode(await open(pk.key, sec.wrapped_key, f.name.iv, f.name.ct, `pl1|${body.userId}|file-name|${f.kind}`));
        log(body.userId, 'viewed_file', f.kind);
        return { name, mime: f.mime, data: toB64(bytes) };
      }
      case 'notify-sent': { const c = caseOf(me()); if (c && !c.notified_at) { c.notified_at = iso(); PL.emailed = (PL.emailed || 0) + 1; } return { ok: true, sent: true }; }
      case 'key-check': {
        check();
        const pk = await priv(); if (!pk) return { ok: false, error: 'no_private_key' };
        if (body.keyId !== s.key_id) return { ok: false, error: 'key_changed' };
        if (pk.keyId !== s.key_id) return { ok: false, error: 'wrong_key' };
        let t = ''; try { t = new TextDecoder().decode(await open(pk.key, body.wrappedKey, body.iv, body.ct, `pl1|${me()}|key-check`)); } catch {}
        if (t !== `pl-key-check:${me()}`) return { ok: false, error: 'wrong_key' };
        s.key_verified_at = iso(); log(null, 'key_verified', `Checked encryption key ${s.key_id}`);
        return { ok: true };
      }
      case 'docuseal-check': {
        check();
        if (Number(body.templateId) !== 12345) return { ok: false, error: 'template_not_found' };
        return { ok: true, name: 'BIG Independent Agent Agreement 2026.1', roles: ['Agent', 'BIG Insurance Network'], fields: ['Agent Name', 'Agent Email', 'Agreement Date', 'Agent Type'], warnings: [], webhook: true, email: true, privateKey: !!PL.privateText };
      }
      default: throw err('unknown_action');
    }
  };
};
