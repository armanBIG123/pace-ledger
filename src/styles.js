// ---------------------------------------------------------------------
// styles — single global stylesheet, injected via <style>{CSS}</style>
// in App.jsx's root Shell component.
// ---------------------------------------------------------------------
export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,600;6..72,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap');

.tr-root {
  /* Ledger design system v2 — navy frame, brass for the one thing that
     matters on each screen, cool paper so status colors read cleanly. */
  --ink: #13212E;          /* frame + headings */
  --ink-2: #1B2D3D;
  --canvas: #EEF1F4;       /* page background */
  --paper: #F7F8FA;        /* quiet fills inside cards */
  --paper-dim: #EBEEF2;    /* tracks, hovers */
  --card: #FFFFFF;
  --brass: #C49A3C;        /* fills */
  --brass-dark: #8E6B1F;   /* brass text on white (AA) */
  --brass-tint: rgba(196,154,60,0.13);
  --green: #2E7D5B;
  --amber: #C27C1E;
  --rust: #B0432F;
  --violet: #6B51A0;
  --violet-dark: #5A4290;
  --type-recruit: #2D68A8;
  --type-recruit-dark: #24548A;
  --type-sale: #C4622A;
  --type-sale-dark: #A34E1E;
  --slate: #34424F;        /* body text */
  --slate-light: #5E6A77;  /* secondary text (5.5:1 on white, 4.9:1 on canvas) */
  --line: #DEE3E8;
  --line-strong: #C8D0D8;
  --radius: 12px;
  --radius-sm: 8px;
  --ring: 0 0 0 3px rgba(196,154,60,0.28);

  font-family: 'IBM Plex Sans', system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: var(--slate);
  background: var(--canvas);
  font-variant-numeric: tabular-nums;
  min-height: 100vh;
  width: 100%;
}
.tr-root *, .tr-root *::before, .tr-root *::after { box-sizing: border-box; }
.tr-root :focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }
/* Numbers line up in columns; no monospace face needed. */
.tr-mono { font-family: inherit; font-variant-numeric: tabular-nums; font-weight: 600; }
.tr-root ::selection { background: rgba(196,154,60,0.3); }

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


/* header — the navy frame. Brand + account on top, section tabs below;
   the active tab is marked by the one brass bar on the page. */
