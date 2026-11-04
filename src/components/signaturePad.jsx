// Drawing a signature with a finger, stylus or mouse. Used before the
// producer agreement opens (components/contracting.jsx). The picture is
// trimmed to the ink and handed back as a PNG data URL.
import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';

const INK = '#16233a';

// ref: { clear(), isEmpty(), toDataUrl() }. onChange(hasInk).
export const SignaturePad = forwardRef(function SignaturePad({ label = 'Draw your signature', onChange, height = 170 }, ref) {
  const canvas = useRef(null);
  const strokes = useRef([]); // [[{x, y}, ...], ...] in CSS pixels
  const drawing = useRef(null);
  const [empty, setEmpty] = useState(true);
  const changed = useRef(onChange);
  changed.current = onChange;

  // Size the canvas to its box (sharp on high-density screens) and redraw.
  const paint = () => {
    const c = canvas.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) {
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
    }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, r.width, r.height);
    g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = 2.6;
    strokes.current.forEach(s => {
      if (s.length === 1) { g.beginPath(); g.arc(s[0].x, s[0].y, 1.6, 0, Math.PI * 2); g.fill(); return; }
      g.beginPath();
      g.moveTo(s[0].x, s[0].y);
      for (let i = 1; i < s.length - 1; i++) {
        const mx = (s[i].x + s[i + 1].x) / 2, my = (s[i].y + s[i + 1].y) / 2;
        g.quadraticCurveTo(s[i].x, s[i].y, mx, my);
      }
      const last = s[s.length - 1];
      g.lineTo(last.x, last.y);
      g.stroke();
    });
  };
  useEffect(() => {
    paint();
    const again = () => paint();
    window.addEventListener('resize', again);
    return () => window.removeEventListener('resize', again);
  }, []);

  const at = e => { const r = canvas.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = e => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    canvas.current.setPointerCapture && canvas.current.setPointerCapture(e.pointerId);
    drawing.current = [at(e)];
    strokes.current.push(drawing.current);
    paint();
  };
  const move = e => {
    if (!drawing.current) return;
    e.preventDefault();
    const p = at(e);
    const last = drawing.current[drawing.current.length - 1];
    if (Math.abs(p.x - last.x) + Math.abs(p.y - last.y) < 1) return;
    drawing.current.push(p);
    paint();
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = null;
    const has = strokes.current.length > 0;
    if (has !== empty) return;
    setEmpty(!has);
    if (changed.current) changed.current(has);
  };
  const clear = () => {
    strokes.current = [];
    paint();
    setEmpty(true);
    if (changed.current) changed.current(false);
  };
  // Enough ink to be a signature, not a stray tap.
  const inkLength = () => strokes.current.reduce((n, s) => n + s.slice(1).reduce((m, p, i) => m + Math.hypot(p.x - s[i].x, p.y - s[i].y), 0), 0);

  useImperativeHandle(ref, () => ({
    clear,
    isEmpty: () => strokes.current.length === 0,
    hasEnoughInk: () => inkLength() >= 60,
    // The ink only, on a transparent background, at 2x.
    toDataUrl: () => {
      const pts = strokes.current.flat();
      if (!pts.length) return '';
      const pad = 8, scale = 2;
      const minX = Math.max(0, Math.min(...pts.map(p => p.x)) - pad), minY = Math.max(0, Math.min(...pts.map(p => p.y)) - pad);
      const maxX = Math.max(...pts.map(p => p.x)) + pad, maxY = Math.max(...pts.map(p => p.y)) + pad;
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round((maxX - minX) * scale));
      out.height = Math.max(1, Math.round((maxY - minY) * scale));
      const g = out.getContext('2d');
      g.setTransform(scale, 0, 0, scale, -minX * scale, -minY * scale);
      g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = 2.6;
      strokes.current.forEach(s => {
        if (s.length === 1) { g.beginPath(); g.arc(s[0].x, s[0].y, 1.6, 0, Math.PI * 2); g.fill(); return; }
        g.beginPath(); g.moveTo(s[0].x, s[0].y);
        for (let i = 1; i < s.length - 1; i++) g.quadraticCurveTo(s[i].x, s[i].y, (s[i].x + s[i + 1].x) / 2, (s[i].y + s[i + 1].y) / 2);
        g.lineTo(s[s.length - 1].x, s[s.length - 1].y);
        g.stroke();
      });
      return out.toDataURL('image/png');
    },
  }));

  return (
    <div className="tr-sigpad">
      <canvas ref={canvas} className="tr-sigpad-canvas" style={{ height }} role="img" aria-label={empty ? `${label}: empty` : `${label}: drawn`}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
      <div className="tr-sigpad-line" aria-hidden="true"><span>✕</span></div>
      {empty ? <span className="tr-sigpad-hint" aria-hidden="true">{label} here</span> : null}
      <button type="button" className="tr-link-btn tr-sigpad-clear" onClick={clear} disabled={empty}>Clear</button>
    </div>
  );
});
