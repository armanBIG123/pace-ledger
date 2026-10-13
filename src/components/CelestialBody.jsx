// Level bodies: each hierarchy level drawn as something in space, growing with
// every promotion (comet, moon, blue planet, ringed planet, gas giant, star,
// giant star, blue supergiant, nebula, galaxy). Plus pace rings and star fields.
import React from 'react';

// Put <CelestialDefs /> once on any screen that draws bodies; every body on
// that screen (big or icon-sized) shares its gradients.
export function CelestialDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      <defs>
        <radialGradient id="plbComet" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#FFFFFF" /><stop offset="45%" stopColor="#BFE9FF" /><stop offset="100%" stopColor="#5BB8E8" stopOpacity="0" /></radialGradient>
        <linearGradient id="plbTail" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#9FDCFF" stopOpacity="0.85" /><stop offset="100%" stopColor="#9FDCFF" stopOpacity="0" /></linearGradient>
        <radialGradient id="plbMoon" cx="38%" cy="32%" r="75%"><stop offset="0%" stopColor="#E9EDF1" /><stop offset="60%" stopColor="#AEB7C1" /><stop offset="100%" stopColor="#6E7884" /></radialGradient>
        <radialGradient id="plbEarth" cx="36%" cy="30%" r="78%"><stop offset="0%" stopColor="#7CC6FF" /><stop offset="55%" stopColor="#2B79C9" /><stop offset="100%" stopColor="#123E73" /></radialGradient>
        <radialGradient id="plbSaturn" cx="38%" cy="30%" r="78%"><stop offset="0%" stopColor="#FBE3AE" /><stop offset="60%" stopColor="#D9A85D" /><stop offset="100%" stopColor="#8E6430" /></radialGradient>
        <radialGradient id="plbJupiter" cx="38%" cy="30%" r="80%"><stop offset="0%" stopColor="#F6DFC3" /><stop offset="60%" stopColor="#C98E5B" /><stop offset="100%" stopColor="#7A4B2A" /></radialGradient>
        <radialGradient id="plbPlain" cx="36%" cy="30%" r="78%"><stop offset="0%" stopColor="#B9C8D6" /><stop offset="60%" stopColor="#6F8396" /><stop offset="100%" stopColor="#3E4F60" /></radialGradient>
        <radialGradient id="plbShade" cx="35%" cy="30%" r="80%"><stop offset="0%" stopColor="#fff" stopOpacity="0.35" /><stop offset="55%" stopColor="#fff" stopOpacity="0" /><stop offset="100%" stopColor="#000" stopOpacity="0.35" /></radialGradient>
        <radialGradient id="plbStarY" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#FFFDF2" /><stop offset="40%" stopColor="#FFE68A" /><stop offset="75%" stopColor="#F2B83A" /><stop offset="100%" stopColor="#F2B83A" stopOpacity="0" /></radialGradient>
        <radialGradient id="plbStarO" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#FFF4E0" /><stop offset="35%" stopColor="#FFB45C" /><stop offset="70%" stopColor="#E8692B" /><stop offset="100%" stopColor="#E8692B" stopOpacity="0" /></radialGradient>
        <radialGradient id="plbStarB" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#FFFFFF" /><stop offset="35%" stopColor="#CFE6FF" /><stop offset="70%" stopColor="#6FA8FF" /><stop offset="100%" stopColor="#6FA8FF" stopOpacity="0" /></radialGradient>
        <radialGradient id="plbNebP" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#F7B6FF" stopOpacity="0.9" /><stop offset="100%" stopColor="#9B4BD6" stopOpacity="0" /></radialGradient>
        <radialGradient id="plbNebC" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#8FF0E8" stopOpacity="0.8" /><stop offset="100%" stopColor="#2A7FC0" stopOpacity="0" /></radialGradient>
        <radialGradient id="plbGalCore" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#FFFFFF" /><stop offset="30%" stopColor="#FFE9B8" /><stop offset="100%" stopColor="#C9A0FF" stopOpacity="0" /></radialGradient>
        {/* One circular clip for every banded planet: it fits whatever square
            the clipped group spans, so no per-planet ids are needed. */}
        <clipPath id="plbDisc" clipPathUnits="objectBoundingBox"><circle cx="0.5" cy="0.5" r="0.5" /></clipPath>
        <filter id="plbSoft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2" /></filter>
        <filter id="plbGlow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5" /></filter>
      </defs>
    </svg>
  );
}

