// ---------------------------------------------------------------------
// styles — single global stylesheet, injected via <style>{CSS}</style>
// in App.jsx's root Shell component.
// ---------------------------------------------------------------------
export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,600;6..72,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap');

.tr-root {
  --ink: #14202B;
  --ink-2: #1C2E3D;
  --paper: #FBFAF6;
  --paper-dim: #EFEBDF;
  --card: #FFFFFF;
  --brass: #C9A24B;
  --brass-dark: #A9843A;
  --green: #3F8F6C;
  --amber: #D98E3B;
  --rust: #B8503D;
  --violet: #7C5FA6;
  --violet-dark: #6B4E96;
  --type-recruit: #3574B8;
  --type-recruit-dark: #285A91;
  --type-sale: #D9772E;
  --type-sale-dark: #B45F1E;
  --slate: #33414D;
  --slate-light: #7C8998;
  --line: rgba(19,35,48,0.12);

  font-family: 'IBM Plex Sans', system-ui, sans-serif;
  color: var(--slate);
  background: var(--paper-dim);
  min-height: 100vh;
  width: 100%;
}
.tr-root *, .tr-root *::before, .tr-root *::after { box-sizing: border-box; }
.tr-root :focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }
.tr-mono { font-family: 'IBM Plex Mono', monospace; }

/* cross-browser normalization — Chrome, Safari, and Edge each style
   native form controls quite differently by default; this makes every
   select look and behave the same everywhere instead of relying on
   whatever each browser's default chrome happens to look like. */
.tr-root { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
.tr-root button, .tr-root a, .tr-root select, .tr-root input, .tr-root [role="button"] { -webkit-tap-highlight-color: transparent; }
.tr-root select {
  -webkit-appearance: none; -moz-appearance: none; appearance: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><path d='M0 0L5 6L10 0Z' fill='%2333414D'/></svg>");
  background-repeat: no-repeat;
  background-position: right 10px center;
  padding-right: 28px;
  cursor: pointer;
}
.tr-root select::-ms-expand { display: none; }
/* Safari renders date/time inputs with extra internal padding around the
   picker icon that Chrome doesn't add — this keeps the visible height
   consistent with every other input regardless of browser. */
.tr-root input[type="date"], .tr-root input[type="time"] { min-height: 38px; }


/* header */
.tr-header {
  background: var(--ink);
  color: var(--paper);
  display: flex; align-items: center; justify-content: space-between;
  padding: calc(14px + env(safe-area-inset-top, 0px)) 24px 14px;
  position: sticky; top: 0; z-index: 10;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.tr-brand { display: flex; align-items: center; gap: 8px; font-family: 'Newsreader', serif; font-size: 20px; font-weight: 600; color: var(--brass); letter-spacing: 0.2px; }
.tr-brand em { font-style: italic; color: var(--paper); font-weight: 600; }
.tr-brand-center { justify-content: center; }
.tr-header-user { display: flex; align-items: center; gap: 12px; }
.tr-header-name { font-weight: 500; }
.tr-header-role { text-transform: capitalize; font-size: 12px; padding: 3px 9px; border-radius: 999px; background: rgba(201,162,75,0.18); color: var(--brass); border: 1px solid rgba(201,162,75,0.35); }

/* layout */
.tr-main { max-width: 980px; margin: 0 auto; padding: 24px 20px calc(64px + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; gap: 20px; }
.tr-row-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.tr-h2 { font-family: 'Newsreader', serif; font-size: 21px; font-weight: 600; color: var(--ink); display: flex; align-items: center; gap: 8px; margin: 0; }
.tr-h3 { font-family: 'Newsreader', serif; font-size: 16px; font-weight: 600; color: var(--ink); margin: 0 0 10px; }
.tr-h4 { font-size: 12.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--slate-light); margin: 0 0 8px; }

/* open requirements: policy cards */
.tr-policy-card { display: flex; flex-direction: column; gap: 14px; }
.tr-policy-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.tr-policy-premium { font-size: 17px; font-weight: 600; color: var(--brass-dark); }
.tr-policy-fields { display: flex; flex-wrap: wrap; gap: 20px; padding: 12px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.tr-policy-notes { display: flex; flex-direction: column; gap: 10px; }
.tr-notes-list { display: flex; flex-direction: column; gap: 10px; max-height: 260px; overflow-y: auto; }
.tr-note-item { background: var(--paper); border-radius: 8px; padding: 8px 10px; font-size: 13.5px; }
.tr-note-meta { font-size: 11px; color: var(--slate-light); margin-bottom: 3px; }
.tr-note-add { display: flex; gap: 8px; }
.tr-note-add input { flex: 1; font-family: inherit; font-size: 14px; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); }
.tr-note-add input:focus { border-color: var(--brass); }

/* card */
.tr-card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 18px 20px; box-shadow: 0 1px 2px rgba(19,35,48,0.04); }
.tr-appt-group + .tr-appt-group { margin-top: 0; }

/* week nav */
.tr-weeknav { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.tr-weeknav-label { display: flex; align-items: center; gap: 8px; font-weight: 500; color: var(--ink); margin-right: auto; font-size: 15px; }
.tr-cal-personfilter { font-family: inherit; font-size: 13px; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); cursor: pointer; }
.tr-cal-personfilter:focus { border-color: var(--brass); }

/* buttons */
.tr-btn { display: inline-flex; align-items: center; gap: 6px; font-family: inherit; font-size: 14px; font-weight: 500; padding: 9px 16px; border-radius: 7px; border: 1px solid transparent; cursor: pointer; transition: background .15s, border-color .15s, transform .1s; }
.tr-btn:active { transform: translateY(1px); }
.tr-btn-brass { background: var(--brass); color: var(--ink); }
.tr-btn-brass:hover { background: var(--brass-dark); }
.tr-btn-brass:disabled { opacity: 0.6; cursor: default; }
.tr-btn-ghost { background: transparent; border-color: var(--line); color: var(--slate); }
.tr-btn-ghost:hover { background: var(--paper-dim); }
.tr-btn-sm { padding: 6px 12px; font-size: 13px; }
.tr-btn-block { width: 100%; justify-content: center; margin-top: 6px; }
.tr-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 7px; border: 1px solid transparent; background: transparent; color: inherit; cursor: pointer; }
/* Devices with a real touchscreen (not just a narrow window) get larger
   tap targets, matching Apple's and Google's 44px minimum — a mouse
   pointer doesn't need this, so desktop stays compact. */
