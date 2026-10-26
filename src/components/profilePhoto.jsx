// Your account → Profile photo: add, change or remove your photo, with tips
// for a good headshot. A picked photo opens in a circle you can drag and
// zoom; only the finished 512 × 512 photo is uploaded.
import { useEffect, useRef, useState } from 'react';
import { Camera, ZoomIn, ZoomOut } from 'lucide-react';
import { avatarUrl, removeMyAvatar, saveMyAvatar } from '../data/avatars.js';
import { canPickPhotos, PUBLIC_SITE_URL } from '../native.js';
import { personInitials } from '../lib/format.js';
import { baseScale, clampPos, cropToBlob, loadPhoto, PHOTO_GOOD_PX, PHOTO_MAX_MB, PHOTO_ZOOM_MAX, photoErrorText, startPos, zoomAround } from '../lib/photo.js';
import { Avatar } from './avatar.jsx';
import { askConfirm } from './confirm.jsx';

const STAGE = 240;

export function ProfilePhoto({ user }) {
  const [path, setPath] = useState(user.avatarPath || '');
  const [photo, setPhoto] = useState(null); // { img, w, h, url } while fitting it
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');
  const [canPick, setCanPick] = useState(true);
  const drag = useRef(null);
  useEffect(() => {
    let alive = true;
    canPickPhotos().then(v => { if (alive) setCanPick(v); });
    return () => { alive = false; };
  }, []);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  const base = photo ? baseScale(photo.w, photo.h, STAGE) : 1;
  const scale = base * zoom;

  async function pick(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // so picking the same photo again still opens it
    if (!file) return;
    setErr(''); setDone('');
    const res = await loadPhoto(file);
    if (!res.ok) { setErr(photoErrorText(res)); return; }
    setZoom(1);
    setPos(startPos(res.w, res.h, baseScale(res.w, res.h, STAGE), STAGE));
    setPhoto(res);
  }
  function zoomTo(z) {
    const next = Math.min(PHOTO_ZOOM_MAX, Math.max(1, z));
    setPos(p => zoomAround(p, base * zoom, base * next, photo.w, photo.h, STAGE));
    setZoom(next);
  }
  function moveBy(dx, dy) { setPos(p => clampPos({ x: p.x + dx, y: p.y + dy }, photo.w, photo.h, scale, STAGE)); }
  function onDown(e) {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ }
    drag.current = { x: e.clientX, y: e.clientY, pos };
  }
  function onMove(e) {
    const d = drag.current;
    if (!d) return;
    setPos(clampPos({ x: d.pos.x + e.clientX - d.x, y: d.pos.y + e.clientY - d.y }, photo.w, photo.h, scale, STAGE));
  }
  function onUp() { drag.current = null; }
  function onKey(e) {
    const step = e.shiftKey ? 30 : 10;
    const by = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (by) { e.preventDefault(); moveBy(...by); }
  }

  async function save() {
    setBusy(true); setErr('');
    const blob = await cropToBlob(photo.img, pos, scale, STAGE);
    const res = blob ? await saveMyAvatar(user.id, blob) : { ok: false };
    setBusy(false);
    if (!res.ok) { setErr("Couldn't save your photo. Check your connection and try again."); return; }
    setPath(res.path); setPhoto(null);
    setDone('Saved. Your photo shows next to your name now.');
    window.dispatchEvent(new CustomEvent('paceledger:profile-changed', { detail: { avatar_path: res.path } }));
  }
  async function remove() {
    if (!(await askConfirm({ title: 'Remove your profile photo?', body: 'Your initials show instead. You can add a photo again any time.', confirmLabel: 'Remove', danger: true }))) return;
    setBusy(true); setErr(''); setDone('');
    const res = await removeMyAvatar();
    setBusy(false);
    if (!res.ok) { setErr("Couldn't remove it. Check your connection and try again."); return; }
    setPath('');
    setDone('Photo removed.');
    window.dispatchEvent(new CustomEvent('paceledger:profile-changed', { detail: { avatar_path: null } }));
  }

  if (photo) {
    const small = Math.min(photo.w, photo.h) < PHOTO_GOOD_PX;
    return (
      <section className="tr-photo tr-photo-editing" aria-labelledby="tr-photo-title">
        <div className="tr-photo-title" id="tr-photo-title">Fit your photo in the circle</div>
        <div className="tr-photo-stage" style={{ width: STAGE, height: STAGE }} tabIndex={0}
          aria-label="Your photo. Drag it, or use the arrow keys, to move it in the circle."
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey}>
          <img src={photo.url} alt="" draggable={false}
            style={{ width: photo.w * scale, height: photo.h * scale, transform: `translate(${pos.x}px, ${pos.y}px)` }} />
          <span className="tr-photo-ring" aria-hidden="true" />
        </div>
        <div className="tr-photo-zoom">
          <button type="button" className="tr-icon-btn" onClick={() => zoomTo(zoom - 0.25)} disabled={zoom <= 1} aria-label="Zoom out"><ZoomOut size={16} /></button>
          <input type="range" min="1" max={PHOTO_ZOOM_MAX} step="0.01" value={zoom} onChange={e => zoomTo(Number(e.target.value))} aria-label="Zoom" />
          <button type="button" className="tr-icon-btn" onClick={() => zoomTo(zoom + 0.25)} disabled={zoom >= PHOTO_ZOOM_MAX} aria-label="Zoom in"><ZoomIn size={16} /></button>
        </div>
        <p className="tr-photo-hint">Drag to move it. Zoom in until your face and shoulders fill most of the circle.</p>
        {small ? <p className="tr-photo-warn">This photo is small ({photo.w} × {photo.h} pixels), so it may look a little soft. Use a bigger one if you have it.</p> : null}
        {err && <div className="tr-error">{err}</div>}
        <div className="tr-form-actions">
          <button type="button" className="tr-btn tr-btn-ghost" onClick={() => { setPhoto(null); setErr(''); }} disabled={busy}>Cancel</button>
          <button type="button" className="tr-btn tr-btn-brass" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save photo'}</button>
        </div>
      </section>
    );
  }

  return (
    <section className="tr-photo" aria-labelledby="tr-photo-title">
      <div className="tr-photo-head">
        <Avatar url={avatarUrl(path)} className="tr-photo-current">{personInitials(user.displayName)}</Avatar>
        <div className="tr-photo-main">
          <div className="tr-photo-title" id="tr-photo-title">Profile photo</div>
          <div className="tr-photo-sub">Shows next to your name in Chat, the Org chart and the top bar.</div>
          {canPick ? (
            <div className="tr-photo-actions">
              <label className={`tr-btn tr-btn-ghost tr-btn-sm tr-photo-pick ${busy ? 'tr-photo-pick-off' : ''}`}>
                <Camera size={14} aria-hidden="true" /> {path ? 'Change photo' : 'Add photo'}
                <input type="file" accept="image/*" className="tr-sr-only" onChange={pick} disabled={busy} />
              </label>
              {path ? <button type="button" className="tr-link-btn" onClick={remove} disabled={busy}>Remove</button> : null}
            </div>
          ) : (
            <>
              <p className="tr-photo-sub tr-photo-web">
                To {path ? 'change' : 'add'} it, sign in on the website, <a href={PUBLIC_SITE_URL} target="_blank" rel="noopener noreferrer">big-pace-ledger.com</a>. The next app update adds it here too.
              </p>
              {path ? <div className="tr-photo-actions"><button type="button" className="tr-link-btn" onClick={remove} disabled={busy}>Remove photo</button></div> : null}
            </>
          )}
        </div>
      </div>
      {done ? <div className="tr-photo-done" role="status">{done}</div> : null}
      {err && <div className="tr-error">{err}</div>}
      <div className="tr-photo-tips">
        <strong>Use a professional headshot</strong>
        <ul>
          <li>Just you, from the shoulders up, facing the camera</li>
          <li>Plain background and soft, even light (face a window)</li>
          <li>Recent and in focus: no sunglasses, filters, logos or group photos</li>
        </ul>
        <div className="tr-photo-files">JPG, PNG, WebP or HEIC · up to {PHOTO_MAX_MB} MB · at least {PHOTO_GOOD_PX} × {PHOTO_GOOD_PX} pixels. Square works best; you'll fit it in the circle before it saves.</div>
      </div>
    </section>
  );
}