// What each level looks like, for labels ("Blue planet · 50% commission").
export const BODY_NAMES = {
  UA: 'Comet', FA: 'Moon', SA: 'Blue planet', AD: 'Ringed planet', FD: 'Gas giant',
  SFD: 'Star', DFD: 'Giant star', EFD: 'Blue supergiant', FVC: 'Nebula', EVC: 'Galaxy',
};
export const bodyName = tier => BODY_NAMES[tier] || 'Planet';

// Clipped bands/land inside a planet. The invisible square sets the group's
// bounding box to the planet's, so the shared circular clip lands exactly.
function Inside({ cx, cy, r, rotate, children }) {
  return (
    <g clipPath="url(#plbDisc)" transform={rotate ? `rotate(${rotate} ${cx} ${cy})` : undefined}>
      <rect x={cx - r} y={cy - r} width={2 * r} height={2 * r} fill="none" />
      {children}
    </g>
  );
}

function Comet({ cx, cy, r, faded }) {
  return (
    <g opacity={faded ? 0.45 : 1}>
      <path d={`M${cx} ${cy - r * 0.55} L${cx + r * 5.2} ${cy - r * 2.1} L${cx + r * 5.4} ${cy - r * 1.6} L${cx + r * 0.6} ${cy + r * 0.2} Z`} fill="url(#plbTail)" opacity="0.8" filter="url(#plbSoft)" />
      <circle cx={cx} cy={cy} r={r * 1.9} fill="url(#plbComet)" />
      <circle cx={cx} cy={cy} r={r * 0.62} fill="#fff" />
    </g>
  );
}
const CRATERS = [[-0.3, -0.15, 0.22], [0.35, 0.25, 0.16], [0.05, 0.45, 0.12], [0.3, -0.4, 0.1]];
function Moon({ cx, cy, r }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="url(#plbMoon)" />
      {CRATERS.map(([dx, dy, rr], i) => <circle key={i} cx={cx + dx * r} cy={cy + dy * r} r={rr * r} fill="#7E8893" opacity="0.45" />)}
      <circle cx={cx} cy={cy} r={r} fill="url(#plbShade)" />
    </g>
  );
}
function Earth({ cx, cy, r }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="url(#plbEarth)" />
      <Inside cx={cx} cy={cy} r={r}>
        <path d={`M${cx - r * 0.9} ${cy - r * 0.1} q${r * 0.4} ${-r * 0.6} ${r * 0.9} ${-r * 0.35} t${r * 0.5} ${r * 0.3} q${-r * 0.2} ${r * 0.5} ${-r * 0.8} ${r * 0.4} z`} fill="#3FA06A" />
        <path d={`M${cx + r * 0.15} ${cy + r * 0.35} q${r * 0.35} ${-r * 0.2} ${r * 0.7} ${r * 0.05} q${-r * 0.1} ${r * 0.4} ${-r * 0.6} ${r * 0.35} z`} fill="#3FA06A" />
        <path d={`M${cx - r} ${cy + r * 0.15} q${r} ${-r * 0.25} ${r * 2} ${r * 0.1}`} stroke="#fff" strokeOpacity="0.55" strokeWidth={r * 0.09} fill="none" />
      </Inside>
      <circle cx={cx} cy={cy} r={r} fill="url(#plbShade)" />
      <circle cx={cx} cy={cy} r={r * 1.12} fill="none" stroke="#8FD0FF" strokeOpacity="0.35" strokeWidth={r * 0.08} />
    </g>
  );
}
const SATURN_BANDS = [[-0.55, 0.16, '#B9864A'], [-0.15, 0.1, '#F7E2B6'], [0.2, 0.18, '#B9864A'], [0.55, 0.1, '#A7743D']];
function Saturn({ cx, cy, r }) {
  const ring = (front) => (
    <path d={front ? `M${cx + r * 2.1} ${cy} A${r * 2.1} ${r * 0.62} 0 0 1 ${cx - r * 2.1} ${cy}` : `M${cx - r * 2.1} ${cy} A${r * 2.1} ${r * 0.62} 0 0 1 ${cx + r * 2.1} ${cy}`}
      transform={`rotate(-18 ${cx} ${cy})`} fill="none" stroke={front ? '#F2DCA8' : '#E9CC92'} strokeWidth={r * 0.28} opacity={front ? 0.95 : 0.75} />
  );
  return (
    <g>
      {ring(false)}
      <circle cx={cx} cy={cy} r={r} fill="url(#plbSaturn)" />
      <Inside cx={cx} cy={cy} r={r} rotate={-18}>
        {SATURN_BANDS.map(([o, h, c], i) => <rect key={i} x={cx - r} y={cy + o * r} width={2 * r} height={h * r} fill={c} opacity="0.5" />)}
      </Inside>
      <circle cx={cx} cy={cy} r={r} fill="url(#plbShade)" />
      {ring(true)}
    </g>
  );
}
const JUPITER_BANDS = [[-0.8, 0.14, '#E8C9A1'], [-0.55, 0.18, '#9C6238'], [-0.25, 0.14, '#F1DCC0'], [-0.02, 0.2, '#B4754A'], [0.3, 0.12, '#EBD3B4'], [0.5, 0.2, '#8E5733'], [0.78, 0.14, '#D9B38C']];
function Jupiter({ cx, cy, r }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="url(#plbJupiter)" />
      <Inside cx={cx} cy={cy} r={r}>
        {JUPITER_BANDS.map(([o, h, c], i) => <rect key={i} x={cx - r} y={cy + o * r} width={2 * r} height={h * r} fill={c} opacity="0.65" />)}
        <ellipse cx={cx + r * 0.32} cy={cy + r * 0.42} rx={r * 0.22} ry={r * 0.12} fill="#C0472C" opacity="0.9" />
      </Inside>
      <circle cx={cx} cy={cy} r={r} fill="url(#plbShade)" />
    </g>
  );
}
function Plain({ cx, cy, r }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="url(#plbPlain)" />
      <circle cx={cx} cy={cy} r={r} fill="url(#plbShade)" />
    </g>
  );
}
function Star({ cx, cy, r, grad = 'plbStarY', core = '#FFFDF2' }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r * 2.4} fill={`url(#${grad})`} opacity="0.55" filter="url(#plbGlow)" />
      <circle cx={cx} cy={cy} r={r * 1.5} fill={`url(#${grad})`} />
      <circle cx={cx} cy={cy} r={r * 0.72} fill={core} />
    </g>
  );
}
function GiantStar({ cx, cy, r }) {
  return (
    <g>
      <g filter="url(#plbSoft)">
        {Array.from({ length: 12 }, (_, k) => {
          const a = (k * Math.PI) / 6, len = r * (k % 2 ? 2.2 : 1.7);
          return <line key={k} x1={cx} y1={cy} x2={cx + Math.cos(a) * len} y2={cy + Math.sin(a) * len} stroke="#FFB45C" strokeOpacity="0.5" strokeWidth={r * 0.09} strokeLinecap="round" />;
        })}
      </g>
      <Star cx={cx} cy={cy} r={r} grad="plbStarO" core="#FFF1D6" />
    </g>
  );
}
function BlueStar({ cx, cy, r }) {
  return (
    <g>
      <Star cx={cx} cy={cy} r={r} grad="plbStarB" core="#FFFFFF" />
      <g opacity="0.85">
        <path d={`M${cx - r * 2.8} ${cy} L${cx} ${cy - r * 0.12} L${cx + r * 2.8} ${cy} L${cx} ${cy + r * 0.12} Z`} fill="#DDEBFF" />
        <path d={`M${cx} ${cy - r * 2.8} L${cx + r * 0.12} ${cy} L${cx} ${cy + r * 2.8} L${cx - r * 0.12} ${cy} Z`} fill="#DDEBFF" />
      </g>
    </g>
  );
}
const NEB_BLOBS = [[-0.4, -0.2, 1.5, 0.9, 'plbNebP', 20], [0.45, 0.25, 1.4, 0.8, 'plbNebC', -25], [0.1, -0.1, 1.1, 1.1, 'plbNebP', 0]];
function Nebula({ cx, cy, r }) {
  return (
    <g>
      <g filter="url(#plbSoft)">
        {NEB_BLOBS.map(([dx, dy, rx, ry, g, rot], i) => <ellipse key={i} cx={cx + dx * r} cy={cy + dy * r} rx={rx * r} ry={ry * r} fill={`url(#${g})`} transform={`rotate(${rot} ${cx} ${cy})`} />)}
      </g>
      <Star cx={cx - r * 0.25} cy={cy} r={r * 0.42} grad="plbStarB" core="#fff" />
      <Star cx={cx + r * 0.35} cy={cy + r * 0.1} r={r * 0.32} grad="plbStarY" core="#fff" />
    </g>
  );
}
// Galaxy arms are drawn once at unit size and scaled into place.
const GALAXY_ARMS = [0, 1].map(k => {
  const pts = [];
  for (let t = 0; t < 120; t++) {
    const a = (t / 120) * 3.6 * Math.PI + k * Math.PI;
    const rad = 0.12 + (1.05 * t) / 120;
    pts.push(`${(Math.cos(a) * rad).toFixed(3)} ${(Math.sin(a) * rad * 0.62).toFixed(3)}`);
  }
  return 'M' + pts.join(' L');
});
const GALAXY_DUST = (() => {
  let seed = 5;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  return Array.from({ length: 30 }, () => [(rnd() - 0.5) * 2.4, (rnd() - 0.5) * 1.4, rnd() * 0.05 + 0.02, rnd() * 0.6 + 0.2]);
})();
function Galaxy({ cx, cy, r }) {
  return (
    <g transform={`translate(${cx} ${cy}) scale(${r})`}>
      {GALAXY_ARMS.map((d, i) => (
        <g key={i}>
          <path d={d} fill="none" stroke="#C9B6FF" strokeOpacity="0.45" strokeWidth="0.3" strokeLinecap="round" />
          <path d={d} fill="none" stroke="#C9B6FF" strokeOpacity="0.75" strokeWidth="0.16" strokeLinecap="round" />
          <path d={d} fill="none" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="0.05" strokeLinecap="round" />
        </g>
      ))}
      {GALAXY_DUST.map(([x, y, s, o], i) => <circle key={i} cx={x} cy={y} r={s} fill="#fff" opacity={o} />)}
      <ellipse cx="0" cy="0" rx="0.6" ry="0.42" fill="url(#plbGalCore)" />
    </g>
  );
}