@media (hover: none) and (pointer: coarse) {
  .tr-icon-btn { width: 44px; height: 44px; }
  .tr-btn { min-height: 44px; }
  .tr-checkbox-field input[type="checkbox"] { width: 22px; height: 22px; }
}
.tr-header .tr-icon-btn { color: var(--paper); }
.tr-header .tr-icon-btn:hover { background: rgba(255,255,255,0.1); }
.tr-main .tr-icon-btn:hover { background: var(--paper-dim); }

/* pace strip (signature element) */
.tr-pace { display: flex; flex-direction: column; gap: 14px; }
.tr-pace-hint { margin: 0; font-size: 13px; color: var(--slate-light); }
.tr-pace-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px 28px; }
.tr-pace-group { display: flex; flex-direction: column; gap: 8px; }
.tr-pace-label { display: flex; justify-content: space-between; font-size: 13px; font-weight: 500; color: var(--ink); text-transform: uppercase; letter-spacing: 0.04em; }
.tr-pace-count { color: var(--brass-dark); }
.tr-pace-row { display: flex; flex-wrap: wrap; gap: 7px; }
.tr-pill { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--line); background: transparent; display: inline-block; transition: background .15s, border-color .15s; }
.tr-pill-filled { background: var(--brass); border-color: var(--brass-dark); }
.tr-pill-alt.tr-pill-filled { background: var(--green); border-color: #2E6E51; }

/* forms */
.tr-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.tr-field { display: flex; flex-direction: column; gap: 5px; font-size: 13px; font-weight: 500; color: var(--slate); }
.tr-field-wide { grid-column: 1 / -1; }
.tr-field input, .tr-field select, .tr-field textarea { font-family: inherit; font-size: 14px; padding: 9px 10px; border-radius: 6px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); }
.tr-field select { padding-right: 28px; }
.tr-field textarea { resize: vertical; min-height: 88px; line-height: 1.5; }
.tr-field input:focus, .tr-field select:focus, .tr-field textarea:focus { border-color: var(--brass); }
.tr-badge { font-size: 12.5px; font-weight: 500; padding: 8px 10px; border-radius: 6px; border: 1px dashed var(--line); background: var(--paper); }
.tr-badge-weekend { color: var(--brass-dark); border-color: rgba(201,162,75,0.5); background: rgba(201,162,75,0.08); }
.tr-badge-weekday { color: #2E6E51; border-color: rgba(63,143,108,0.4); background: rgba(63,143,108,0.08); }
.tr-form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; }
.tr-checkbox-field { display: flex !important; flex-direction: row !important; align-items: center; gap: 8px; }
.tr-checkbox-field input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--brass); cursor: pointer; }
.tr-error { margin-top: 10px; font-size: 13px; color: var(--rust); background: rgba(184,80,61,0.08); border: 1px solid rgba(184,80,61,0.3); padding: 8px 10px; border-radius: 6px; }
.tr-link-btn { align-self: flex-start; background: none; border: none; padding: 0; margin-top: -4px; font-family: inherit; font-size: 12.5px; font-weight: 500; color: var(--brass-dark); cursor: pointer; text-decoration: underline; }
.tr-link-btn:hover { color: var(--ink); }
.tr-link-btn:disabled { opacity: 0.6; cursor: default; }

