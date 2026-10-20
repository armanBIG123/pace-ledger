// A person's photo, or their initials when they haven't added one (or it
// doesn't load).
import { useEffect, useState } from 'react';
import { fetchAvatarsShared } from '../data/avatars.js';

export function Avatar({ url, className = '', style, children }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [url]);
  if (url && !broken) {
    return <img className={`${className} tr-avatar-img`} src={url} alt="" aria-hidden="true" loading="lazy" decoding="async" onError={() => setBroken(true)} />;
  }
  return <span className={className} style={style} aria-hidden="true">{children}</span>;
}

// Everyone's photos (id -> url), updated when someone changes theirs here.
export function useAvatars() {
  const [map, setMap] = useState(() => new Map());
  useEffect(() => {
    let alive = true;
    const load = () => fetchAvatarsShared().then(m => { if (alive) setMap(m); });
    load();
    window.addEventListener('paceledger:avatars-changed', load);
    return () => { alive = false; window.removeEventListener('paceledger:avatars-changed', load); };
  }, []);
  return map;
}
