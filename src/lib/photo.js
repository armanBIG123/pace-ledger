// Profile photos: open the picked file, fit it in a circle (drag to move,
// zoom to fill), and save a small square JPEG. Everything happens on the
// device; only the finished 512 × 512 photo is uploaded.

export const PHOTO_MAX_MB = 15;     // what you can pick (phone photos are 2–8 MB)
export const PHOTO_MIN_PX = 200;    // smaller than this looks blurry
export const PHOTO_GOOD_PX = 400;   // what we recommend
export const PHOTO_OUT_PX = 512;    // what we save
export const PHOTO_ZOOM_MAX = 3;

const IMAGE_NAME = /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i;

// { ok: true, img, w, h, url } or { ok: false, error } where error is
// 'type' | 'size' | 'unreadable' | 'small'.
export function loadPhoto(file) {
  return new Promise(resolve => {
    if (!file) { resolve({ ok: false, error: 'type' }); return; }
    if (!(String(file.type || '').startsWith('image/') || IMAGE_NAME.test(file.name || ''))) { resolve({ ok: false, error: 'type' }); return; }
    if (file.size > PHOTO_MAX_MB * 1024 * 1024) { resolve({ ok: false, error: 'size' }); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) { URL.revokeObjectURL(url); resolve({ ok: false, error: 'unreadable' }); return; }
      if (Math.min(w, h) < PHOTO_MIN_PX) { URL.revokeObjectURL(url); resolve({ ok: false, error: 'small', w, h }); return; }
      resolve({ ok: true, img, w, h, url });
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ ok: false, error: 'unreadable' }); };
    img.src = url;
  });
}

export function photoErrorText(res) {
  if (res.error === 'size') return `That photo is over ${PHOTO_MAX_MB} MB. Pick a smaller one (a screenshot of it works too).`;
  if (res.error === 'small') return `That photo is only ${res.w} × ${res.h} pixels, so it would look blurry. Pick one at least ${PHOTO_GOOD_PX} × ${PHOTO_GOOD_PX}.`;
  if (res.error === 'unreadable') return "This photo can't be opened here. Save it as a JPG or PNG and try again.";
  return 'Pick a photo: JPG, PNG, WebP or HEIC.';
}

// The photo's size in the circle at zoom 1: just big enough to fill it.
export function baseScale(w, h, stage) { return stage / Math.min(w, h); }

// Keeps the photo covering the whole circle (no empty edges).
export function clampPos(pos, w, h, scale, stage) {
  const dw = w * scale, dh = h * scale;
  return { x: Math.min(0, Math.max(stage - dw, pos.x)), y: Math.min(0, Math.max(stage - dh, pos.y)) };
}

// Where a new photo starts: centered, a little toward the top for tall
// photos (that's usually where the face is).
export function startPos(w, h, scale, stage) {
  const dw = w * scale, dh = h * scale;
  return clampPos({ x: (stage - dw) / 2, y: dh > stage ? (stage - dh) * 0.25 : (stage - dh) / 2 }, w, h, scale, stage);
}

// Zooming keeps whatever is in the middle of the circle in the middle.
export function zoomAround(pos, oldScale, newScale, w, h, stage) {
  const cx = (stage / 2 - pos.x) / oldScale, cy = (stage / 2 - pos.y) / oldScale;
  return clampPos({ x: stage / 2 - cx * newScale, y: stage / 2 - cy * newScale }, w, h, newScale, stage);
}

// The part of the photo inside the square, as a PHOTO_OUT_PX JPEG.
export function cropToBlob(img, pos, scale, stage, out = PHOTO_OUT_PX) {
  return new Promise(resolve => {
    const canvas = document.createElement('canvas');
    canvas.width = out; canvas.height = out;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out, out);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, -pos.x / scale, -pos.y / scale, stage / scale, stage / scale, 0, 0, out, out);
    canvas.toBlob(b => resolve(b), 'image/jpeg', 0.86);
  });
}