const KINDS = { UA: Comet, FA: Moon, SA: Earth, AD: Saturn, FD: Jupiter, SFD: Star, DFD: GiantStar, EFD: BlueStar, FVC: Nebula, EVC: Galaxy };

// One person's level, centred on (cx, cy). `faded` dims it (gone quiet).
export function CelestialBody({ tier, r, cx = 0, cy = 0, faded = false }) {
  const Kind = KINDS[tier] || Plain;
  return (
    <g className="tr-body" opacity={faded && tier !== 'UA' ? 0.45 : 1}>
      <Kind cx={cx} cy={cy} r={r} faded={faded} />
    </g>
  );
}

// Relative size per level, so the picture grows as people move up.
export const BODY_SCALE = { UA: 0.7, FA: 0.85, SA: 1, AD: 0.92, FD: 1.25, SFD: 1, DFD: 1.08, EFD: 1.08, FVC: 1.25, EVC: 1.35 };
export const bodyScale = tier => BODY_SCALE[tier] || 0.85;
// How far out the pace ring sits for a body of radius r (outside Saturn's rings).
export const ringRadius = (tier, r) => (tier === 'AD' ? r * 2.3 : r + Math.max(5, r * 0.4));

// A small round badge with someone's level in it (lists, cards).
const ICON_R = { UA: [4.5, -7], FA: [8, 0], SA: [9, 0], AD: [7, 0], FD: [10, 0], SFD: [7, 0], DFD: [6.5, 0], EFD: [6.5, 0], FVC: [8, 0], EVC: [9, 0] };
export function BodyIcon({ tier, size = 30, faded = false, title }) {
  const [r, dx] = ICON_R[tier] || [8, 0];
  return (
    <span className="tr-body-icon" style={{ width: size, height: size, opacity: faded ? 0.55 : 1 }} title={title}>
      <svg width={size} height={size} viewBox="-20 -20 40 40" aria-hidden="true" focusable="false">
        <CelestialBody tier={tier} r={r} cx={dx} cy={0} faded={faded} />
      </svg>
    </span>
  );
}

