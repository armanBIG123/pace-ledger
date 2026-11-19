// Artwork for the challenge banner, drawn here (no image files): the
// Thanksgiving turkey running the BIG Bird Blitz (with a medal once there are
// winners), autumn leaves, and a trophy for the Classic look.
import { useId } from 'react';

const FEATHERS = [
  // angle, scale, base, inner
  [-70, 0.86, '#7E2635', '#9C3B48'], [-47, 0.94, '#A83D2C', '#C35A44'], [-23, 1, '#CF6A27', '#E58A45'], [0, 1, '#DFA03A', '#EFBE60'],
  [23, 1, '#CF6A27', '#E58A45'], [47, 0.94, '#A83D2C', '#C35A44'], [70, 0.86, '#7E2635', '#9C3B48'],
];

export function TurkeyArt({ medal = false, className = '' }) {
  const id = `pl-tk${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg className={className} viewBox="0 0 180 150" aria-hidden="true" focusable="false">
      <defs><clipPath id={id}><ellipse cy="-40" rx="12.5" ry="40" /></clipPath></defs>
      <g fill="#E6CFA6"><circle cx="46" cy="140" r="4.6" /><circle cx="37" cy="135.5" r="3.3" /><circle cx="29" cy="140" r="2.3" /></g>
      <g stroke="#D9B988" strokeWidth="3.2" strokeLinecap="round"><line x1="8" y1="122" x2="24" y2="122" /><line x1="2" y1="131" x2="20" y2="131" /></g>
      <g transform="translate(12 0)">
        <g transform="translate(66 98) rotate(-18)">
          {FEATHERS.map(([a, s, base, inner]) => (
            <g key={a} transform={`rotate(${a}) scale(${s})`} clipPath={`url(#${id})`}>
              <rect x="-14" y="-82" width="28" height="84" fill={base} />
              <ellipse cy="-38" rx="6" ry="22" fill={inner} />
              <rect x="-14" y="-82" width="28" height="15" fill="#4B2A18" opacity=".55" />
              <rect x="-14" y="-67.5" width="28" height="4.2" fill="#FBEBD0" />
            </g>
          ))}
        </g>
        <g stroke="#D9772B" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M72 122 L63 132 L51 135 M51 135 L46 132 M51 135 L47 139" />
          <path d="M90 124 L97 134 L108 139 M108 139 L114 137 M108 139 L113 143" />
        </g>
        <ellipse cx="81" cy="102" rx="31" ry="27" fill="#6E4024" transform="rotate(-10 81 102)" />
        <ellipse cx="92" cy="109" rx="16" ry="14" fill="#8C5530" />
        <g transform="rotate(16 74 103)">
          <ellipse cx="74" cy="103" rx="18" ry="11" fill="#55311B" />
          <path d="M62 101 Q72 99 84 101 M60 106 Q70 105 82 107" stroke="#7A4A2C" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </g>
        <ellipse cx="102" cy="80" rx="11" ry="15" fill="#7A4728" transform="rotate(20 102 80)" />
        <circle cx="108" cy="63" r="14.5" fill="#8A5530" />
        {/* a sweatband in BIG blue */}
        <path d="M95.5 57.5 Q108 50 121 55" stroke="#0060B1" strokeWidth="4.6" fill="none" strokeLinecap="round" />
        <path d="M96 57 L85 50 M96 57.5 L86 61" stroke="#0060B1" strokeWidth="3.2" strokeLinecap="round" />
        <circle cx="113" cy="63" r="4.4" fill="#FFF8EC" />
        <circle cx="114.4" cy="63.6" r="2.4" fill="#22160E" />
        <circle cx="115.2" cy="62.6" r=".9" fill="#FFF" />
        <path d="M120.5 64.5 L131 68.5 L120.5 72 Z" fill="#E7A93A" stroke="#E7A93A" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M120 72 C123 76 123 83 119 86 C116 83 116 77 120 72 Z" fill="#C2372B" />
        <circle cx="107" cy="69.5" r="3" fill="#C2372B" opacity=".3" />
        {medal ? (
          <g>
            <path d="M96 76 L101 96 L106 96 L108 77" stroke="#0060B1" strokeWidth="4" fill="none" strokeLinejoin="round" />
            <circle cx="103.5" cy="101" r="8" fill="#E9B949" stroke="#B8872A" strokeWidth="1.6" />
            <path d="M103.5 96.5 L104.9 99.5 L108 99.8 L105.6 101.8 L106.4 104.9 L103.5 103.2 L100.6 104.9 L101.4 101.8 L99 99.8 L102.1 99.5 Z" fill="#FFF3CF" />
          </g>
        ) : null}
      </g>
    </svg>
  );
}

