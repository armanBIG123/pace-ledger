// Phone numbers: tidy display, and links that call or text from the phone
// (on a computer they hand off to whatever handles calls and texts there).

const digitsOf = raw => String(raw || '').replace(/[^\d+]/g, '');

// 7 to 15 digits, optionally starting with +.
export function isValidPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  return d.length >= 7 && d.length <= 15;
}

// (214) 555-0187 for US numbers; anything else as typed.
export function fmtPhone(raw) {
  const s = String(raw || '').trim();
  const d = s.replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return s;
}

export function telHref(raw) {
  return `tel:${digitsOf(raw)}`;
}

// iPhones and Macs read the message after "&body=", everything else after "?body=".
export function smsHref(raw, body = '') {
  const apple = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
  const num = digitsOf(raw);
  return body ? `sms:${num}${apple ? '&' : '?'}body=${encodeURIComponent(body)}` : `sms:${num}`;
}
