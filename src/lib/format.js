// Small formatting helpers: currency, CSV download, names and initials.
import { shareCsvFile } from '../native.js';

export function fmtCurrency(n) {
  if (n === null || n === undefined || isNaN(n)) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

// Client-side CSV export — no backend involved, just builds a file in the
// browser and triggers a normal download.
export async function downloadCSV(filename, rows) {
  const csv = rows.map(row => row.map(cell => {
    const s = String(cell ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n');
  // Inside the iPhone app a browser download does nothing; use the share sheet.
  try { if (await shareCsvFile(filename, csv)) return; } catch { /* fall back to a normal download */ }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((v || '').trim()); }

// The step-by-step path to licensed, above the license-number form.
export function lowerFirst(t) { return t ? t.charAt(0).toLowerCase() + t.slice(1) : ''; }

// ---------------------------------------------------------------------
// org chart — who reports to whom, with this week's pace rolled up
// ---------------------------------------------------------------------
export function personInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0] || '')[0] || '?').toUpperCase() + ((parts.length > 1 ? parts[parts.length - 1][0] : '') || '').toUpperCase();
}

export function shortName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || '';
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}