const MAPLE = 'M20 0 L23.5 9 L31 5.5 L28.5 14.5 L38 13 L33 21 L37 24 L27.5 27 L29 33 L21.5 30 L21 38 L19 38 L18.5 30 L11 33 L12.5 27 L3 24 L7 21 L2 13 L11.5 14.5 L9 5.5 L16.5 9 Z';
function MapleLeaf({ color, vein }) {
  return (
    <svg viewBox="-1 -1 42 42">
      <path d={MAPLE} fill={color} stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M20 37 L20 9 M20 27 L10.5 19.5 M20 27 L29.5 19.5 M20 19 L14 12 M20 19 L26 12" stroke={vein} strokeWidth="1.1" fill="none" strokeLinecap="round" />
    </svg>
  );
}
function Leaf({ color, vein }) {
  return (
    <svg viewBox="-12 -16 24 34">
      <path d="M0 -14 C9 -7 9 7 0 14 C-9 7 -9 -7 0 -14 Z" fill={color} />
      <path d="M0 -11 L0 17 M0 -3 L-4 -7 M0 -3 L4 -7 M0 4 L-5 0 M0 4 L5 0" stroke={vein} strokeWidth="1" fill="none" strokeLinecap="round" />
    </svg>
  );
}
function Acorn() {
  return (
    <svg viewBox="0 0 24 30">
      <path d="M12 5 L13 1" stroke="#5B3A22" strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="12" cy="19" rx="7.5" ry="9" fill="#C98A3F" />
      <ellipse cx="10" cy="17" rx="2" ry="4" fill="#E1A85C" />
      <path d="M2.5 11 C2.5 4.5 21.5 4.5 21.5 11 C21.5 13 2.5 13 2.5 11 Z" fill="#7A4A2A" />
      <path d="M6 8 L8 11 M10 7 L12 11 M14 7 L16 11 M18 8 L19 10.5" stroke="#5B3A22" strokeWidth=".9" strokeLinecap="round" />
    </svg>
  );
}

// Leaves around the edges of the banner. pos: CSS for where each one sits.
const LEAVES = [
  { kind: 'maple', color: '#B0432F', vein: '#8A2F20', size: 38, rot: -24, pos: { left: -9, top: -11 } },
  { kind: 'leaf', color: '#E0A23A', vein: '#B87C1E', size: 20, rot: 38, pos: { left: '35%', top: -7 } },
  { kind: 'maple', color: '#D9772B', vein: '#A9561A', size: 30, rot: 162, pos: { left: '63%', bottom: -13 } },
  { kind: 'maple', color: '#8E2C3A', vein: '#6B1E2A', size: 40, rot: 28, pos: { right: -12, top: -6 } },
  { kind: 'acorn', size: 18, rot: -18, pos: { right: '33%', top: 5 } },
  { kind: 'leaf', color: '#8C9A52', vein: '#66733A', size: 17, rot: -52, pos: { left: '27%', bottom: 4 } },
  { kind: 'leaf', color: '#C9612E', vein: '#9B4520', size: 15, rot: 70, pos: { right: 10, bottom: 8 } },
];
export function LeafScatter() {
  return (
    <div className="tr-chal-leaves" aria-hidden="true">
      {LEAVES.map((l, i) => (
        <span key={i} className={`tr-chal-leaf tr-chal-leaf-${i}`} style={{ ...l.pos, width: l.size, height: l.size, transform: `rotate(${l.rot}deg)` }}>
          {l.kind === 'maple' ? <MapleLeaf color={l.color} vein={l.vein} /> : l.kind === 'acorn' ? <Acorn /> : <Leaf color={l.color} vein={l.vein} />}
        </span>
      ))}
    </div>
  );
}

// Classic: a brass trophy with a laurel and a few sparkles.
export function TrophyArt({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <g fill="#F2C866" opacity=".9">
        <path d="M16 22 l2.2 5.8 5.8 2.2 -5.8 2.2 -2.2 5.8 -2.2 -5.8 -5.8 -2.2 5.8 -2.2 Z" />
        <path d="M100 14 l1.6 4.2 4.2 1.6 -4.2 1.6 -1.6 4.2 -1.6 -4.2 -4.2 -1.6 4.2 -1.6 Z" />
        <path d="M104 70 l1.3 3.4 3.4 1.3 -3.4 1.3 -1.3 3.4 -1.3 -3.4 -3.4 -1.3 3.4 -1.3 Z" />
      </g>
      <g stroke="#C49A3C" strokeWidth="5" fill="none" strokeLinecap="round">
        <path d="M38 34 C22 34 22 58 44 60" /><path d="M82 34 C98 34 98 58 76 60" />
      </g>
      <path d="M36 24 H84 V44 C84 62 74 72 60 72 C46 72 36 62 36 44 Z" fill="#E1B04F" />
      <path d="M44 28 H52 V46 C52 56 56 62 60 64 C50 62 44 56 44 46 Z" fill="#F6D58A" opacity=".8" />
      <rect x="55" y="72" width="10" height="14" fill="#C49A3C" />
      <path d="M42 98 C42 90 48 86 60 86 C72 86 78 90 78 98 Z" fill="#B48B30" />
      <rect x="36" y="98" width="48" height="10" rx="3" fill="#86651D" />
      <path d="M60 36 l3.5 7.2 7.9 1.1 -5.7 5.6 1.4 7.8 -7.1 -3.7 -7.1 3.7 1.4 -7.8 -5.7 -5.6 7.9 -1.1 Z" fill="#FFF3CF" />
    </svg>
  );
}