/* follow-up modal + pill choices */
.tr-modal-backdrop { position: fixed; inset: 0; background: rgba(20,32,43,0.55); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
.tr-modal-card { background: var(--card); border-radius: 12px; padding: 24px 22px; max-width: 440px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 8px 40px rgba(19,35,48,0.28); }
.tr-followup-list { display: flex; flex-direction: column; gap: 16px; margin-top: 4px; }
.tr-followup-subfields { display: flex; flex-direction: column; gap: 12px; padding: 12px; margin-top: -4px; border-left: 2px solid var(--line); background: var(--paper); border-radius: 0 8px 8px 0; }
.tr-pillrow { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 5px; }
.tr-pill-btn { font-family: inherit; font-size: 12.5px; font-weight: 500; padding: 7px 13px; border-radius: 999px; border: 1px solid var(--line); background: var(--paper); color: var(--slate); cursor: pointer; transition: background .15s, border-color .15s, color .15s; }
.tr-pill-btn:hover { border-color: var(--brass); }
.tr-pill-btn-active { background: var(--brass); border-color: var(--brass-dark); color: var(--ink); }

/* tables */
.tr-table-wrap { overflow-x: auto; }
.tr-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.tr-table th { text-align: left; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--slate-light); padding: 6px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; }
.tr-table td { padding: 9px 10px; border-bottom: 1px solid var(--line); color: var(--ink); vertical-align: top; }
.tr-table tbody tr:last-child td { border-bottom: none; }
/* A select embedded directly in a table cell (not inside a .tr-field)
   has no natural width limit — the browser sizes it to fit its widest
   option, which for something like a full tier name can force the whole
   table wider than the screen. This caps it and truncates with an
   ellipsis; the full text is still shown when the dropdown is opened. */