// This week's pace as a ring that fills toward the weekly target.
export const PACE_COLORS = { met: '#4FB286', progress: '#E0A84A', missed: '#E0664C' };
export function PaceRing({ r, done, target, status, width = 3, cx = 0, cy = 0 }) {
  const c = 2 * Math.PI * r;
  const filled = c * Math.max(0, Math.min(1, target ? done / target : 0));
  return (
    <g className="tr-pace-ring">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={width} />
      {filled > 0 && (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={PACE_COLORS[status] || PACE_COLORS.progress} strokeWidth={width} strokeLinecap="round"
          strokeDasharray={`${filled.toFixed(2)} ${c.toFixed(2)}`} transform={`rotate(-90 ${cx} ${cy})`} />
      )}
    </g>
  );
}

// A fixed, repeatable star field for a w x h space.
export function makeStars(count, w, h, seed = 7) {
  let s = seed;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  return Array.from({ length: count }, () => ({ x: rnd() * w, y: rnd() * h, r: rnd() * 1.1 + 0.3, o: rnd() * 0.5 + 0.25, d: rnd() * 4 }));
}

// The whole journey, comet to galaxy, with the current level ringed.
export function JourneyStrip({ tiers, current, youLabel = 'You' }) {
  const n = tiers.length, w = 330, step = (w - 40) / (n - 1);
  const ci = tiers.indexOf(current);
  const R = { UA: 3.2, FA: 5, SA: 6.5, AD: 5, FD: 7, SFD: 5, DFD: 4.6, EFD: 4.6, FVC: 5.5, EVC: 6 };
  return (
    <svg className="tr-journey" viewBox={`0 0 ${w} 46`} role="img" aria-label={`The path from ${tiers[0]} to ${tiers[n - 1]}${ci >= 0 ? `, you are at ${current}` : ''}`}>
      <line x1="20" y1="16" x2={w - 20} y2="16" stroke="rgba(255,255,255,0.18)" strokeDasharray="2 5" />
      {tiers.map((t, i) => {
        const x = 20 + i * step;
        return (
          <g key={t} opacity={ci === -1 ? 0.6 : i < ci ? 0.6 : i === ci ? 1 : 0.38}>
            <CelestialBody tier={t} r={R[t] || 5} cx={x} cy={16} />
            {i === ci && <circle cx={x} cy="16" r="11" fill="none" stroke="#F2C866" strokeWidth="1.6" />}
          </g>
        );
      })}
      <text x="20" y="42" textAnchor="middle" className={`tr-journey-label ${ci === 0 ? 'tr-journey-you' : ''}`}>{ci === 0 ? youLabel : tiers[0]}</text>
      {ci > 0 && ci < n - 1 && <text x={20 + ci * step} y="42" textAnchor="middle" className="tr-journey-label tr-journey-you">{youLabel}</text>}
      <text x={w - 20} y="42" textAnchor="middle" className={`tr-journey-label ${ci === n - 1 ? 'tr-journey-you' : ''}`}>{ci === n - 1 ? youLabel : tiers[n - 1]}</text>
    </svg>
  );
}
