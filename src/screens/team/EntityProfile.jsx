// Profiles → an entity: the 9-step subsidiary checklist (tick items, fix
// dates, upload documents onto their step), its details, documents,
// notes and flag. Super admins only.
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Circle, CircleDot, CheckCircle2, FileText, Flag, Pencil, Square, SquareCheck, Trash2, Upload } from 'lucide-react';
import { clearEntityCheck, deleteEntity, deleteEntityDoc, DOC_ACCEPT, DOC_MAX_MB, fetchEntityDocs, openEntityDoc, setEntityCheck, updateEntity, uploadEntityDoc } from '../../data/adminProfiles.js';
import { ENTITY_FIELD_LABELS, ENTITY_PHASES, ENTITY_STEPS, entityProgress, nonResidentStates, stateName, stepItems } from '../../lib/profiles.js';
import { todayStr } from '../../lib/dates.js';
import { fmtPhone, telHref } from '../../lib/phone.js';
import { canPickPhotos } from '../../native.js';
import { EntityForm, EntitySegs, FlagBar, FlagDialog, initialsOf, LagBadge, NotesCard, shortDate, stampDate } from './profileParts.jsx';
import { askConfirm, confirmDelete, newestFirst } from '../../components/confirm.jsx';

const ENTITY_REASONS = ['Waiting on signatures', 'Waiting on the state', 'Waiting on the carrier', 'Partner not responding', 'Missing documents'];
const stepTitle = key => (ENTITY_STEPS.find(s => s.key === key) || {}).short || 'General';

// One tickable item: the box, its label, and (once ticked) the date and
// who ticked it. The date can be changed.
function Item({ label, check, busy, onToggle, onRedate, extra = null }) {
  const [dating, setDating] = useState(false);
  return (
    <span className={`tr-pf-item ${check ? 'tr-pf-item-on' : ''}`}>
      <button type="button" role="checkbox" aria-checked={!!check} className="tr-pf-check" onClick={onToggle} disabled={busy}>
        {check ? <SquareCheck size={16} aria-hidden="true" /> : <Square size={16} aria-hidden="true" />}<span>{label}</span>
      </button>
      {check ? (dating ? (
        <input type="date" className="tr-pf-item-dateinput" defaultValue={check.done_on} max={todayStr()} autoFocus aria-label={`Date for ${label}`}
          onBlur={() => setDating(false)}
          onChange={e => { if (e.target.value) { onRedate(e.target.value); setDating(false); } }} />
      ) : (
        <button type="button" className="tr-pf-item-date" onClick={() => setDating(true)} title={`${check.done_by_name || ''} · change the date`}>
          {shortDate(check.done_on)}{check.done_by_name ? ` · ${initialsOf(check.done_by_name)}` : ''}
        </button>
      )) : extra}
    </span>
  );
}

const DETAIL_FIELDS = [['nv_entity_number', 'NV entity #'], ['ein', 'EIN'], ['entity_npn', 'Entity NPN'], ['resident_license_number', 'NV license #'], ['fg_writing_number', 'F&G writing #'], ['bank_name', 'Bank']];