.tr-table td select { max-width: 190px; padding: 6px 26px 6px 8px; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-radius: 6px; border: 1px solid var(--line); background-color: var(--paper); color: var(--ink); }
.tr-note { color: var(--slate-light); }
.tr-empty { font-size: 13.5px; color: var(--slate-light); margin: 4px 0 0; }
.tr-subtitle { font-size: 13.5px; color: var(--slate-light); margin: -8px 0 16px; }
.tr-link { color: inherit; text-decoration: underline; }
.tr-form-section { margin-bottom: 14px; }
.tr-more-toggle { display: block; background: none; border: none; color: var(--brass-dark); font-family: inherit; font-size: 13px; font-weight: 500; cursor: pointer; padding: 4px 0 12px; }
.tr-more-toggle:hover { text-decoration: underline; }
.tr-trend-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
.tr-trend-title { font-size: 13px; font-weight: 600; color: var(--ink); }
.tr-trend-target-line { font-size: 11.5px; color: var(--slate-light); }
.tr-trend-bars { display: flex; align-items: flex-end; gap: 8px; height: 70px; }
.tr-trend-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; }
.tr-trend-bar-track { flex: 1; width: 100%; display: flex; align-items: flex-end; }
.tr-trend-bar { width: 100%; background: var(--paper-dim); border-radius: 3px 3px 0 0; transition: height .3s ease; }
.tr-trend-bar-good { background: rgba(63,143,108,0.55); }
.tr-trend-bar-current { background: var(--brass); }
.tr-trend-bar-current.tr-trend-bar-good { background: #3F8F6C; }
.tr-trend-num { font-size: 10.5px; color: var(--slate-light); font-variant-numeric: tabular-nums; }
.tr-bests { display: flex; gap: 20px; justify-content: space-around; }
.tr-bests-stat { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.tr-coaching-panel { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line); cursor: default; }
.tr-health-line { font-size: 13.5px; color: var(--slate); margin-bottom: 10px; }
.tr-health-good { color: #2E6E51; }
.tr-health-bad { color: var(--rust); font-weight: 600; }
.tr-health-warn { color: var(--amber); font-weight: 600; }
.tr-audit-list { margin-top: 12px; display: flex; flex-direction: column; gap: 2px; }
.tr-audit-row { display: flex; gap: 10px; font-size: 13px; padding: 7px 0; border-bottom: 1px solid var(--line); }
.tr-audit-row:last-child { border-bottom: none; }
.tr-audit-time { color: var(--slate-light); font-size: 11.5px; white-space: nowrap; min-width: 110px; }

.tr-summary-card { padding: 0; overflow: hidden; }
.tr-table-summary th, .tr-table-summary td { padding: 12px 16px; }
.tr-clickable-row { cursor: pointer; }
.tr-clickable-row:hover { background: var(--paper-dim); }
.tr-expand-row td { background: var(--paper); padding: 16px; }
.tr-expand-row .tr-card { margin-bottom: 12px; }
.tr-expand-row .tr-card:last-child { margin-bottom: 0; }

.tr-minibar-wrap { display: flex; align-items: center; gap: 6px; min-width: 84px; }
.tr-minibar-track { flex: 1; height: 7px; border-radius: 999px; background: var(--paper-dim); overflow: hidden; }
.tr-minibar-fill { height: 100%; background: var(--brass); border-radius: 999px; }
.tr-minibar-num { font-size: 12px; color: var(--slate-light); white-space: nowrap; }

.tr-status { font-size: 12px; font-weight: 500; padding: 4px 10px; border-radius: 999px; white-space: nowrap; }
.tr-status-green { background: rgba(63,143,108,0.12); color: #2E6E51; }
.tr-status-amber { background: rgba(217,142,59,0.14); color: #9C6423; }
.tr-status-rust { background: rgba(184,80,61,0.12); color: var(--rust); }
.tr-status-violet { background: rgba(124,95,166,0.14); color: var(--violet-dark); }
.tr-status-none { background: transparent; color: var(--slate-light); border: 1px dashed var(--line); }

/* recruit/sale type coding */
.tr-type-badge { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; font-weight: 500; padding: 3px 7px 3px 6px; border-radius: 999px; white-space: nowrap; margin-left: 6px; vertical-align: middle; }
.tr-type-badge-recruit { background: rgba(53,116,184,0.12); color: var(--type-recruit-dark); }
.tr-type-badge-sale { background: rgba(217,119,46,0.12); color: var(--type-sale-dark); }
.tr-type-badge-both { background: linear-gradient(90deg, rgba(53,116,184,0.12), rgba(217,119,46,0.12)); color: var(--ink); }
.tr-type-badge-stale { background: rgba(184,80,61,0.12); color: var(--rust); }
.tr-funnel { display: flex; flex-direction: column; gap: 10px; }
.tr-funnel-stage { display: grid; grid-template-columns: 90px 1fr 90px; align-items: center; gap: 10px; }
.tr-funnel-stage-label { font-size: 12.5px; color: var(--slate); }
.tr-funnel-track { height: 16px; background: var(--paper-dim); border-radius: 4px; overflow: hidden; }
.tr-funnel-bar { height: 100%; background: var(--brass); border-radius: 4px; transition: width .3s ease; }
.tr-funnel-bar-converted { background: #3F8F6C; }
.tr-funnel-bar-recruit { background: var(--type-recruit); }
.tr-funnel-bar-sale { background: var(--type-sale); }
.tr-funnel-stage-count { font-size: 12.5px; color: var(--slate-light); text-align: right; font-variant-numeric: tabular-nums; }
.tr-prospect-chars { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--line); }
.tr-prospect-char-group { display: flex; flex-direction: column; gap: 8px; }
.tr-prospect-char-row { align-items: flex-start !important; }
.tr-prospect-card { display: flex; flex-direction: column; gap: 4px; }
.tr-prospect-char-pills { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.tr-prospect-char-pill { font-size: 11px; padding: 3px 9px; border-radius: 999px; background: var(--paper-dim); color: var(--slate); }
.tr-prospect-rank { flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; background: var(--brass); color: var(--ink); font-weight: 700; font-size: 13px; }
.tr-tier-card { border-color: var(--line); }
.tr-tier-card-current { border-color: var(--brass); box-shadow: 0 0 0 1px var(--brass); }
.tr-tier-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.tr-tier-abbr { display: inline-block; min-width: 40px; padding: 2px 8px; margin-right: 10px; border-radius: 5px; background: var(--paper-dim); color: var(--brass-dark); font-weight: 700; font-size: 12.5px; text-align: center; }
.tr-tier-commission { font-size: 20px; font-weight: 700; color: var(--brass-dark); }
.tr-tier-criteria { margin: 8px 0 0; padding-left: 20px; font-size: 13.5px; color: var(--slate); }
.tr-tier-criteria li { margin-bottom: 3px; }
.tr-locked-value { font-family: inherit; font-size: 14px; padding: 9px 10px; border-radius: 6px; border: 1px solid var(--line); background: var(--paper-dim); color: var(--ink); }
.tr-progress-card { border-color: var(--brass); }
.tr-req-row { padding: 10px 0; border-bottom: 1px solid var(--line); }
.tr-req-row:last-child { border-bottom: none; }
.tr-req-row:not(.tr-req-row-bar) { display: flex; align-items: center; justify-content: space-between; }
.tr-req-label { font-size: 13.5px; color: var(--ink); }
.tr-req-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
.tr-req-nums { font-size: 12.5px; color: var(--slate-light); font-variant-numeric: tabular-nums; white-space: nowrap; }
.tr-req-track { height: 8px; background: var(--paper-dim); border-radius: 4px; overflow: hidden; }
.tr-req-bar { height: 100%; background: var(--brass); border-radius: 4px; transition: width .3s ease; }
.tr-req-bar-met { background: #3F8F6C; }
.tr-req-months { display: flex; gap: 8px; margin-top: 4px; }
.tr-req-month { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 6px; border-radius: 6px; background: var(--paper-dim); border: 1px solid var(--line); }
.tr-req-month-met { background: rgba(63,143,108,0.12); border-color: rgba(63,143,108,0.4); }
.tr-req-month-na { opacity: 0.5; }
.tr-req-month-na .tr-req-month-sum { font-size: 11px; font-weight: 400; font-style: italic; }
.tr-req-month-label { font-size: 11px; color: var(--slate-light); }
.tr-req-month-sum { font-size: 13px; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
.tr-document-card { padding: 14px 18px; }
.tr-document-icon { color: var(--brass-dark); flex-shrink: 0; }
.tr-links-list { list-style: none; margin: 0; padding: 0; }
.tr-links-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
.tr-links-row:last-child { border-bottom: none; }
.tr-links-anchor { color: var(--brass-dark); font-weight: 500; text-decoration: none; }
.tr-links-anchor:hover { text-decoration: underline; }
.tr-links-actions { display: flex; gap: 6px; flex-shrink: 0; }
.tr-links-edit-row { display: flex; gap: 8px; align-items: center; width: 100%; }
.tr-links-edit-row input { flex: 1; min-width: 0; font: inherit; padding: 6px 9px; border-radius: 6px; border: 1px solid var(--line); }
.tr-prospect-outcome-row { display: flex; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line); }
.tr-type-recruit { box-shadow: inset 3px 0 0 0 var(--type-recruit); }
.tr-type-sale { box-shadow: inset 3px 0 0 0 var(--type-sale); }
.tr-type-both { border-left: 4px solid transparent; border-image: linear-gradient(180deg, var(--type-recruit) 50%, var(--type-sale) 50%) 1; }
.tr-pill-recruit.tr-pill-btn-active-recruit { background: var(--type-recruit); border-color: var(--type-recruit-dark); color: #fff; }
.tr-pill-sale.tr-pill-btn-active-sale { background: var(--type-sale); border-color: var(--type-sale-dark); color: #fff; }
.tr-typefilter-row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.tr-search-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; background: var(--paper); border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px; }
.tr-search-icon { color: var(--slate-light); flex-shrink: 0; }
.tr-search-input { flex: 1; border: none; background: none; font-family: inherit; font-size: 14px; color: var(--ink); outline: none; }
.tr-search-input::placeholder { color: var(--slate-light); }
.tr-dash-strip { display: flex; gap: 12px; margin-bottom: 14px; }
.tr-dash-stat { flex: 1; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; background: var(--paper); border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; cursor: pointer; transition: border-color .15s, background .15s; font-family: inherit; text-align: left; }
.tr-dash-stat:hover { border-color: var(--brass); background: var(--paper-dim); }
.tr-dash-stat-static { cursor: default; }
.tr-dash-stat-static:hover { border-color: var(--line); background: var(--paper); }
.tr-dash-num { font-size: 22px; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }
.tr-dash-label { font-size: 12px; color: var(--slate-light); }
.tr-typefilter-label { font-size: 13px; font-weight: 500; color: var(--slate); }
.tr-typefilter-note { font-size: 12px; color: var(--slate-light); }

/* tenure */
.tr-tenure { font-size: 11px; color: var(--slate-light); margin-top: 2px; }

/* calendar */
.tr-cal-card { padding: 0; overflow: hidden; }
.tr-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); }
.tr-cal-headcell { padding: 10px 6px; text-align: center; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--slate-light); border-bottom: 1px solid var(--line); }
.tr-cal-day { min-width: 0; min-height: 92px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: 6px; cursor: default; display: flex; flex-direction: column; gap: 3px; }
.tr-cal-day:nth-child(7n) { border-right: none; }
.tr-cal-day-out { background: var(--paper); }
.tr-cal-day-out .tr-cal-daynum { color: var(--slate-light); }
.tr-cal-day-today { background: rgba(201,162,75,0.08); }
.tr-cal-daynum { font-size: 12.5px; font-weight: 600; color: var(--ink); }
.tr-cal-appts { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tr-cal-appt { font-size: 10.5px; line-height: 1.3; padding: 1px 4px; border-radius: 3px; background: var(--paper-dim); color: var(--slate); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; min-width: 0; }
.tr-cal-appt-recruit { border-left: 2px solid var(--type-recruit); }
.tr-cal-appt-sale { border-left: 2px solid var(--type-sale); }
.tr-cal-appt-both { border-left: 3px solid transparent; border-image: linear-gradient(180deg, var(--type-recruit) 50%, var(--type-sale) 50%) 1; }
.tr-cal-more { font-size: 10px; color: var(--slate-light); padding-left: 4px; }

/* google calendar */
.tr-google-card { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
.tr-cal-appt-google { border-left: 2px solid var(--slate-light); font-style: italic; }
.tr-note-item-google { border-left: 3px solid var(--slate-light); }

/* trainings — org-wide announcements, deliberately distinct from personal appointment colors */
.tr-training-post { border-color: var(--brass); }
.tr-cal-day-training-highlight { background: rgba(201,162,75,0.16); box-shadow: inset 0 0 0 2px var(--brass); }
.tr-cal-appt-training { border-left: 2px solid var(--brass); background: rgba(201,162,75,0.12); color: var(--brass-dark); font-weight: 600; display: flex; align-items: center; gap: 3px; }
.tr-note-item-training { border-left: 3px solid var(--brass); }

/* my schedule — manager availability blocks, distinct rust tone so a
   blocked-out time is never mistaken for an actual appointment */
.tr-cal-appt-unavailable { border-left: 2px solid var(--rust); background: rgba(184,80,61,0.12); color: var(--rust); font-weight: 600; display: flex; align-items: center; gap: 3px; }
.tr-note-item-unavailable { border-left: 3px solid var(--rust); }

/* toast banner */
.tr-toast { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 200; padding: 12px 40px 12px 16px; border-radius: 8px; font-size: 13.5px; font-weight: 500; box-shadow: 0 4px 20px rgba(19,35,48,0.25); max-width: 90vw; }
.tr-toast-success { background: #2E6E51; color: #fff; }
.tr-toast-error { background: var(--rust); color: #fff; }
.tr-toast-close { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; color: inherit; font-size: 18px; line-height: 1; cursor: pointer; opacity: 0.85; padding: 4px; }
.tr-cal-day:hover { background: var(--paper-dim); }

/* needs-attention sidebar */
.tr-appts-shell { display: flex; gap: 24px; align-items: flex-start; }
.tr-appts-sidebar { display: flex; flex-direction: column; gap: 4px; min-width: 190px; flex-shrink: 0; }
.tr-appts-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 20px; }
.tr-sidebar-item { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 9px 12px; border-radius: 8px; border: 1px solid transparent; border-left-width: 3px; background: transparent; font-family: inherit; font-size: 13px; font-weight: 500; color: var(--slate); cursor: pointer; text-align: left; }
.tr-sidebar-item:hover { background: var(--paper-dim); }
.tr-sidebar-item-active { background: var(--paper-dim); border-color: var(--line); }
.tr-sidebar-item .tr-mono { font-size: 11.5px; color: var(--slate-light); background: var(--paper); border-radius: 999px; padding: 1px 7px; }
.tr-sidebar-item-week { border-left-color: var(--brass); font-family: 'Newsreader', serif; font-size: 14.5px; }
.tr-sidebar-item-none { border-left-color: var(--slate-light); }
.tr-sidebar-item-green { border-left-color: var(--green); }
.tr-sidebar-item-amber { border-left-color: var(--amber); }
.tr-sidebar-item-recruit { border-left-color: var(--type-recruit); }
.tr-sidebar-item-sale { border-left-color: var(--type-sale); }
.tr-sidebar-item-rust { border-left-color: var(--rust); }
.tr-sidebar-item-violet { border-left-color: var(--violet); }
.tr-sidebar-divider { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--slate-light); padding: 14px 12px 2px; }

/* auth */
.tr-auth-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
.tr-auth-card { width: 100%; max-width: 400px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 28px 26px; box-shadow: 0 4px 24px rgba(19,35,48,0.08); }
.tr-auth-sub { text-align: center; font-size: 13.5px; color: var(--slate-light); margin: 6px 0 18px; }
.tr-tabs { display: flex; flex-wrap: wrap; background: var(--paper-dim); border-radius: 8px; padding: 3px; margin-bottom: 18px; }
.tr-tab { flex: 1; padding: 8px; border: none; background: transparent; border-radius: 6px; font-family: inherit; font-size: 13.5px; font-weight: 500; color: var(--slate-light); cursor: pointer; }
.tr-tab-active { background: var(--card); color: var(--ink); box-shadow: 0 1px 2px rgba(19,35,48,0.08); }
.tr-tab-groups { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.tr-tab-group { font-family: inherit; font-size: 13px; font-weight: 600; padding: 7px 16px; border-radius: 999px; border: 1px solid var(--line); background: var(--paper); color: var(--slate); cursor: pointer; transition: background .15s, border-color .15s, color .15s; }
.tr-tab-group:hover { border-color: var(--brass); }
.tr-tab-group-active { background: var(--brass); border-color: var(--brass-dark); color: var(--ink); }
.tr-auth-form { display: flex; flex-direction: column; gap: 12px; }

/* spinner */
.tr-spinner { display: flex; align-items: center; gap: 8px; color: var(--slate-light); font-size: 13.5px; padding: 24px; justify-content: center; }

/* skeleton loading */
.tr-skel { border-radius: 4px; background: linear-gradient(90deg, var(--paper-dim) 25%, var(--line) 37%, var(--paper-dim) 63%); background-size: 400% 100%; animation: tr-skel-shimmer 1.4s ease infinite; }
@keyframes tr-skel-shimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }
.tr-skel-row { display: flex; align-items: center; gap: 14px; padding: 10px 0; border-bottom: 1px solid var(--line); }
.tr-skel-row:last-child { border-bottom: none; }
@media (prefers-reduced-motion: no-preference) { .tr-spin { animation: tr-rotate 0.9s linear infinite; } }
@keyframes tr-rotate { to { transform: rotate(360deg); } }

/* business plan — expenses worksheet + prospecting goal calculator */
.tr-bizplan-step { padding: 16px 0; border-top: 1px solid var(--line); }
.tr-bizplan-step:first-of-type { border-top: none; padding-top: 0; }
.tr-bizplan-summary { margin-top: 16px; padding: 14px 16px; border-radius: 8px; background: var(--paper-dim); border: 1px solid var(--line); display: flex; flex-direction: column; gap: 8px; }
.tr-bizplan-summary-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; font-size: 13.5px; color: var(--slate); }
.tr-bizplan-summary-row .tr-mono { font-size: 15px; font-weight: 600; color: var(--ink); }
.tr-bizplan-summary-highlight { padding-top: 10px; margin-top: 2px; border-top: 1px dashed var(--line); }
.tr-bizplan-summary-highlight span:first-child { font-weight: 600; color: var(--ink); }
.tr-bizplan-summary-highlight .tr-mono { font-size: 20px; color: var(--brass-dark); }
.tr-bizplan-reset-link { background: none; border: none; padding: 2px 0; margin: -4px 0 0; font-family: inherit; font-size: 12px; color: var(--brass-dark); text-decoration: underline; cursor: pointer; text-align: left; }

/* client intake — public wizard + advisor tab */
.tr-intake-page { min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 32px 16px 64px; }
.tr-intake-narrow { width: 100%; max-width: 640px; }
.tr-intake-topbar { display: flex; align-items: center; justify-content: space-between; width: 100%; max-width: 640px; margin-bottom: 18px; font-size: 13px; color: var(--slate-light); }
.tr-intake-brand { display: flex; align-items: center; gap: 8px; font-family: 'Newsreader', serif; font-weight: 600; font-size: 17px; color: var(--ink); }
.tr-intake-center { text-align: center; padding: 40px 12px; }
.tr-intake-icon-badge { width: 56px; height: 56px; border-radius: 999px; background: rgba(63,143,108,0.14); color: var(--green); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }
.tr-intake-entry { position: relative; border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; margin-bottom: 12px; background: var(--paper); }
.tr-intake-entry-remove { position: absolute; top: 10px; right: 10px; background: none; border: none; color: var(--slate-light); cursor: pointer; padding: 2px; line-height: 0; }
.tr-intake-entry-remove:hover { color: var(--rust); }
.tr-intake-quickstart { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
.tr-intake-quickstart-chip { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 9px 12px; border: 1px dashed var(--line); border-radius: 8px; background: transparent; font-family: inherit; font-size: 13px; color: var(--slate); cursor: pointer; text-align: left; }
.tr-intake-quickstart-chip:hover { background: var(--paper-dim); }
.tr-intake-card-select { display: block; width: 100%; text-align: left; border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; margin-bottom: 8px; background: var(--paper); cursor: pointer; font-family: inherit; }
.tr-intake-card-select strong { display: block; font-size: 14px; color: var(--ink); }
.tr-intake-card-select span { font-size: 12.5px; color: var(--slate-light); }
.tr-intake-card-select-active { border-color: var(--brass); background: rgba(201,162,75,0.08); }
.tr-intake-summary-list { display: flex; flex-direction: column; gap: 10px; }
.tr-intake-summary-row { display: flex; justify-content: space-between; align-items: center; font-size: 13.5px; color: var(--slate); }
.tr-intake-steps-list { display: flex; flex-direction: column; gap: 10px; margin: 12px 0; }
.tr-intake-step-num { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 999px; background: var(--paper-dim); color: var(--slate); font-size: 11px; font-weight: 600; margin-right: 8px; flex-shrink: 0; }
.tr-intake-link-row { display: flex; align-items: center; gap: 8px; }
.tr-intake-link-box { flex: 1; font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--line); background: var(--paper-dim); color: var(--slate); overflow-x: auto; white-space: nowrap; }

/* responsive */
@media (max-width: 720px) {
  .tr-pace-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
  .tr-form-grid { grid-template-columns: 1fr; }
  .tr-prospect-chars { grid-template-columns: 1fr; }
  .tr-pace-grid { grid-template-columns: 1fr; }
  .tr-header { padding: calc(12px + env(safe-area-inset-top, 0px)) 16px 12px; }
  .tr-header-name { display: none; }
  .tr-main { padding: 18px 14px calc(48px + env(safe-area-inset-bottom, 0px)); }
  .tr-tabs { flex-wrap: wrap; }
  .tr-tabs .tr-tab { flex: 1 1 45%; }
  .tr-appts-shell { flex-direction: column; }
  .tr-appts-sidebar { flex-direction: row; flex-wrap: wrap; min-width: 0; width: 100%; gap: 6px; }
  .tr-sidebar-divider { flex-basis: 100%; padding: 8px 4px 0; }
  .tr-cal-day { min-height: 60px; padding: 3px; }
  .tr-cal-headcell { font-size: 9px; padding: 6px 1px; }
  .tr-cal-daynum { font-size: 11px; }
  .tr-cal-appt { font-size: 8.5px; padding: 0 2px; }
  .tr-dash-strip { gap: 8px; }
  .tr-dash-stat { padding: 10px 10px; }
  .tr-dash-num { font-size: 18px; }
  .tr-dash-label { font-size: 10.5px; }
  .tr-policy-fields { gap: 12px; }
  .tr-skel-row { gap: 8px; overflow-x: hidden; }
  .tr-skel-row .tr-skel { flex-shrink: 1; min-width: 30px; }
}
`;
