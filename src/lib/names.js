// Names typed in lower case, or all in capitals, get their capitals:
// "jonas ubaldo" -> "Jonas Ubaldo", "MARY-JANE O'NEIL" -> "Mary-Jane
// O'Neil", "maria de la cruz" -> "Maria de la Cruz", "john smith iii" ->
// "John Smith III". A word that already has a capital ("McDonald",
// "DeShawn") stays as typed. The database does the same as names are saved
// (pl_tidy_name in migration-tidy-names.sql); this shows it right away.
const PARTICLES = new Set(['de', 'del', 'della', 'der', 'den', 'di', 'da', 'das', 'do', 'dos', 'du', 'la', 'le', 'van', 'von', 'ter', 'y', 'e', 'bin']);
const ROMAN = new Set(['ii', 'iii', 'iv', 'vi', 'vii', 'viii']);
const AFTER = new Set(['-', "'", '’', '.']);

export function tidyName(name) {
  if (typeof name !== 'string') return name;
  let s = name.trim().replace(/\s+/g, ' ');
  if (!s) return s;
  if (s.replace(/[^\p{L}]/gu, '').length >= 2 && s === s.toUpperCase() && s !== s.toLowerCase()) s = s.toLowerCase();
  const hadCapital = s !== s.toLowerCase();
  const words = s.split(' ');
  return words.map((w, i) => {
    if (i > 0 && ROMAN.has(w.toLowerCase())) return w.toUpperCase();
    if (w !== w.toLowerCase() || !/\p{L}/u.test(w)) return w;
    // "de la", "van", ... inside a name (or typed that way on purpose)
    if (i < words.length - 1 && (i > 0 || hadCapital) && PARTICLES.has(w)) return w;
    let out = '';
    for (let k = 0; k < w.length; k++) out += k === 0 || AFTER.has(w[k - 1]) ? w[k].toUpperCase() : w[k];
    if (/^Mc\p{Ll}{2,}/u.test(out)) out = `Mc${out[2].toUpperCase()}${out.slice(3)}`;
    return out;
  }).join(' ');
}