export function EntityProfile({ entity, checks, people, backLabel = 'Back', onBack, onOpenPerson, onChanged, onDeleted }) {
  const [docs, setDocs] = useState(null);
  const [editing, setEditing] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [busyItem, setBusyItem] = useState('');
  const [uploading, setUploading] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [photosOk, setPhotosOk] = useState(false); // until we know this isn't the 1.0.0 iPhone app
  const fileInput = useRef(null);
  const uploadStep = useRef(null);
  useEffect(() => {
    let alive = true;
    fetchEntityDocs(entity.id).then(d => { if (alive) setDocs(d); });
    canPickPhotos().then(v => { if (alive) setPhotosOk(v); });
    return () => { alive = false; };
  }, [entity.id]);
  useEffect(() => { if (!note) return undefined; const t = setTimeout(() => setNote(''), 6000); return () => clearTimeout(t); }, [note]);

  const prog = entityProgress(entity, checks);
  const partner = entity.partner_id ? people.find(p => p.id === entity.partner_id) : null;
  const flagged = !!entity.flag_reason;

  async function tick(item, label) {
    setErr('');
    if (checks.has(item)) {
      if (!(await askConfirm({ title: `Untick "${label}"?`, confirmLabel: 'Untick' }))) return;
      setBusyItem(item);
      const ok = await clearEntityCheck(entity.id, item);
      setBusyItem('');
      if (!ok) { setErr("Couldn't save. Check your connection and try again."); return; }
      const next = new Map(checks); next.delete(item);
      onChanged(entity, next);
      return;
    }
    setBusyItem(item);
    const res = await setEntityCheck(entity.id, item, todayStr());
    setBusyItem('');
    if (!res.ok) { setErr("Couldn't save. Check your connection and try again."); return; }
    const next = new Map(checks); next.set(item, res.record);
    onChanged(entity, next);
  }
  async function redate(item, date) {
    setBusyItem(item);
    const res = await setEntityCheck(entity.id, item, date);
    setBusyItem('');
    if (!res.ok) { setErr("Couldn't change the date. Check your connection and try again."); return; }
    const next = new Map(checks); next.set(item, res.record);
    onChanged(entity, next);
  }

  function pickFile(stepKey) { uploadStep.current = stepKey; if (fileInput.current) fileInput.current.click(); }
  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const stepKey = uploadStep.current;
    setUploading(stepKey || 'general'); setErr('');
    const res = await uploadEntityDoc(entity.id, stepKey, file);
    setUploading('');
    if (!res.ok) {
      setErr(res.error === 'type' ? 'Upload a PDF, a photo (JPG, PNG, WebP or HEIC) or a Word document.'
        : res.error === 'size' ? `That file is over ${DOC_MAX_MB} MB.` : "Couldn't upload it. Check your connection and try again.");
      return;
    }
    setDocs(prev => [res.record, ...(prev || [])]);
    // Uploading the executed agreement or the formation documents ticks that item.
    const step = ENTITY_STEPS.find(s => s.key === stepKey);
    if (step && step.uploadTicks && !checks.has(step.uploadTicks)) {
      const t = await setEntityCheck(entity.id, step.uploadTicks, todayStr());
      if (t.ok) { const next = new Map(checks); next.set(step.uploadTicks, t.record); onChanged(entity, next); }
      setNote(`Uploaded ${res.record.file_name}, and ticked "${step.items.find(([k]) => k === step.uploadTicks)[1]}".`);
    } else setNote(`Uploaded ${res.record.file_name}.`);
  }
  async function openDoc(d) { if (!(await openEntityDoc(d))) setErr("Couldn't open it. Check your connection and try again."); }
  function removeDoc(d) {
    return confirmDelete({
      title: `Delete ${d.file_name}?`, undoText: `Deleted ${d.file_name}`, item: d, setList: setDocs, sort: newestFirst,
      commit: () => deleteEntityDoc(d), failText: `Couldn't delete ${d.file_name}. Check your connection and try again. It's been put back.`,
    });
  }

  async function saveFlag(reason) {
    const res = await updateEntity(entity.id, { flag_reason: reason });
    if (!res.ok) return false;
    onChanged(res.record, checks); setFlagging(false); return true;
  }
  async function clearFlag() {
    const res = await updateEntity(entity.id, { flag_reason: null });
    if (!res.ok) return false;
    onChanged(res.record, checks); setFlagging(false); return true;
  }
  async function saveDetails(fields) {
    const res = await updateEntity(entity.id, fields);
    if (!res.ok) return false;
    onChanged(res.record, checks); setEditing(false); return true;
  }
  async function archive() {
    const res = await updateEntity(entity.id, { archived_at: entity.archived_at ? null : new Date().toISOString() });
    if (!res.ok) { setErr("Couldn't save. Check your connection and try again."); return; }
    onChanged(res.record, checks); setEditing(false);
    setNote(res.record.archived_at ? 'Archived. It stays under Archived in the list.' : 'Brought back from the archive.');
  }
  async function remove() {
    if (!(await askConfirm({ title: `Delete ${entity.name} for good?`, body: "Its checklist, documents and notes are deleted too, and this can't be undone.\n\nArchive keeps it instead.", confirmLabel: 'Delete for good', danger: true }))) return;
    if (await deleteEntity(entity.id)) onDeleted();
    else setErr("Couldn't delete it. Check your connection and try again.");
  }

  const fieldValue = k => (k === 'eo_expires_on' ? shortDate(entity[k]) : entity[k]);
  // The numbers that go with a step; "Add ..." only once the step is reached.
  function fieldChips(step, reached) {
    const fields = step.fields || [];
    const filled = fields.filter(k => entity[k]);
    const chips = filled.map(k => <span key={k} className="tr-pf-field">{ENTITY_FIELD_LABELS[k]}: <strong>{fieldValue(k)}</strong></span>);
    if (reached && filled.length < fields.length) {
      chips.push(<button key="add" type="button" className="tr-link-btn tr-pf-field-add" onClick={() => setEditing(true)}>{filled.length ? 'Add the rest' : step.fieldsPrompt}</button>);
    }
    return chips;
  }
  const uploadBtn = (stepKey, label) => (
    <button type="button" className="tr-btn tr-btn-ghost tr-btn-xs" onClick={() => pickFile(stepKey)} disabled={!!uploading}>
      <Upload size={12} aria-hidden="true" /> {uploading === stepKey ? 'Uploading…' : label}
    </button>
  );

  function stepRow(step) {
    const idx = ENTITY_STEPS.findIndex(s => s.key === step.key);
    const isDone = prog.done[idx], isNow = idx === prog.currentIndex;
    const items = stepItems(step, entity);
    const lastOn = items.concat(step.perState ? [{ key: 'nonres_none' }] : []).reduce((m, i) => { const c = checks.get(i.key); return c && c.done_on > m ? c.done_on : m; }, '');
    const stepDocs = (docs || []).filter(d => d.step === step.key);
    // The executed agreement and the formation documents get an Upload
    // button right on their item (uploading ticks it); any step can take a
    // document from the small upload button on its right.
    const inlineUpload = step.uploadTicks && !checks.has(step.uploadTicks);
    return (
      <div key={step.key} className={`tr-pf-step ${isDone ? 'tr-pf-step-done' : isNow ? 'tr-pf-step-now' : ''}`}>
        <div className="tr-pf-step-head">
          <span className="tr-pf-step-icon" aria-hidden="true">{isDone ? <CheckCircle2 size={18} /> : isNow ? <CircleDot size={18} /> : <Circle size={18} />}</span>
          <span className="tr-pf-step-num">{idx + 1}</span>
          <div className="tr-pf-step-title">
            <strong>{step.title}</strong>{isDone ? <span className="tr-sr-only"> (done)</span> : isNow ? <span className="tr-sr-only"> (the step it's on)</span> : null}
            {isNow ? <span>{step.about}</span> : null}
          </div>
          <div className="tr-pf-step-side">
            {isDone && lastOn ? <span className="tr-pf-done-on">Done {shortDate(lastOn)}</span> : isNow ? <LagBadge days={prog.days} stalled={prog.stalled} /> : null}
            {inlineUpload ? null : uploading === step.key ? <span className="tr-pf-uploading">Uploading…</span> : (
              <button type="button" className="tr-icon-btn tr-pf-step-upload" onClick={() => pickFile(step.key)} disabled={!!uploading}
                aria-label={`Upload a document for ${step.short}`} title={`Upload a document for ${step.short}`}><Upload size={14} /></button>
            )}
          </div>
        </div>
        <div className="tr-pf-items">
          {step.perState ? (
            items.length === 0 ? (
              <div className="tr-pf-nonres-none">
                <span className="tr-pf-light">No other states listed yet.</span>
                <Item label={`Operates in ${entity.formed_in} only (none needed)`} check={checks.get('nonres_none')} busy={busyItem === 'nonres_none'}
                  onToggle={() => tick('nonres_none', `Operates in ${entity.formed_in} only`)} onRedate={d => redate('nonres_none', d)} />
                <button type="button" className="tr-link-btn" onClick={() => setEditing(true)}>Add states</button>
              </div>
            ) : (
              <div className="tr-pf-states-list">
                {nonResidentStates(entity).map(c => (
                  <div key={c} className="tr-pf-state-row">
                    <strong>{stateName(c)}</strong>
                    {['applied', 'obtained'].map(kind => {
                      const key = `nonres_${c}_${kind}`, label = kind === 'applied' ? 'Applied' : 'Obtained';
                      return <Item key={key} label={label} check={checks.get(key)} busy={busyItem === key} onToggle={() => tick(key, `${stateName(c)} · ${label}`)} onRedate={d => redate(key, d)} />;
                    })}
                  </div>
                ))}
                <button type="button" className="tr-link-btn tr-pf-addstate" onClick={() => setEditing(true)}>Add or change states</button>
              </div>
            )
          ) : items.map(i => (
            <Item key={i.key} label={i.label} check={checks.get(i.key)} busy={busyItem === i.key} onToggle={() => tick(i.key, i.label)} onRedate={d => redate(i.key, d)}
              extra={inlineUpload && i.key === step.uploadTicks ? uploadBtn(step.key, 'Upload') : null} />
          ))}
        </div>
        {fieldChips(step, isDone || isNow).length || stepDocs.length ? (
          <div className="tr-pf-step-extra">
            {fieldChips(step, isDone || isNow)}
            {stepDocs.map(d => <button key={d.id} type="button" className="tr-pf-doc-chip" onClick={() => openDoc(d)} title="Open"><FileText size={12} aria-hidden="true" /> {d.file_name}</button>)}
          </div>
        ) : null}
      </div>
    );
  }

  const states = (entity.operating_states || []).map(stateName).join(' · ');
  const hasEo = !!(entity.eo_carrier || entity.eo_policy_number || entity.eo_expires_on);
  const missing = [...DETAIL_FIELDS.filter(([k]) => !entity[k]).map(([, l]) => l), ...(hasEo ? [] : ['E&O']), ...(entity.contact_email || entity.contact_phone ? [] : ['contact'])];
  return (
    <div className="tr-pf-detail">
      <button type="button" className="tr-pf-back" onClick={onBack} data-android-back><ChevronLeft size={16} aria-hidden="true" /> {backLabel}</button>
      <div className="tr-pf-detail-head">
        <div className="tr-pf-detail-title">
          <h2 className="tr-h2">{entity.name}</h2>
          <p className="tr-pf-detail-sub">
            Subsidiary · {entity.formed_in}
            {partner ? <> · partner <button type="button" className="tr-link-btn tr-pf-inline-link" onClick={() => onOpenPerson(partner.id)}>{partner.display_name}</button></>
              : entity.partner_name ? <> · partner {entity.partner_name} <span className="tr-pf-light">(not in PaceLedger)</span></> : null}
            {entity.created_at ? <> · added {stampDate(entity.created_at)}{entity.created_by_name ? ` by ${entity.created_by_name}` : ''}</> : null}
            {entity.archived_at ? <span className="tr-pf-archived-tag">Archived</span> : null}
          </p>
        </div>
        <div className="tr-pf-detail-actions">
          <button type="button" className={`tr-btn tr-btn-sm ${flagged ? 'tr-pf-btn-flagged' : 'tr-btn-ghost'}`} onClick={() => setFlagging(true)}><Flag size={14} aria-hidden="true" /> {flagged ? 'Flagged' : 'Flag'}</button>
          <button type="button" className="tr-btn tr-btn-ghost tr-btn-sm" onClick={() => setEditing(true)}><Pencil size={13} aria-hidden="true" /> Edit details</button>
        </div>
      </div>
      <FlagBar reason={entity.flag_reason} by={entity.flagged_by_name} at={entity.flagged_at} onClear={clearFlag} />
      {note ? <div className="tr-flash" role="status">{note}</div> : null}
      {err ? <div className="tr-error">{err}</div> : null}
      <input ref={fileInput} type="file" className="tr-sr-only" tabIndex={-1} aria-hidden="true" onChange={onFile}
        accept={photosOk ? DOC_ACCEPT : '.pdf,.doc,.docx,application/pdf'} />

      <div className="tr-pf-two">
        <section className="tr-card tr-pf-checklist" aria-labelledby="tr-pf-checklist-title">
          <div className="tr-pf-checklist-head">
            <h3 className="tr-pf-box-title" id="tr-pf-checklist-title">Subsidiary checklist</h3>
            <EntitySegs done={prog.done} currentIndex={prog.currentIndex} flagged={flagged} />
            <span className="tr-pf-light">{prog.completed ? 'All 9 steps done' : `${prog.doneCount} of 9 · now on step ${prog.currentIndex + 1}`}</span>
          </div>
          {ENTITY_PHASES.map((phase, pi) => {
            const n = phase.steps.length, d = prog.phaseDone[pi];
            return (
              <div key={phase.key} className="tr-pf-phase">
                <div className="tr-pf-phase-head">
                  <span className="tr-pf-phase-label">{phase.label}</span><strong>{phase.name}</strong>
                  <span className={`tr-pf-phase-count ${d === n ? 'tr-pf-phase-done' : ''}`}>{d === n ? <><CheckCircle2 size={13} aria-hidden="true" /> {d} of {n}</> : `${d} of ${n}`}</span>
                </div>
                {phase.steps.map(stepRow)}
              </div>
            );
          })}
        </section>

        <div className="tr-pf-side">
          <section className="tr-card tr-pf-box" aria-labelledby="tr-pf-details-title">
            <div className="tr-pf-box-head"><h3 className="tr-pf-box-title" id="tr-pf-details-title">Details</h3>
              <button type="button" className="tr-btn tr-btn-ghost tr-btn-xs" onClick={() => setEditing(true)}><Pencil size={12} aria-hidden="true" /> Edit</button></div>
            <dl className="tr-pf-dl">
              <div><dt>Partner</dt><dd>{partner ? <button type="button" className="tr-link-btn tr-pf-inline-link" onClick={() => onOpenPerson(partner.id)}>{partner.display_name}</button> : entity.partner_name || <span className="tr-pf-light">Not picked yet</span>}</dd></div>
              <div><dt>Formed in</dt><dd>{entity.formed_in}</dd></div>
              <div><dt>Will operate in</dt><dd>{states || <span className="tr-pf-light">Not added yet</span>}</dd></div>
              {DETAIL_FIELDS.filter(([k]) => entity[k]).map(([k, l]) => <div key={k}><dt>{l}</dt><dd>{entity[k]}</dd></div>)}
              {hasEo ? <div><dt>E&amp;O</dt><dd>{[entity.eo_carrier, entity.eo_policy_number && `policy ${entity.eo_policy_number}`, entity.eo_expires_on && `expires ${shortDate(entity.eo_expires_on)}`].filter(Boolean).join(' · ')}</dd></div> : null}
              {entity.contact_email || entity.contact_phone ? (
                <div><dt>Contact</dt><dd>{entity.contact_email ? <a href={`mailto:${entity.contact_email}`}>{entity.contact_email}</a> : null}{entity.contact_email && entity.contact_phone ? <br /> : null}{entity.contact_phone ? <a href={telHref(entity.contact_phone)}>{fmtPhone(entity.contact_phone)}</a> : null}</dd></div>
              ) : null}
              {missing.length ? <div><dt>Not added yet</dt><dd className="tr-pf-light">{missing.join(', ')}</dd></div> : null}
            </dl>
          </section>

          <section className="tr-card tr-pf-box" aria-labelledby="tr-pf-docs-title">
            <div className="tr-pf-box-head"><h3 className="tr-pf-box-title" id="tr-pf-docs-title">Documents</h3>
              <button type="button" className="tr-btn tr-btn-ghost tr-btn-xs" onClick={() => pickFile(null)} disabled={!!uploading}><Upload size={12} aria-hidden="true" /> {uploading === 'general' ? 'Uploading…' : 'Upload'}</button></div>
            {docs === null ? <p className="tr-empty">Loading…</p> : docs.length === 0 ? (
              <p className="tr-empty">No documents yet. Upload the agreement, approvals, formation documents, licenses and the E&amp;O certificate on their step, or here. PDF, photo or Word, up to {DOC_MAX_MB} MB.</p>
            ) : (
              <ul className="tr-pf-docs">
                {docs.map(d => (
                  <li key={d.id}>
                    <FileText size={15} aria-hidden="true" />
                    <div><button type="button" className="tr-pf-doc-name" onClick={() => openDoc(d)}>{d.file_name}</button>
                      <span>{stepTitle(d.step)} · {stampDate(d.created_at)}{d.uploaded_by_name ? ` · ${d.uploaded_by_name}` : ''}</span></div>
                    <button type="button" className="tr-icon-btn" onClick={() => removeDoc(d)} aria-label={`Delete ${d.file_name}`} title="Delete"><Trash2 size={13} /></button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <NotesCard subject={{ entityId: entity.id }} />
        </div>
      </div>

      {flagging ? <FlagDialog title={`Flag ${entity.name}`} current={entity.flag_reason || ''} reasons={ENTITY_REASONS} onSave={saveFlag} onClear={clearFlag} onClose={() => setFlagging(false)} /> : null}
      {editing ? <EntityForm entity={entity} people={people} onSave={saveDetails} onClose={() => setEditing(false)} onArchive={archive} onDelete={remove} /> : null}
    </div>
  );
}