.tr-header {
  background: var(--ink);
  color: #fff;
  position: sticky; top: 0; z-index: 10;
  padding-top: env(safe-area-inset-top, 0px);
  box-shadow: 0 1px 0 rgba(0,0,0,0.2);
}
.tr-header-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; max-width: 1120px; margin: 0 auto; padding: 14px 24px; }
.tr-header-with-nav .tr-header-row { padding-bottom: 6px; }
.tr-header-nav { display: flex; align-items: flex-end; gap: 18px; max-width: 1120px; margin: 0 auto; padding: 0 24px; }
.tr-brand { display: flex; align-items: center; gap: 8px; font-family: 'Newsreader', serif; font-size: 21px; font-weight: 600; color: var(--brass); letter-spacing: 0.1px; }
.tr-brand em { font-style: italic; color: #fff; font-weight: 600; }
.tr-brand-center { justify-content: center; }
/* On white cards (sign-in, reset password) the brand needs ink, not white. */
.tr-auth-card .tr-brand em, .tr-card .tr-brand em { color: var(--ink); }
.tr-header-user { display: flex; align-items: center; gap: 12px; font-size: 14px; }
.tr-header-name, .tr-header-firstname { font-weight: 500; color: rgba(255,255,255,0.92); }
.tr-header-firstname { display: none; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tr-header-role { text-transform: capitalize; font-size: 12px; font-weight: 500; padding: 2px 9px; border-radius: 999px; color: var(--brass); border: 1px solid rgba(196,154,60,0.45); }

.tr-navtabs { display: flex; gap: 2px; overflow-x: auto; scrollbar-width: none; margin-bottom: -1px; }
.tr-navtabs::-webkit-scrollbar { display: none; }
.tr-navtab { position: relative; white-space: nowrap; padding: 12px 12px 13px; border: none; background: transparent; font-family: inherit; font-size: 14px; font-weight: 500; color: rgba(255,255,255,0.62); cursor: pointer; transition: color .15s; }
.tr-navtab:hover { color: #fff; }
.tr-navtab-on { color: #fff; }
.tr-navtab-on::after { content: ''; position: absolute; left: 12px; right: 12px; bottom: 0; height: 3px; border-radius: 3px 3px 0 0; background: var(--brass); }
.tr-header .tr-navtab:focus-visible { outline-offset: -4px; }
.tr-groupswitch { display: inline-flex; flex-shrink: 0; align-self: center; margin-bottom: 6px; padding: 3px; border-radius: 9px; background: rgba(255,255,255,0.08); }
.tr-groupswitch button { font-family: inherit; font-size: 13px; font-weight: 500; padding: 5px 12px; border-radius: 6px; border: none; background: transparent; color: rgba(255,255,255,0.7); cursor: pointer; white-space: nowrap; }
.tr-groupswitch button:hover { color: #fff; }
.tr-groupswitch .tr-groupswitch-on { background: #fff; color: var(--ink); }

/* layout */
.tr-main { max-width: 1120px; margin: 0 auto; padding: 28px 24px calc(72px + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; gap: 20px; }
.tr-row-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
/* Serif is reserved for page titles and headline figures; everything
   inside a card is set in Plex so the page reads in two clear voices. */
.tr-h2 { font-family: 'Newsreader', serif; font-size: 27px; line-height: 1.2; font-weight: 600; letter-spacing: -0.2px; color: var(--ink); display: flex; align-items: center; gap: 8px; margin: 0; }
.tr-section-title { font-size: 18px; line-height: 1.3; font-weight: 600; color: var(--ink); margin: 6px 0 0; }
.tr-section-title + .tr-subtitle { margin: -14px 0 0; }
.tr-h3 { font-size: 15px; line-height: 1.35; font-weight: 600; color: var(--ink); margin: 0 0 12px; }
.tr-h4 { font-size: 13px; font-weight: 600; color: var(--slate-light); margin: 0 0 8px; }

/* account sheet */
.tr-header-account { display: inline-flex; align-items: center; gap: 10px; padding: 4px 6px; margin: -4px -6px; border: none; border-radius: var(--radius-sm); background: transparent; font-family: inherit; color: inherit; cursor: pointer; }
.tr-header-account:hover { background: rgba(255,255,255,0.08); }
.tr-account-list { margin: 14px 0 12px; display: flex; flex-direction: column; gap: 0; }
.tr-account-list > div { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-top: 1px solid var(--line); font-size: 14px; }
.tr-account-list > div:first-child { border-top: none; }
.tr-account-list dt { color: var(--slate-light); }
.tr-account-list dd { margin: 0; color: var(--ink); font-weight: 500; text-align: right; overflow-wrap: anywhere; }
.tr-account-links { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 0 0 12px; font-size: 13.5px; }
.tr-account-links a { color: var(--brass-dark); }
.tr-account-danger { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line); }
.tr-account-warn { margin: 0 0 12px; font-size: 13.5px; color: var(--slate); }
.tr-link-danger { background: none; border: none; padding: 0; font-family: inherit; font-size: 13.5px; font-weight: 500; color: var(--rust); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
.tr-btn-danger { background: var(--rust); border-color: var(--rust); color: #fff; }
.tr-btn-danger:hover:not(:disabled) { background: #983826; }

/* iPhone app: keep the status bar area navy even after the header scrolls away */
.tr-root::before { content: ''; position: fixed; top: 0; left: 0; right: 0; height: env(safe-area-inset-top, 0px); background: #13212E; z-index: 95; pointer-events: none; }

/* page title row */
.tr-pagehead { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px 20px; flex-wrap: wrap; }
.tr-pagehead-text { min-width: 0; }
.tr-pagehead-sub { margin: 4px 0 0; font-size: 14px; color: var(--slate-light); }
.tr-pagehead-actions { display: flex; gap: 8px; flex-wrap: wrap; }

/* search + filters on one line */
.tr-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.tr-toolbar .tr-search-row { flex: 1 1 260px; margin: 0; }
.tr-toolbar-select { font-family: inherit; font-size: 13.5px; height: 42px; padding: 0 30px 0 12px; border-radius: var(--radius-sm); border: 1px solid var(--line-strong); background-color: var(--card); color: var(--ink); }
.tr-toolbar-select:focus { border-color: var(--brass); box-shadow: var(--ring); outline: none; }
.tr-toolbar .tr-btn-sm { min-height: 42px; }
.tr-toolbar .tr-seg { margin: 0; }
.tr-toolbar .tr-seg button { padding: 8px 13px; }
.tr-filterbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: -8px; }
.tr-filterbar .tr-seg { margin: 0; }
.tr-chip-toggle { display: inline-flex; align-items: center; gap: 7px; font-family: inherit; font-size: 13px; font-weight: 500; padding: 6px 12px; border-radius: 999px; border: 1px solid rgba(176,67,47,0.3); background: rgba(176,67,47,0.06); color: var(--rust); cursor: pointer; }
.tr-chip-toggle:hover { background: rgba(176,67,47,0.1); }
.tr-chip-toggle-on { background: var(--rust); border-color: var(--rust); color: #fff; }
.tr-chip-toggle-on:hover { background: #983826; }
.tr-chip-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.tr-fu-list { display: flex; flex-direction: column; gap: 10px; }

/* promotion ladder */
.tr-card.tr-ladder { list-style: none; margin: 0; padding: 8px 22px; }
.tr-rung { position: relative; display: flex; gap: 16px; padding: 14px 0; }
.tr-rung + .tr-rung { border-top: 1px solid var(--line); }
.tr-rung::before { content: ''; position: absolute; left: 10px; top: 0; bottom: 0; width: 2px; background: var(--line); }
.tr-rung:first-child::before { top: 24px; }
.tr-rung:last-child::before { bottom: calc(100% - 24px); }
.tr-rung-node { position: relative; z-index: 1; flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; margin-top: 1px; border-radius: 50%; background: var(--card); border: 2px solid var(--line-strong); color: #fff; }
.tr-rung-body { flex: 1; min-width: 0; }
.tr-rung-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.tr-rung-name { font-size: 15px; font-weight: 600; color: var(--ink); }
.tr-rung-abbr { margin-left: 4px; font-size: 12px; font-weight: 600; color: var(--slate-light); }
.tr-rung-pct { margin-left: auto; font-family: 'Newsreader', serif; font-size: 24px; line-height: 1; font-weight: 600; color: var(--ink); }
.tr-rung-meta { margin-top: 4px; font-size: 13px; color: var(--slate-light); }
.tr-rung-criteria { margin: 6px 0 0; padding-left: 18px; font-size: 13.5px; color: var(--slate); }
.tr-rung-criteria li { margin-bottom: 2px; }
.tr-rung-done .tr-rung-node { background: var(--green); border-color: var(--green); }
.tr-rung-done .tr-rung-name, .tr-rung-done .tr-rung-pct { color: var(--slate-light); }
.tr-rung-current { margin: 0 -22px; padding: 16px 22px; background: rgba(196,154,60,0.07); box-shadow: inset 3px 0 0 var(--brass); }
.tr-rung-current::before { left: 32px; }
.tr-rung-current .tr-rung-node { border-color: var(--brass); background: var(--brass); box-shadow: 0 0 0 4px rgba(196,154,60,0.2); }
.tr-rung-current .tr-rung-pct { color: var(--brass-dark); }
.tr-rung-next .tr-rung-node { border-color: var(--ink); }

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
.tr-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 20px 22px; }
.tr-appt-group + .tr-appt-group { margin-top: 0; }
.tr-appt-group { padding-bottom: 8px; }
.tr-appt-group-title { margin-bottom: 8px; }
/* Same column widths in every weekly batch table so the batches line up
   (wide screens only; narrower ones size columns to their content). */
@media (min-width: 1024px) {
  .tr-appt-group-week .tr-table { table-layout: fixed; }
  .tr-appt-group-week .th-when { width: 25%; }
  .tr-appt-group-week .th-presenter { width: 18%; }
  .tr-appt-group-week .th-trainee { width: 14%; }
  .tr-appt-group-week .th-actions { width: 204px; }
  .tr-appt-group-week .tr-table td { overflow-wrap: break-word; }
}
.tr-appt-group .td-actions { text-align: right; white-space: nowrap; }
.tr-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }

/* week nav */
.tr-weeknav { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.tr-weeknav-label { display: flex; align-items: center; gap: 8px; font-weight: 500; color: var(--ink); margin-right: auto; font-size: 15px; }
.tr-cal-personfilter { font-family: inherit; font-size: 13px; height: 34px; padding: 0 28px 0 10px; border-radius: var(--radius-sm); border: 1px solid var(--line-strong); background-color: var(--card); color: var(--ink); cursor: pointer; }
.tr-cal-personfilter:focus { border-color: var(--brass); box-shadow: var(--ring); outline: none; }

/* buttons */
.tr-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 38px; font-family: inherit; font-size: 14px; font-weight: 600; line-height: 1.2; padding: 8px 16px; border-radius: var(--radius-sm); border: 1px solid transparent; cursor: pointer; white-space: nowrap; transition: background .15s, border-color .15s, color .15s, box-shadow .15s; }
.tr-btn:focus-visible { outline: none; box-shadow: var(--ring); }
.tr-btn:disabled { opacity: 0.55; cursor: default; }
.tr-btn-brass { background: var(--brass); color: var(--ink); border-color: #B48B30; }
.tr-btn-brass:hover:not(:disabled) { background: #B48B30; }
.tr-btn-ghost { background: var(--card); border-color: var(--line-strong); color: var(--ink); font-weight: 500; }
.tr-btn-ghost:hover:not(:disabled) { background: var(--paper); border-color: #AEB8C2; }
.tr-btn-sm { min-height: 32px; padding: 5px 12px; font-size: 13px; }
.tr-btn-block { width: 100%; justify-content: center; margin-top: 6px; }
.tr-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: var(--radius-sm); border: 1px solid transparent; background: transparent; color: var(--slate-light); cursor: pointer; transition: background .15s, color .15s; }
.tr-main .tr-icon-btn:hover { color: var(--ink); }
/* Devices with a real touchscreen (not just a narrow window) get larger
   tap targets, matching Apple's and Google's 44px minimum — a mouse
   pointer doesn't need this, so desktop stays compact. */
@media (hover: none) and (pointer: coarse) {
  .tr-icon-btn { width: 44px; height: 44px; }
  .tr-btn { min-height: 44px; }
  .tr-checkbox-field input[type="checkbox"] { width: 22px; height: 22px; }
}
.tr-header .tr-icon-btn { color: rgba(255,255,255,0.8); }
.tr-header .tr-icon-btn:hover { background: rgba(255,255,255,0.1); }
.tr-main .tr-icon-btn:hover { background: var(--paper-dim); }

/* pace strip (signature element) */
.tr-pace { display: flex; flex-direction: column; gap: 14px; }
.tr-pace-hint { margin: 0; font-size: 13px; color: var(--slate-light); }
.tr-pace-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding-bottom: 14px; margin-bottom: 2px; border-bottom: 1px solid var(--line); }
.tr-pace-head .tr-weeknav { flex: 1 1 auto; }
.tr-pace-total { font-size: 13.5px; color: var(--slate-light); white-space: nowrap; }
.tr-pace-total strong { font-family: 'Newsreader', serif; font-size: 22px; font-weight: 600; color: var(--ink); margin-right: 2px; }
.tr-pace-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px 28px; }
.tr-pace-group { display: flex; flex-direction: column; gap: 8px; }
.tr-pace-label { display: flex; justify-content: space-between; font-size: 13.5px; font-weight: 600; color: var(--ink); }
.tr-pace-count { color: var(--brass-dark); }
.tr-pace-row { display: flex; flex-wrap: wrap; gap: 7px; }
.tr-pill { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--line); background: transparent; display: inline-block; transition: background .15s, border-color .15s; }
.tr-pill-filled { background: var(--brass); border-color: var(--brass-dark); }
.tr-pill-alt.tr-pill-filled { background: var(--green); border-color: #2E6E51; }

/* forms */
.tr-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.tr-field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; color: var(--ink); }
.tr-field-wide { grid-column: 1 / -1; }
.tr-field input, .tr-field select, .tr-field textarea { font-family: inherit; font-size: 14px; font-weight: 400; min-height: 40px; padding: 9px 12px; border-radius: var(--radius-sm); border: 1px solid var(--line-strong); background-color: var(--card); color: var(--ink); transition: border-color .15s, box-shadow .15s; }
.tr-field input::placeholder, .tr-field textarea::placeholder { color: #7A8591; }
.tr-field select { padding-right: 28px; }
.tr-field textarea { resize: vertical; min-height: 88px; line-height: 1.5; }
.tr-field input:focus, .tr-field select:focus, .tr-field textarea:focus { border-color: var(--brass); box-shadow: var(--ring); outline: none; }
.tr-field input:disabled, .tr-field select:disabled { background-color: var(--paper); color: var(--slate-light); }
.tr-badge { font-size: 12.5px; font-weight: 500; padding: 8px 10px; border-radius: 6px; border: 1px dashed var(--line); background: var(--paper); }
.tr-badge-weekend { color: var(--brass-dark); border-color: rgba(201,162,75,0.5); background: rgba(201,162,75,0.08); }
.tr-badge-weekday { color: #2E6E51; border-color: rgba(63,143,108,0.4); background: rgba(63,143,108,0.08); }
.tr-form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; }
.tr-checkbox-field { display: flex !important; flex-direction: row !important; align-items: center; gap: 8px; }
.tr-checkbox-field input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--brass); cursor: pointer; }
.tr-error { margin-top: 10px; font-size: 13px; color: var(--rust); background: rgba(176,67,47,0.07); border: 1px solid rgba(176,67,47,0.28); padding: 9px 12px; border-radius: var(--radius-sm); }
.tr-link-btn { align-self: flex-start; background: none; border: none; padding: 0; margin-top: -4px; font-family: inherit; font-size: 12.5px; font-weight: 500; color: var(--brass-dark); cursor: pointer; text-decoration: underline; }
.tr-link-btn:hover { color: var(--ink); }
.tr-link-btn:disabled { opacity: 0.6; cursor: default; }

/* follow-up modal + pill choices */
.tr-modal-backdrop { position: fixed; inset: 0; background: rgba(19,33,46,0.5); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
.tr-modal-card { background: var(--card); border-radius: 14px; padding: 26px 24px; max-width: 460px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 24px 60px rgba(19,33,46,0.3); }
@media (prefers-reduced-motion: no-preference) {
  .tr-modal-card { animation: tr-pop .18s ease-out; }
  @keyframes tr-pop { from { opacity: 0; transform: translateY(6px) scale(.985); } to { opacity: 1; transform: none; } }
}
.tr-followup-list { display: flex; flex-direction: column; gap: 16px; margin-top: 4px; }
.tr-followup-subfields { display: flex; flex-direction: column; gap: 12px; padding: 12px; margin-top: -4px; border-left: 2px solid var(--line); background: var(--paper); border-radius: 0 8px 8px 0; }
.tr-pillrow { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 5px; }
.tr-pill-btn { font-family: inherit; font-size: 13px; font-weight: 500; padding: 6px 13px; border-radius: 999px; border: 1px solid var(--line-strong); background: var(--card); color: var(--slate); cursor: pointer; transition: background .15s, border-color .15s, color .15s; }
.tr-pill-btn:hover { border-color: var(--ink); color: var(--ink); }
.tr-pill-btn-active, .tr-pill-btn-active:hover { background: var(--ink); border-color: var(--ink); color: #fff; }

/* tables */
.tr-table-wrap { overflow-x: auto; }
.tr-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.tr-table th { text-align: left; font-size: 12.5px; font-weight: 600; color: var(--slate-light); padding: 8px 12px; border-bottom: 1px solid var(--line); white-space: nowrap; }
.tr-table td { padding: 12px; border-bottom: 1px solid var(--line); color: var(--ink); vertical-align: top; }
.tr-table tbody tr { transition: background .12s; }
.tr-table tbody tr:last-child td { border-bottom: none; }
/* A select embedded directly in a table cell (not inside a .tr-field)
   has no natural width limit — the browser sizes it to fit its widest
   option, which for something like a full tier name can force the whole
   table wider than the screen. This caps it and truncates with an
   ellipsis; the full text is still shown when the dropdown is opened. */
.tr-table td select { max-width: 190px; padding: 6px 26px 6px 9px; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-radius: var(--radius-sm); border: 1px solid var(--line-strong); background-color: var(--card); color: var(--ink); }
.tr-note { color: var(--slate-light); }
.tr-empty { font-size: 13.5px; color: var(--slate-light); margin: 4px 0 0; }
.tr-subtitle { font-size: 14px; color: var(--slate-light); margin: -6px 0 16px; }
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

.tr-status { display: inline-flex; align-items: center; font-size: 12px; font-weight: 600; line-height: 1.3; padding: 3px 10px; border-radius: 999px; white-space: nowrap; }
.tr-status-green { background: rgba(46,125,91,0.11); color: #23654A; }
.tr-status-amber { background: rgba(194,124,30,0.13); color: #8A5410; }
.tr-status-rust { background: rgba(176,67,47,0.11); color: var(--rust); }
.tr-status-violet { background: rgba(107,81,160,0.12); color: var(--violet-dark); }
.tr-status-none { background: transparent; color: var(--slate-light); border: 1px dashed var(--line-strong); }

/* recruit/sale type coding */
.tr-type-badge { display: inline-flex; align-items: center; gap: 3px; font-size: 11.5px; font-weight: 600; line-height: 1.3; padding: 2px 8px; border-radius: 999px; white-space: nowrap; margin-left: 6px; vertical-align: middle; }
.tr-type-badge-recruit { background: rgba(45,104,168,0.11); color: var(--type-recruit-dark); }
.tr-type-badge-sale { background: rgba(196,98,42,0.11); color: var(--type-sale-dark); }
.tr-type-badge-both { background: linear-gradient(90deg, rgba(45,104,168,0.11), rgba(196,98,42,0.11)); color: var(--ink); }
.tr-type-badge-stale { background: rgba(176,67,47,0.11); color: var(--rust); }
.tr-funnel { display: flex; flex-direction: column; gap: 10px; padding: 0; }
.tr-funnel > .tr-h4 { padding: 16px 22px 0; margin: 0; }
.tr-funnel-strip { display: grid; grid-template-columns: repeat(4, 1fr); }
.tr-funnel-cell { display: flex; flex-direction: column; gap: 4px; padding: 16px 22px 18px; border-left: 1px solid var(--line); min-width: 0; }
.tr-funnel-cell:first-child { border-left: none; }
.tr-funnel-num { font-family: 'Newsreader', serif; font-size: 30px; line-height: 1; font-weight: 600; color: var(--ink); }
.tr-funnel-stage-label { font-size: 13px; font-weight: 500; color: var(--slate); }
.tr-funnel-pct { color: var(--slate-light); font-weight: 400; }
.tr-funnel-track { height: 4px; margin-top: 6px; background: var(--paper-dim); border-radius: 999px; overflow: hidden; }
.tr-funnel-bar { height: 100%; background: var(--brass); border-radius: 999px; transition: width .3s ease; }
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
.tr-prospect-rank { flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: var(--paper-dim); color: var(--slate); font-weight: 600; font-size: 12.5px; }
.tr-prospect-card .tr-prospect-rank { margin-top: 1px; }
.tr-score { display: inline-flex; align-items: center; gap: 7px; }
.tr-score-track { width: 44px; height: 5px; border-radius: 999px; background: var(--paper-dim); overflow: hidden; }
.tr-score-fill { display: block; height: 100%; border-radius: 999px; background: var(--brass); }
.tr-score .tr-mono { font-size: 13px; color: var(--ink); min-width: 26px; }
.tr-tier-card { border-color: var(--line); }
.tr-tier-card-current { border-color: var(--brass); box-shadow: 0 0 0 1px var(--brass); }
.tr-tier-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.tr-tier-abbr { display: inline-block; min-width: 42px; padding: 2px 8px; margin-right: 10px; border-radius: 6px; background: var(--paper-dim); color: var(--ink); font-weight: 700; font-size: 12px; text-align: center; }
.tr-tier-commission { font-family: 'Newsreader', serif; font-size: 26px; line-height: 1; font-weight: 600; color: var(--ink); }
.tr-tier-card-current .tr-tier-commission { color: var(--brass-dark); }
.tr-tier-criteria { margin: 8px 0 0; padding-left: 20px; font-size: 13.5px; color: var(--slate); }
.tr-tier-criteria li { margin-bottom: 3px; }
.tr-locked-value { font-family: inherit; font-size: 14px; font-weight: 400; padding: 9px 12px; border-radius: var(--radius-sm); border: 1px solid var(--line); background: var(--paper); color: var(--ink); }
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
.tr-search-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; min-height: 42px; background: var(--card); border: 1px solid var(--line-strong); border-radius: var(--radius-sm); padding: 6px 12px; transition: border-color .15s, box-shadow .15s; }
.tr-search-row:focus-within { border-color: var(--brass); box-shadow: var(--ring); }
.tr-search-icon { color: var(--slate-light); flex-shrink: 0; }
.tr-search-input { flex: 1; border: none; background: none; font-family: inherit; font-size: 14px; color: var(--ink); outline: none; }
.tr-search-input::placeholder { color: var(--slate-light); }
.tr-dash-strip { display: flex; gap: 12px; margin-bottom: 14px; }
.tr-dash-stat { flex: 1; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; background: var(--paper); border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; cursor: pointer; transition: border-color .15s, background .15s; font-family: inherit; text-align: left; }
.tr-dash-stat:hover { border-color: var(--brass); background: var(--paper-dim); }
.tr-dash-stat-static { cursor: default; }
.tr-dash-stat-static:hover { border-color: var(--line); background: var(--paper); }
.tr-dash-num { font-family: 'Newsreader', serif; font-size: 26px; line-height: 1.1; font-weight: 600; color: var(--ink); }
.tr-dash-label { font-size: 12px; color: var(--slate-light); }
.tr-typefilter-label { font-size: 13px; font-weight: 500; color: var(--slate); }
.tr-typefilter-note { font-size: 12px; color: var(--slate-light); }

/* tenure */
.tr-tenure { font-size: 11px; color: var(--slate-light); margin-top: 2px; }

/* calendar */
.tr-cal-card { padding: 0; overflow: hidden; }
.tr-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); }
.tr-cal-headcell { padding: 10px 6px; text-align: center; font-size: 12.5px; font-weight: 600; color: var(--slate-light); border-bottom: 1px solid var(--line); text-transform: capitalize; }
.tr-cal-day { min-width: 0; min-height: 92px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: 6px; cursor: pointer; display: flex; flex-direction: column; gap: 3px; }
.tr-cal-day:nth-child(7n) { border-right: none; }
.tr-cal-day-out { background: var(--paper); }
.tr-cal-day-out .tr-cal-daynum { color: var(--slate-light); }
.tr-cal-day-today { background: rgba(196,154,60,0.07); }
.tr-cal-daynum { font-size: 12.5px; font-weight: 600; color: var(--ink); }
.tr-cal-appts { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tr-cal-appt { font-size: 11px; line-height: 1.35; padding: 2px 5px; border-radius: 4px; background: var(--paper); color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; min-width: 0; }
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
.tr-toast { position: fixed; top: calc(16px + env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%); z-index: 200; padding: 12px 42px 12px 16px; border-radius: 10px; font-family: 'IBM Plex Sans', system-ui, sans-serif; font-size: 14px; font-weight: 500; box-shadow: 0 12px 32px rgba(19,33,46,0.28); max-width: 90vw; }
.tr-toast-success { background: #13212E; color: #fff; box-shadow: inset 3px 0 0 #2E7D5B, 0 12px 32px rgba(19,33,46,0.28); }
.tr-toast-error { background: #B0432F; color: #fff; } /* literal: the toast sits outside .tr-root, where the color tokens live */
.tr-toast-close { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; color: inherit; font-size: 18px; line-height: 1; cursor: pointer; opacity: 0.85; padding: 4px; }
.tr-cal-day:hover { background: var(--paper-dim); }

/* needs-attention sidebar */
.tr-appts-shell { display: flex; gap: 28px; align-items: flex-start; }
.tr-appts-sidebar { display: flex; flex-direction: column; gap: 2px; width: 212px; flex-shrink: 0; }
/* Side list follows you down long pages — only when the screen is tall
   enough to show all of it. */
@media (min-width: 641px) and (min-height: 760px) {
  .tr-appts-sidebar { position: sticky; top: 120px; max-height: calc(100vh - 136px); overflow-y: auto; }
}
.tr-appts-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 20px; }
/* Side lists: quiet rows; a small dot carries each status color, and only
   the selected row gets a surface. */
.tr-sidebar-item { position: relative; display: flex; justify-content: flex-start; align-items: center; gap: 10px; min-height: 38px; padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid transparent; background: transparent; font-family: inherit; font-size: 14px; font-weight: 500; color: var(--slate); cursor: pointer; text-align: left; transition: background .12s, color .12s; }
.tr-sidebar-item::before { content: ''; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: var(--dot, var(--line-strong)); }
.tr-sidebar-item:hover { background: rgba(19,33,46,0.05); color: var(--ink); }
.tr-sidebar-item-active, .tr-sidebar-item-active:hover { background: var(--card); border-color: var(--line); color: var(--ink); font-weight: 600; box-shadow: 0 1px 2px rgba(19,33,46,0.05); }
.tr-sidebar-item .tr-mono { margin-left: auto; font-size: 12px; font-weight: 600; color: var(--slate); min-width: 22px; text-align: center; padding: 1px 7px; border-radius: 999px; background: rgba(19,33,46,0.07); }
.tr-sidebar-item-active .tr-mono { background: var(--brass-tint); color: var(--brass-dark); }
/* Plain navigation rows (no status) carry no dot. */
.tr-sidebar-item-week::before { display: none; }
.tr-sidebar-item-none { --dot: #7F8B97; }
.tr-sidebar-item-green { --dot: var(--green); }
.tr-sidebar-item-amber { --dot: var(--amber); }
.tr-sidebar-item-recruit { --dot: var(--type-recruit); }
.tr-sidebar-item-sale { --dot: var(--type-sale); }
.tr-sidebar-item-rust { --dot: var(--rust); }
.tr-sidebar-item-violet { --dot: var(--violet); }
.tr-sidebar-divider { font-size: 12.5px; font-weight: 600; color: var(--slate-light); padding: 16px 12px 4px; }

/* auth */
.tr-auth-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
.tr-auth-card { width: 100%; max-width: 420px; background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 32px 28px; box-shadow: 0 12px 40px rgba(19,33,46,0.08); }
.tr-auth-sub { text-align: center; font-size: 13.5px; color: var(--slate-light); margin: 6px 0 18px; }
.tr-tabs { display: flex; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; background: var(--paper-dim); border-radius: 10px; padding: 3px; margin-bottom: 18px; }
.tr-tabs::-webkit-scrollbar { display: none; }
.tr-tab { flex: 1 1 auto; white-space: nowrap; padding: 8px 12px; border: none; background: transparent; border-radius: 6px; font-family: inherit; font-size: 13.5px; font-weight: 500; color: var(--slate-light); cursor: pointer; transition: color .15s, background .15s; }
.tr-tab:hover { color: var(--ink); }
.tr-tab-active { background: var(--card); color: var(--ink); box-shadow: 0 1px 3px rgba(19,33,46,0.12); }
.tr-tab-groups { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.tr-tab-group { font-family: inherit; font-size: 13px; font-weight: 500; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--line-strong); background: var(--card); color: var(--slate); cursor: pointer; transition: background .15s, border-color .15s, color .15s; }
.tr-tab-group:hover { border-color: var(--ink); color: var(--ink); }
.tr-tab-group-active, .tr-tab-group-active:hover { background: var(--ink); border-color: var(--ink); color: #fff; }
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
.tr-bizplan-summary { margin-top: 18px; padding: 16px 18px; border-radius: var(--radius-sm); background: var(--paper); border: 1px solid var(--line); display: flex; flex-direction: column; gap: 8px; }
.tr-bizplan-summary-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; font-size: 13.5px; color: var(--slate); }
.tr-bizplan-summary-row .tr-mono { font-size: 15px; font-weight: 600; color: var(--ink); }
.tr-bizplan-summary-highlight { padding-top: 10px; margin-top: 2px; border-top: 1px dashed var(--line); }
.tr-bizplan-summary-highlight span:first-child { font-weight: 600; color: var(--ink); }
.tr-bizplan-summary-highlight .tr-mono { font-family: 'Newsreader', serif; font-size: 30px; line-height: 1; color: var(--ink); }

/* prospecting — memory jogger */
.tr-jogger-cat-head { display: flex; align-items: center; justify-content: space-between; width: 100%; font-family: inherit; background: transparent; border: none; padding: 0; cursor: pointer; color: var(--slate-light); }
.tr-jogger-cat-head:hover { color: var(--ink); }
.tr-jogger-cat-head .tr-h4 { color: inherit; }

/* prospecting — compact list, quick add, flash */
.tr-root input[type="range"] { accent-color: var(--brass); }
.tr-root input[type="checkbox"] { accent-color: var(--brass); width: 16px; height: 16px; flex-shrink: 0; }
.tr-flash { font-size: 13.5px; padding: 10px 14px; border-radius: 8px; background: rgba(63,143,108,0.12); color: #2E6E51; border: 1px solid rgba(63,143,108,0.25); }
.tr-quickadd { display: flex; align-items: center; gap: 8px; padding: 10px 12px; }
.tr-quickadd-label { font-size: 13px; font-weight: 600; color: var(--ink); white-space: nowrap; }
.tr-quickadd input { flex: 1; min-width: 0; font-family: inherit; font-size: 14px; min-height: 36px; padding: 6px 12px; border-radius: var(--radius-sm); border: 1px solid var(--line-strong); background: var(--card); color: var(--ink); }
.tr-quickadd input:focus { border-color: var(--brass); box-shadow: var(--ring); outline: none; }
.tr-sort-select { border: none !important; background: transparent !important; font-size: 13px !important; color: var(--slate) !important; padding: 2px 22px 2px 8px !important; border-left: 1px solid var(--line) !important; border-radius: 0 !important; min-height: 0 !important; }
.tr-prospect-list { display: flex; flex-direction: column; gap: 8px; }
.tr-prospect-card-compact { padding: 12px 16px; }
.tr-prospect-card-compact .tr-prospect-rank { width: 26px; height: 26px; font-size: 12px; }
.tr-prospect-card-open { border-color: var(--line-strong); box-shadow: 0 4px 16px rgba(19,33,46,0.07); }
.tr-prospect-card-compact .tr-note { font-size: 12.5px; }
.tr-prospect-card-side { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.tr-type-badge-appt { background: rgba(63,143,108,0.12); color: #2E6E51; }
.tr-prospect-live-score { display: flex; align-items: center; gap: 8px; }

/* my appointments — slim connect banner, collapsed empty batches */
.tr-connect-slim { display: flex; align-items: center; gap: 12px; padding: 10px 12px 10px 14px; border-radius: var(--radius-sm); border: 1px solid var(--line); background: var(--card); font-size: 13.5px; color: var(--slate); }
.tr-connect-slim-on { border-style: solid; }
.tr-connect-dot { width: 8px; height: 8px; border-radius: 999px; background: var(--slate-light); flex-shrink: 0; }
.tr-connect-slim-on .tr-connect-dot { background: var(--green); }
.tr-connect-text { flex: 1 1 240px; min-width: 0; }
.tr-connect-text strong { color: var(--ink); font-weight: 600; }
.tr-empty-batches { margin: -6px 0 0; font-size: 12.5px; }
.tr-appt-client { color: var(--ink); font-weight: 600; }

/* business plan — autosave, $/% affixes, numbers at a glance */
.tr-autosave { margin-top: 16px; text-align: right; font-size: 12.5px; color: var(--slate-light); }
.tr-autosave-error { color: var(--rust); font-weight: 500; }
.tr-input-affix { position: relative; display: flex; }
.tr-input-affix > input { width: 100%; }
.tr-input-affix > span { position: absolute; top: 50%; transform: translateY(-50%); font-size: 14px; color: var(--slate-light); pointer-events: none; }
.tr-input-affix-pre > span { left: 11px; }
.tr-input-affix-pre > input { padding-left: 24px !important; }
.tr-input-affix-post > span { right: 12px; }
.tr-input-affix-post > input { padding-right: 28px !important; }
.tr-bizplan-glance { margin-top: 10px; padding: 4px 12px 10px; border-radius: 8px; background: var(--paper); border: 1px solid var(--line); font-size: 12.5px; }
.tr-bizplan-glance > div:not(.tr-sidebar-divider) { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; color: var(--slate-light); }
.tr-bizplan-glance strong { color: var(--ink); font-variant-numeric: tabular-nums; }

/* calendar — view toggle, list view, legend, today marker */
.tr-seg { display: inline-flex; background: rgba(19,33,46,0.07); border-radius: 9px; padding: 3px; margin-right: 6px; }
.tr-seg button { font-family: inherit; font-size: 13px; font-weight: 500; border: none; background: transparent; color: var(--slate); padding: 5px 12px; border-radius: 6px; cursor: pointer; }
.tr-seg .tr-seg-on { background: var(--card); color: var(--ink); font-weight: 600; box-shadow: 0 1px 3px rgba(19,33,46,0.12); }
.tr-cal-day-today .tr-cal-daynum span { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; padding: 0 5px; border-radius: 999px; background: var(--brass); color: var(--ink); }
.tr-cal-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; font-size: 12px; color: var(--slate-light); margin-top: -8px; }
.tr-cal-legend span { display: inline-flex; align-items: center; gap: 5px; }
.tr-cal-legend-hint { margin-left: auto; }
.tr-lg { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.tr-lg-sale { background: var(--type-sale); }
.tr-lg-recruit { background: var(--type-recruit); }
.tr-lg-training { background: var(--brass); }
.tr-lg-block { background: var(--rust); }
.tr-lg-google { background: var(--slate-light); }
.tr-agenda { padding: 6px 20px 14px; }
.tr-agenda-day { padding-top: 12px; }
.tr-agenda-date { display: block; width: 100%; text-align: left; background: none; border: none; border-bottom: 1px solid var(--line); padding: 0 0 6px; font-family: inherit; font-size: 13px; font-weight: 600; color: var(--slate-light); cursor: pointer; }
.tr-agenda-today .tr-agenda-date { color: var(--brass-dark); border-bottom-color: var(--brass); }
.tr-agenda-item { display: flex; align-items: center; gap: 12px; padding: 8px 0 8px 10px; border-left: 3px solid var(--line); margin-top: 6px; font-size: 14px; }
.tr-agenda-sale { border-left-color: var(--type-sale); }
.tr-agenda-recruit { border-left-color: var(--type-recruit); }
.tr-agenda-training { border-left-color: var(--brass); }
.tr-agenda-block { border-left-color: var(--rust); color: var(--rust); }
.tr-agenda-google { border-left-color: var(--slate-light); }
.tr-agenda-time { width: 70px; flex-shrink: 0; font-size: 13px; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
.tr-agenda-what { flex: 1; min-width: 0; display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; }

/* app-style bottom navigation + "More" sheet (phones only) */
.tr-bottomnav { display: none; }
.tr-mobile-only { display: none; }
.tr-sheet-backdrop { position: fixed; inset: 0; z-index: 60; background: rgba(20,32,43,0.45); display: flex; align-items: flex-end; }
.tr-sheet { width: 100%; background: var(--card); border-radius: 16px 16px 0 0; padding: 8px 12px calc(76px + env(safe-area-inset-bottom, 0px)); box-shadow: 0 -8px 30px rgba(19,35,48,0.2); }
.tr-sheet-grip { width: 38px; height: 4px; border-radius: 999px; background: var(--line); margin: 4px auto 10px; }
.tr-sheet-item { display: flex; align-items: center; gap: 14px; width: 100%; min-height: 52px; padding: 0 10px; border: none; border-radius: 10px; background: transparent; font-family: inherit; font-size: 16px; font-weight: 500; color: var(--ink); text-align: left; cursor: pointer; }
.tr-sheet-item span { flex: 1; }
.tr-sheet-item svg { color: var(--slate-light); }
.tr-sheet-item-on { background: var(--paper-dim); }
.tr-sheet-item-on svg:first-child { color: var(--brass-dark); }

/* contact info + meeting invites */
.tr-contact-links { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 10px; }
.tr-contact-detail { font-size: 12.5px; color: var(--slate-light); margin-left: 4px; word-break: break-all; }
.tr-invite-box { margin-top: 14px; padding: 12px 14px; border-radius: 8px; border: 1px solid var(--line); background: var(--paper); display: flex; flex-direction: column; gap: 6px; }
.tr-invite-title { font-size: 13px; font-weight: 600; color: var(--ink); margin-bottom: 2px; }
.tr-invite-box .tr-checkbox-field span { word-break: break-word; }

/* recruit sign-up link landing */
.tr-join-box { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border-radius: 8px; background: rgba(201,162,75,0.10); border: 1px solid rgba(201,162,75,0.35); font-size: 14px; color: var(--ink); }
.tr-join-box .tr-link-btn { align-self: flex-start; }
.tr-join-chain { font-size: 12.5px; color: var(--slate-light); }
.tr-auth-invite-note { margin: 4px 0 0; font-size: 13px; color: var(--slate-light); text-align: center; }

/* follow up tab */
.tr-fu-card { padding: 0; overflow: hidden; }
.tr-fu-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; width: 100%; padding: 15px 20px; background: transparent; border: none; font-family: inherit; font-size: 14px; color: var(--ink); text-align: left; cursor: pointer; transition: background .12s; }
.tr-fu-head:hover { background: var(--paper); }
.tr-fu-chips { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 6px; color: var(--slate-light); }
.tr-fu-body { border-top: 1px solid var(--line); padding: 4px 18px 16px; }
.tr-fu-section { padding: 14px 0; border-top: 1px solid var(--line); }
.tr-fu-section:first-child { border-top: none; }
.tr-fu-lastnote { font-size: 12.5px; color: var(--slate); margin-top: 3px; max-width: 520px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tr-fu-quicktags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.tr-fu-quicktags .tr-pill-btn { padding: 5px 11px; font-size: 12px; }
.tr-fu-head > div:first-child { min-width: 0; }

/* overview — landing page */
.tr-ov { display: flex; flex-direction: column; gap: 16px; }
.tr-ov .tr-dash-strip { margin-bottom: 0; }
.tr-ov-flow { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; color: var(--slate-light); }
.tr-ov-flow button { display: inline-flex; align-items: center; gap: 8px; font-family: inherit; font-size: 13px; font-weight: 500; padding: 6px 13px 6px 7px; border-radius: 999px; border: 1px solid var(--line-strong); background: var(--card); color: var(--ink); cursor: pointer; transition: border-color .15s; }
.tr-ov-flow button:hover { border-color: var(--ink); }
.tr-ov-flow button span { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 999px; background: var(--ink); color: #fff; font-size: 11px; font-weight: 600; }
.tr-ov-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.tr-ov-big { font-family: 'Newsreader', serif; font-size: 60px; font-weight: 600; line-height: 1; letter-spacing: -1px; color: var(--ink); margin: 8px 0 8px; }
.tr-ov-bar { width: 100%; height: 8px; border-radius: 999px; background: var(--paper-dim); overflow: hidden; }
.tr-ov-bar-fill { height: 100%; border-radius: 999px; background: var(--brass); transition: width .3s ease; }
.tr-ov-bar-fill-alt { background: var(--green); }
.tr-ov-goal { margin-bottom: 14px; }
.tr-ov-goal-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 13.5px; color: var(--slate); margin-bottom: 6px; }
.tr-ov-hello { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
.tr-ov-hello-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.tr-ov-attention { box-shadow: inset 3px 0 0 var(--rust); }
.tr-ov-attn-row { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 6px; background: transparent; border: none; border-top: 1px solid var(--line); font-family: inherit; font-size: 14px; color: var(--ink); text-align: left; cursor: pointer; }
.tr-ov-attn-row:first-of-type { border-top: none; }
.tr-ov-attn-row:hover { background: var(--paper); }
.tr-ov-attn-row svg { color: var(--slate-light); }
.tr-ov-attn-text { flex: 1; }
.tr-ov-attn-num { min-width: 28px; height: 24px; padding: 0 7px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
.tr-ov-attn-rust { background: rgba(184,80,61,0.12); color: var(--rust); }
.tr-ov-attn-amber { background: rgba(217,142,59,0.14); color: #9C6423; }
.tr-ov-attn-violet { background: rgba(124,95,166,0.14); color: var(--violet-dark); }
.tr-ov-goal-note { font-size: 12px; color: var(--slate-light); margin-top: 5px; }
.tr-ov-link { background: none; border: none; padding: 0; font-family: inherit; font-size: 12.5px; color: var(--brass-dark); cursor: pointer; }
.tr-ov-link:hover { text-decoration: underline; }
.tr-ov-day { margin-top: 18px; }
.tr-ov-day-label { font-size: 13px; font-weight: 600; color: var(--slate-light); padding-bottom: 6px; border-bottom: 1px solid var(--line); }
.tr-ov-day-today .tr-ov-day-label { color: var(--brass-dark); border-bottom-color: var(--brass); }
.tr-ov-row { display: flex; align-items: center; gap: 14px; padding: 8px 0; border-top: 1px solid var(--line); font-size: 14px; line-height: 1.4; }
.tr-ov-day-label + .tr-ov-row { border-top: none; }
.tr-ov-row-past .tr-ov-time, .tr-ov-row-past .tr-ov-row-main { opacity: 0.6; }
.tr-root a.tr-btn { text-decoration: none; }
.tr-ov-time { width: 72px; flex-shrink: 0; font-size: 13px; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
.tr-ov-row-main { flex: 1; min-width: 0; }
.tr-ov-row-side { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

/* Today */
.tr-today { display: flex; flex-direction: column; gap: 16px; }
.tr-today-grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.tr-today-side { display: flex; flex-direction: column; gap: 16px; }
.tr-ring { position: relative; flex-shrink: 0; }
.tr-ring svg { display: block; }
@media (prefers-reduced-motion: no-preference) { .tr-ring-arc { transition: stroke-dashoffset .6s ease, stroke .3s; } }
.tr-ring-label { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 11.5px; font-weight: 500; color: var(--slate-light); }
.tr-ring-label strong { font-family: 'Newsreader', serif; font-size: 20px; font-weight: 600; line-height: 1; color: var(--ink); }
.tr-ring-label svg { color: var(--green); }
.tr-today-plan, .tr-card.tr-today-plan { padding: 0; overflow: hidden; }
.tr-plan-head { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 20px 22px 12px; }
.tr-plan-title { font-family: 'Newsreader', serif; font-size: 24px; font-weight: 600; line-height: 1.2; color: var(--ink); margin: 0; }
.tr-plan-sub { margin: 2px 0 0; font-size: 13.5px; color: var(--slate-light); }
.tr-plan-score { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 22px 16px; }
.tr-plan-score span { font-size: 12.5px; color: var(--slate); background: var(--paper); border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px; }
.tr-plan-score strong { color: var(--ink); font-variant-numeric: tabular-nums; }
.tr-plan-section { padding: 14px 22px 6px; border-top: 1px solid var(--line); }
.tr-plan-section:last-child { padding-bottom: 16px; }
.tr-plan-label { font-size: 11.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--slate-light); margin: 0 0 4px; }
.tr-dayagenda { list-style: none; margin: 0; padding: 0; }
.tr-dayagenda-row { display: flex; align-items: center; gap: 14px; padding: 10px 0; border-top: 1px solid var(--line); font-size: 14px; }
.tr-dayagenda-row:first-child { border-top: none; }
.tr-dayagenda-soon { margin: 0 -22px; padding: 10px 22px; background: rgba(196,154,60,0.07); box-shadow: inset 3px 0 0 var(--brass); }
.tr-dayagenda-time { width: 72px; flex-shrink: 0; font-size: 13.5px; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
.tr-dayagenda-main { flex: 1; min-width: 0; color: var(--ink); }
.tr-dayagenda-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 12.5px; color: var(--slate-light); }
.tr-dayagenda-badge { font-size: 11.5px; font-weight: 600; color: var(--brass-dark); background: var(--brass-tint); padding: 1px 8px; border-radius: 999px; }
.tr-tasks { list-style: none; margin: 0; padding: 0; }
.tr-task { display: flex; align-items: flex-start; gap: 12px; padding: 12px 0; border-top: 1px solid var(--line); }
.tr-tasks > .tr-task:first-child { border-top: none; }
.tr-task-node { flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; margin-top: 1px; border-radius: 50%; background: var(--brass-tint); color: var(--brass-dark); }
.tr-task-rust .tr-task-node { background: rgba(176,67,47,0.1); color: var(--rust); }
.tr-task-amber .tr-task-node { background: rgba(194,124,30,0.12); color: #8A5410; }
.tr-task-violet .tr-task-node { background: rgba(107,81,160,0.12); color: var(--violet-dark); }
.tr-task-done .tr-task-node { background: var(--green); color: #fff; }
.tr-task-body { flex: 1; min-width: 0; }
.tr-task-title { font-size: 14.5px; line-height: 1.4; color: var(--ink); }
.tr-task-title strong { font-weight: 600; }
.tr-task-meta { margin-top: 2px; font-size: 12.5px; color: var(--slate-light); }
.tr-task-done .tr-task-title { color: var(--slate-light); }
.tr-task-btn { flex-shrink: 0; }
.tr-tasks-done { margin-top: 2px; padding-top: 2px; border-top: 1px dashed var(--line-strong); }
.tr-tasks-done .tr-task { padding: 8px 0; }
.tr-tasks-done .tr-task-node { width: 22px; height: 22px; margin: 0 3px; }
.tr-tasks-later .tr-task { padding: 10px 0; }
.tr-task-hint { margin: 6px 0 0; font-size: 12.5px; color: var(--slate-light); }
.tr-task-more { padding: 4px 0 8px; }
.tr-task-morebtn { display: inline-flex; align-items: center; gap: 4px; padding: 4px 0 4px 40px; background: none; border: none; font-family: inherit; font-size: 13px; font-weight: 500; color: var(--brass-dark); cursor: pointer; }
.tr-task-morebtn:hover, .tr-task-link:hover { text-decoration: underline; }
.tr-task-link { background: none; border: none; padding: 0; font-family: inherit; font-size: 12.5px; font-weight: 500; color: var(--brass-dark); cursor: pointer; }
.tr-plan-more { margin: 2px 0 10px 40px; }
.tr-calllist { margin-top: 10px; padding: 2px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--paper); }
.tr-calllist-head { padding: 7px 0 3px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--slate-light); }
.tr-calllist-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-top: 1px solid var(--line); }
.tr-calllist-head + .tr-calllist-row { border-top: none; }
.tr-calllist-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13.5px; font-weight: 500; color: var(--ink); }
.tr-calllist-lean { font-size: 12px; color: var(--slate-light); white-space: nowrap; }
.tr-calllist-sale { color: var(--type-sale-dark); }
.tr-calllist-recruit { color: var(--type-recruit-dark); }
.tr-calllist-both { color: var(--violet-dark); }
.tr-btn-xs { min-height: 28px; padding: 3px 11px; font-size: 12.5px; }
.tr-task-quick { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; }
.tr-task-quick input { flex: 1 1 110px; min-width: 0; height: 34px; padding: 0 10px; border-radius: var(--radius-sm); border: 1px solid var(--line-strong); background: var(--card); font-family: inherit; font-size: 14px; color: var(--ink); }
.tr-task-quick input:focus { border-color: var(--brass); box-shadow: var(--ring); outline: none; }
.tr-task-quick-err { flex-basis: 100%; margin: 0; }
.tr-plan-clear { display: flex; align-items: flex-start; gap: 12px; margin: 6px 0 10px; padding: 12px 14px; border-radius: var(--radius-sm); background: rgba(46,125,91,0.08); color: #23654A; font-size: 14px; }
.tr-plan-clear p { margin: 2px 0 0; font-size: 13px; color: var(--slate); }

/* First 30 days */
.tr-card.tr-f30 { padding: 0; }
.tr-f30 { padding: 0; overflow: hidden; border-color: rgba(196,154,60,0.5); }
.tr-f30-head { position: relative; display: flex; align-items: flex-start; gap: 18px; padding: 20px 22px; background: linear-gradient(180deg, rgba(196,154,60,0.11), rgba(196,154,60,0.03)); }
.tr-f30 .tr-ring-label { flex-direction: column; line-height: 1.05; }
.tr-f30 .tr-ring-label strong { font-size: 22px; }
.tr-f30 .tr-ring-label span { font-size: 10.5px; }
.tr-f30-head-main { flex: 1; min-width: 0; padding-right: 28px; }
.tr-f30-kicker { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 11.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--brass-dark); }
.tr-f30-day { color: var(--ink); }
.tr-f30-flag { text-transform: none; letter-spacing: 0; }
.tr-f30-title { margin: 4px 0; font-family: 'Newsreader', serif; font-size: 23px; font-weight: 600; line-height: 1.25; color: var(--ink); }
.tr-f30-count { font-family: 'IBM Plex Sans', system-ui, sans-serif; font-size: 15px; font-weight: 500; color: var(--slate-light); }
.tr-f30-why { margin: 0; max-width: 660px; font-size: 14px; color: var(--slate); }
.tr-f30-stepbar { max-width: 320px; margin-top: 10px; }
.tr-f30-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 14px; margin-top: 12px; }
.tr-f30-toggle { display: inline-flex; align-items: center; gap: 4px; padding: 4px 0; background: none; border: none; font-family: inherit; font-size: 13px; font-weight: 500; color: var(--slate); cursor: pointer; }
.tr-f30-toggle:hover { color: var(--ink); }
.tr-f30-close { position: absolute; top: 12px; right: 12px; }
.tr-f30-weeks { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid var(--line); }
.tr-f30-week { padding: 16px 18px 12px; }
.tr-f30-week + .tr-f30-week { border-left: 1px solid var(--line); }
.tr-f30-week-now { background: rgba(196,154,60,0.05); }
.tr-f30-week-head { display: flex; flex-direction: column; gap: 1px; margin-bottom: 8px; }
.tr-f30-week-label { display: flex; align-items: center; gap: 8px; font-size: 11.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--slate-light); }
.tr-f30-here { padding: 1px 8px; border-radius: 999px; background: var(--brass); color: var(--ink); font-size: 11px; letter-spacing: 0; text-transform: none; }
.tr-f30-week-title { font-size: 15px; font-weight: 600; color: var(--ink); }
.tr-f30-week-meta { font-size: 12px; color: var(--slate-light); }
.tr-f30-steps { list-style: none; margin: 0; padding: 0; }
.tr-f30-step { display: flex; align-items: center; gap: 10px; width: calc(100% + 12px); margin: 0 -6px; padding: 8px 6px; border: none; border-radius: 6px; background: none; font-family: inherit; font-size: 13.5px; line-height: 1.35; color: var(--ink); text-align: left; cursor: pointer; }
.tr-f30-step:hover { background: rgba(19,33,46,0.045); }
.tr-f30-node { flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--line-strong); background: var(--card); color: #fff; }
.tr-f30-step-title { flex: 1; min-width: 0; }
.tr-f30-step-count { font-size: 12px; font-weight: 600; color: var(--brass-dark); font-variant-numeric: tabular-nums; }
.tr-f30-step-go { flex-shrink: 0; color: var(--line-strong); }
.tr-f30-step:hover .tr-f30-step-go { color: var(--slate-light); }
.tr-f30-step-done .tr-f30-node { background: var(--green); border-color: var(--green); }
.tr-f30-step-done .tr-f30-step-title { color: var(--slate-light); text-decoration: line-through; text-decoration-color: rgba(94,106,119,0.45); }
.tr-f30-step-next .tr-f30-node { border-color: var(--brass); box-shadow: 0 0 0 3px rgba(196,154,60,0.22); }
.tr-f30-step-next .tr-f30-step-title { font-weight: 600; }
.tr-f30-foot { margin: 0; padding: 10px 22px 14px; border-top: 1px solid var(--line); font-size: 12.5px; color: var(--slate-light); }
.tr-f30-complete { border-color: rgba(46,125,91,0.35); }
.tr-f30-complete .tr-f30-head { background: rgba(46,125,91,0.06); align-items: center; }
.tr-f30-complete .tr-f30-kicker { color: #23654A; }
.tr-f30-complete .tr-f30-head-main { padding-right: 0; }

/* Your account: First 30 days switch */
.tr-account-toggle { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; padding: 12px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.tr-account-toggle-title { font-size: 14px; font-weight: 600; color: var(--ink); }
.tr-account-toggle-sub { font-size: 12.5px; color: var(--slate-light); }

/* Team Pace: new advisors */
.tr-newadv { margin: 4px 0 16px; }
.tr-newadv-list { list-style: none; margin: 10px 0 0; padding: 0; }
.tr-newadv-row { display: grid; grid-template-columns: minmax(140px, 1.1fr) minmax(130px, 1fr) minmax(0, 2.2fr); align-items: center; gap: 16px; padding: 10px 0; border-top: 1px solid var(--line); }
.tr-newadv-who { display: flex; flex-direction: column; font-size: 14px; color: var(--ink); }
.tr-newadv-who .tr-empty { margin: 0; font-size: 12.5px; }
.tr-newadv-progress { display: flex; align-items: center; gap: 10px; }
.tr-newadv-progress .tr-ov-bar { flex: 1; }
.tr-newadv-next { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; font-size: 13px; }
.tr-newadv-step { color: var(--slate); }
.tr-newadv-seen { flex-basis: 100%; font-size: 12px; color: var(--rust); }
@media (max-width: 960px) {
  .tr-today-grid { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  .tr-f30-weeks { grid-template-columns: 1fr; }
  .tr-f30-week + .tr-f30-week { border-left: none; border-top: 1px solid var(--line); }
  .tr-newadv-row { grid-template-columns: 1fr; gap: 6px; }
}
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
.tr-intake-progress-label { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; font-weight: 500; color: var(--slate); margin-bottom: 7px; }
.tr-intake-progress-label strong { color: var(--ink); }
.tr-intake-progress-track { width: 100%; height: 6px; border-radius: 999px; background: var(--paper-dim); overflow: hidden; }
.tr-intake-progress-fill { height: 100%; border-radius: 999px; background: var(--brass); transition: width .3s ease; }
.tr-intake-skip-link { display: block; width: 100%; text-align: center; margin-top: 12px; background: none; border: none; font-family: inherit; font-size: 12.5px; color: var(--slate-light); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
.tr-intake-skip-link:hover { color: var(--slate); }
.tr-intake-hint-row { display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 12px; color: var(--slate-light); margin-top: 10px; }

/* responsive */
@media (max-width: 720px) {
  .tr-pace-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
  .tr-form-grid { grid-template-columns: 1fr; }
  .tr-prospect-chars { grid-template-columns: 1fr; }
  .tr-pace-grid { grid-template-columns: 1fr; }
  /* Phones navigate from the bottom bar, so the header scrolls away
     instead of taking permanent space at the top. */
  .tr-header { position: relative; }
  .tr-header-row { padding: 12px 16px; }
  .tr-header-with-nav .tr-header-row { padding-bottom: 12px; }
  .tr-header-nav { padding: 0 16px; }
  .tr-header-name { display: none; }
  .tr-header-firstname { display: inline; }
  .tr-main { padding: 18px 14px calc(48px + env(safe-area-inset-bottom, 0px)); }
  .tr-tabs .tr-tab { flex: 0 0 auto; }
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
  .tr-intake-quickstart { grid-template-columns: 1fr; }
  .tr-ov-grid { grid-template-columns: 1fr; }
  .tr-funnel-strip { grid-template-columns: repeat(2, 1fr); }
  .tr-funnel-cell { padding: 12px 14px 14px; }
  .tr-funnel-cell:nth-child(3) { border-left: none; }
  .tr-funnel-cell:nth-child(n+3) { border-top: 1px solid var(--line); }
  .tr-funnel-num { font-size: 26px; }
  .tr-toolbar .tr-search-row { flex-basis: 100%; }
  .tr-toolbar .tr-btn-sm, .tr-toolbar-select { min-height: 40px; height: 40px; }
  .tr-pagehead-actions { width: 100%; }
  .tr-pagehead-actions .tr-btn { flex: 1 1 auto; }
  .tr-card.tr-ladder { padding: 4px 14px; }
  .tr-rung-current { margin: 0 -14px; padding: 14px; }
  .tr-rung-current::before { left: 24px; }
  .tr-score-track { display: none; }
  /* prospect card: one tidy row of badges + actions under the name */
  .tr-prospect-card-side { width: 100%; flex-wrap: nowrap; padding-left: 40px; gap: 6px; }
  .tr-prospect-card-side .tr-type-badge { margin-left: 0; }
  .tr-prospect-toggle { margin-left: auto; }
  /* week header: arrows + dates on one line, "This week" and the total below */
  .tr-pace-head .tr-weeknav { display: contents; }
  .tr-pace-head .tr-weeknav-label { flex: 1 1 calc(100% - 140px); min-width: 0; margin-right: 0; font-size: 14px; justify-content: center; }
  .tr-pace-total { margin-left: auto; }
  .tr-ov-row { flex-wrap: wrap; }
  .tr-quickadd { flex-wrap: wrap; }
  .tr-connect-slim { flex-wrap: wrap; }
  .tr-bizplan-glance { width: 100%; }
  .tr-cal-legend-hint { margin-left: 0; width: 100%; }
  .tr-agenda { padding: 4px 14px 12px; }
  .tr-quickadd-label { width: 100%; }
  .tr-prospect-card-side { justify-content: flex-start; }
  .tr-ov-row-side { width: 100%; padding-left: 86px; }
  .tr-fu-head { flex-direction: column; align-items: flex-start; }
  .tr-fu-chips { justify-content: flex-start; }
  .tr-intake-page { padding: 20px 14px 48px; }

  /* ---- phone layout ---------------------------------------------- */
  /* Bottom bar replaces the top tab strip (login screen tabs untouched) */
  .tr-header .tr-navtabs { display: none; }
  /* Keep .tr-header-nav rendered: the phone bottom bar lives inside it. */
  .tr-header-nav:not(:has(.tr-groupswitch)) { padding: 0; }
  .tr-groupswitch { margin: 0 0 10px; }
  .tr-appts-sidebar { position: static; }
  .tr-bottomnav {
    display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 70;
    background: var(--card); border-top: 1px solid var(--line);
    padding: 4px 4px env(safe-area-inset-bottom, 0px);
    box-shadow: 0 -4px 18px rgba(19,35,48,0.06);
  }
  .tr-bottomnav button {
    flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
    min-height: 54px; border: none; background: transparent; font-family: inherit; font-size: 10.5px; font-weight: 500;
    color: var(--slate-light); cursor: pointer; border-radius: 10px;
  }
  .tr-bottomnav button span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tr-bottomnav .tr-bottomnav-on { color: var(--ink); font-weight: 600; }
  .tr-bottomnav .tr-bottomnav-on svg { color: var(--brass-dark); }
  .tr-main { padding: 14px 14px calc(88px + env(safe-area-inset-bottom, 0px)); gap: 16px; }
  .tr-mobile-only { display: inline; }

  /* Nothing may be wider than the screen */
  .tr-root { overflow-x: clip; }
  .tr-appts-shell { align-items: stretch; gap: 12px; }
  .tr-appts-main { width: 100%; gap: 14px; }

  /* Side tabs become one swipeable row of chips */
  .tr-appts-sidebar {
    flex-wrap: nowrap; overflow-x: auto; gap: 8px; width: auto;
    margin: 0 -14px; padding: 2px 14px 6px; scrollbar-width: none;
    -webkit-mask-image: linear-gradient(90deg, #000 88%, transparent); mask-image: linear-gradient(90deg, #000 88%, transparent);
  }
  .tr-appts-sidebar::-webkit-scrollbar { display: none; }
  .tr-appts-sidebar .tr-sidebar-divider, .tr-appts-sidebar .tr-bizplan-glance { display: none; }
  .tr-sidebar-item { flex: 0 0 auto; white-space: nowrap; background: var(--card); border: 1px solid var(--line); border-radius: 999px; min-height: 40px; padding: 8px 14px; font-family: inherit !important; font-size: 13.5px !important; }
  .tr-sidebar-item-active, .tr-sidebar-item-active:hover { background: var(--ink); color: #fff; border-color: var(--ink); }
  .tr-sidebar-item-active .tr-mono { background: rgba(255,255,255,0.16); color: #fff; }

  /* Overview */
  .tr-ov-flow { flex-wrap: nowrap; overflow-x: auto; margin: 0 -14px; padding: 0 14px 2px; scrollbar-width: none; }
  .tr-ov-flow::-webkit-scrollbar { display: none; }
  .tr-ov-flow button { flex: 0 0 auto; white-space: nowrap; }
  .tr-ov-hello-actions { width: 100%; }
  .tr-ov-hello-actions .tr-btn { flex: 1 1 0; justify-content: center; }

  /* Weekly pace: two batches per row, smaller dots */
  .tr-pace-grid { grid-template-columns: 1fr 1fr !important; gap: 14px 16px; }
  .tr-pace .tr-pill { width: 18px; height: 18px; }
  .tr-hide-mobile { display: none; }

  /* Header + headings */
  .tr-brand { font-size: 19px; }
  .tr-h2 { font-size: 23px; }
  .tr-ov-big { font-size: 52px; }
  .tr-card { padding: 16px 14px; }
  .tr-card.tr-fu-card { padding: 0; }
  .tr-card.tr-cal-card { padding: 0; }
  .tr-card.tr-agenda { padding: 4px 14px 12px; }
  /* Month grid on a phone: colored dots instead of unreadable text */
  .tr-cal-day { min-height: 54px; }
  .tr-cal-appts { flex-direction: row; flex-wrap: wrap; gap: 3px; margin-top: 2px; }
  .tr-cal-appt { width: 7px; height: 7px; min-width: 7px; padding: 0 !important; border: none !important; border-image: none !important; border-radius: 50%; font-size: 0 !important; background: var(--slate-light); }
  .tr-cal-appt svg { display: none; }
  .tr-cal-appt-sale { background: var(--type-sale); }
  .tr-cal-appt-recruit { background: var(--type-recruit); }
  .tr-cal-appt-both { background: linear-gradient(90deg, var(--type-recruit) 50%, var(--type-sale) 50%); }
  .tr-cal-appt-training { background: var(--brass); }
  .tr-cal-appt-unavailable { background: var(--rust); }
  .tr-cal-appt-google { background: var(--slate-light); }
  .tr-cal-more { font-size: 9px; padding: 0; line-height: 7px; }
  .tr-fu-head { padding: 13px 14px; }
  .tr-fu-body { padding: 4px 14px 14px; }
  .tr-card.tr-prospect-card-compact { padding: 12px 14px; }
  .tr-row-head { gap: 10px; }

  /* Comfortable tap targets */
  .tr-btn { min-height: 40px; }
  .tr-btn-sm { min-height: 36px; padding: 7px 12px; }
  .tr-icon-btn { min-width: 36px; min-height: 36px; }
  .tr-form-actions { flex-wrap: wrap; }
  .tr-form .tr-form-actions .tr-btn { flex: 1 1 auto; justify-content: center; }

  /* Modals open as bottom sheets */
  .tr-modal-backdrop { align-items: flex-end; padding: 0; z-index: 90; }
  .tr-sort-select { max-width: 128px; text-overflow: ellipsis; }
  .tr-modal-card { max-width: none; border-radius: 16px 16px 0 0; max-height: 88vh; padding: 20px 16px calc(20px + env(safe-area-inset-bottom, 0px)); }

  /* Appointment tables become stacked cards */
  .tr-appt-group .tr-table thead { display: none; }
  .tr-appt-group .tr-table, .tr-appt-group .tr-table tbody { display: block; }
  .tr-appt-group .tr-table tr.tr-appt-row {
    display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "client actions" "when actions" "presenter actions" "trainee actions" "set actions";
    gap: 2px 8px; padding: 10px 0 10px 12px; border-bottom: 1px solid var(--line); box-shadow: inset 3px 0 0 0 var(--line);
  }
  .tr-appt-group .tr-table tr.tr-appt-row:last-child { border-bottom: none; }
  .tr-appt-row-sale { box-shadow: inset 3px 0 0 0 var(--type-sale) !important; }
  .tr-appt-row-recruit { box-shadow: inset 3px 0 0 0 var(--type-recruit) !important; }
  .tr-appt-row-both { box-shadow: inset 3px 0 0 0 var(--type-recruit) !important; }
  .tr-appt-group .tr-table td { display: block; padding: 0; border: none; box-shadow: none; border-image: none; font-size: 13px; color: var(--slate); }
  .tr-appt-group .tr-table td.td-client { grid-area: client; font-size: 14.5px; color: var(--ink); }
  .tr-appt-group .tr-table td.td-when { grid-area: when; }
  .tr-appt-group .tr-table td.td-presenter { grid-area: presenter; }
  .tr-appt-group .tr-table td.td-trainee { grid-area: trainee; }
  .tr-appt-group .tr-table td.td-set { grid-area: set; font-size: 12px; color: var(--slate-light); }
  .tr-appt-group .tr-table td.td-actions { grid-area: actions; align-self: center; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
  .tr-appt-group .tr-table-wrap { overflow: visible; }

  /* Other wide tables scroll inside their card, never the page */
  .tr-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 0 -14px; padding: 0 14px; }
  /* Team tables: names stay pinned while you swipe across the numbers */
  .tr-table-wrap .tr-table th:first-child, .tr-table-wrap .tr-table td:first-child { position: sticky; left: -14px; z-index: 1; background: var(--card); box-shadow: 1px 0 0 var(--line); min-width: 112px; max-width: 132px; }
  .tr-appt-group .tr-table td:first-child { position: static; box-shadow: none; min-width: 0; max-width: none; background: transparent; }

  /* iOS Safari zooms the whole page when you tap a field smaller than
     16px — keep every field at 16px on phones so it never does. */
  .tr-root input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), .tr-root select, .tr-root textarea { font-size: 16px !important; }
}

@media (max-width: 640px) {
  .tr-plan-head { padding: 16px 16px 10px; }
  .tr-plan-score { padding: 0 16px 14px; }
  .tr-plan-section { padding: 12px 16px 6px; }
  .tr-dayagenda-soon { margin: 0 -16px; padding: 10px 16px; }
  .tr-task { flex-wrap: wrap; }
  .tr-task-body { flex: 1 1 calc(100% - 40px); }
  .tr-task-btn { margin-left: 40px; }
  .tr-f30-head { gap: 12px; padding: 16px; }
  .tr-f30-head .tr-ring, .tr-f30-head .tr-ring svg { width: 46px !important; height: 46px !important; }
  .tr-f30 .tr-ring-label strong { font-size: 18px; }
  .tr-f30-head-main { padding-right: 22px; }
  .tr-f30-title { font-size: 20px; }
  .tr-f30-foot { padding: 10px 16px 14px; }
  .tr-f30-week { padding: 14px 16px 10px; }
  .tr-f30-complete .tr-f30-head { flex-wrap: wrap; }
  .tr-dayagenda-time { width: 64px; }
}
`;
