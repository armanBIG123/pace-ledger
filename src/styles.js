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
  --brass-dark: #86651D;   /* brass text on white and on the grey page (AA) */
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
/* Between phone and desktop widths (an upright iPad, a half-width window)
   the header gives up the full name and role pill before anything gets
   pushed off the screen; the search box shrinks to fit. */
.tr-header-account { min-width: 0; }
.tr-header-account > span { min-width: 0; }
.tr-header-row > .tr-brand { flex-shrink: 0; }
/* Header.jsx sets this only when the row doesn't fit (very large phone
   text): the wordmark gives way so the buttons stay on screen. */
.tr-header-tight > .tr-brand > span { display: none; }
@media (min-width: 641px) and (max-width: 1100px) {
  .tr-header-name { display: none; }
  .tr-header-firstname { display: inline; }
}
@media (min-width: 641px) and (max-width: 900px) {
  .tr-header-role { display: none; }
  .tr-header-row { gap: 12px; }
  .tr-header-user { gap: 8px; }
}

.tr-navtabs { display: flex; gap: 2px; overflow-x: auto; scrollbar-width: none; margin-bottom: -1px; }
.tr-navtabs::-webkit-scrollbar { display: none; }
.tr-navtab, .tr-navtabs-measure > span { position: relative; white-space: nowrap; padding: 12px 12px 13px; border: none; background: transparent; font-family: inherit; font-size: 14px; font-weight: 500; color: rgba(255,255,255,0.62); cursor: pointer; transition: color .15s; }
.tr-navtab:hover { color: #fff; }
.tr-navtab-on { color: #fff; }
.tr-navtab-on::after { content: ''; position: absolute; left: 12px; right: 12px; bottom: 0; height: 3px; border-radius: 3px 3px 0 0; background: var(--brass); }
.tr-header .tr-navtab:focus-visible { outline-offset: -4px; }
/* The strip takes the rest of the row; tabs that don't fit go under More
   (navigation.jsx measures them in the hidden copy below). */
.tr-navtabs { flex: 1 1 auto; min-width: 0; }
.tr-navtabs-measure { position: absolute; left: 0; top: 0; width: 0; height: 0; overflow: hidden; visibility: hidden; display: flex; gap: 2px; pointer-events: none; }
.tr-navtabs-measure > span { flex-shrink: 0; }
.tr-navtab-more, .tr-navtabs-measure > span:last-child { display: inline-flex; align-items: center; gap: 4px; }
.tr-navmore-menu { position: fixed; z-index: 96; width: 220px; padding: 6px; display: flex; flex-direction: column; gap: 2px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 14px 36px rgba(19,33,46,0.24); }
.tr-navmore-menu button { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 40px; padding: 8px 10px; border: none; border-radius: 8px; background: transparent; font-family: inherit; font-size: 14px; font-weight: 500; color: var(--ink); text-align: left; cursor: pointer; }
.tr-navmore-menu button svg { color: var(--slate-light); }
.tr-navmore-menu button:hover { background: var(--paper); }
.tr-navmore-menu .tr-navmore-on { color: var(--brass-dark); font-weight: 600; }
.tr-navmore-menu .tr-navmore-on svg { color: var(--brass-dark); }
.tr-groupswitch { display: inline-flex; flex-shrink: 0; align-self: center; margin-bottom: 6px; padding: 3px; border-radius: 9px; background: rgba(255,255,255,0.08); }
.tr-groupswitch button { font-family: inherit; font-size: 13px; font-weight: 500; padding: 5px 12px; border-radius: 6px; border: none; background: transparent; color: rgba(255,255,255,0.7); cursor: pointer; white-space: nowrap; }
.tr-groupswitch button:hover { color: #fff; }
.tr-groupswitch .tr-groupswitch-on, .tr-groupswitch .tr-groupswitch-on:hover { background: #fff; color: var(--ink); }

/* layout */
.tr-main { max-width: 1120px; margin: 0 auto; padding: 28px 24px calc(72px + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; gap: 20px; }
.tr-leader-invite { display: flex; flex-direction: column; gap: 6px; }
.tr-leader-invite-closed { flex-direction: row; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
.tr-leader-invite-form { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px 14px; margin-top: 8px; }
.tr-leader-invite-form .tr-error, .tr-leader-invite-form .tr-form-actions { grid-column: 1 / -1; }
@media (max-width: 640px) { .tr-leader-invite-form { grid-template-columns: minmax(0, 1fr); } }
.tr-systabs { display: flex; gap: 2px; border-bottom: 1px solid var(--line); overflow-x: auto; scrollbar-width: none; margin-top: -6px; }
.tr-systabs::-webkit-scrollbar { display: none; }
.tr-systab { font: inherit; font-size: 14px; font-weight: 600; color: var(--slate); background: none; border: none; border-bottom: 2.5px solid transparent; padding: 9px 14px 10px; margin-bottom: -1px; cursor: pointer; white-space: nowrap; min-height: 42px; }
.tr-systab:hover { color: var(--ink); }
.tr-systab-on, .tr-systab-on:hover { color: var(--ink); border-bottom-color: var(--brass); }
.tr-mt-move { position: relative; display: inline-block; }
.tr-mt-move-menu { position: fixed; z-index: 60; background: var(--card); border: 1px solid var(--line-strong); border-radius: 10px; box-shadow: 0 10px 24px rgba(19,33,46,0.16); padding: 6px; min-width: 210px; display: flex; flex-direction: column; gap: 2px; text-align: left; }
.tr-mt-move-menu span { font-size: 11.5px; font-weight: 600; color: var(--slate); padding: 4px 8px 2px; }
.tr-mt-move-menu button { font: inherit; font-size: 13.5px; text-align: left; background: none; border: none; border-radius: 7px; padding: 8px; cursor: pointer; color: var(--ink); }
.tr-mt-move-menu button:hover { background: var(--brass-tint); }
.tr-mt-del { white-space: nowrap; }
/* Log them all: one list, one tap per appointment */
.tr-modal-card.tr-logall { max-width: 680px; }
.tr-logall .tr-subtitle { margin: 4px 0 0; }
.tr-logall-count svg { color: var(--green); vertical-align: -2px; }
.tr-logall-list { list-style: none; margin: 0; padding: 0; }
.tr-logall-row { display: flex; flex-direction: column; gap: 9px; padding: 13px 0; border-bottom: 1px solid var(--line); }
.tr-logall-row:last-child { border-bottom: none; }
.tr-logall-who strong { font-size: 15px; color: var(--ink); }
.tr-logall-who span { display: block; margin-top: 1px; font-size: 12.5px; color: var(--slate-light); }
.tr-logall-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.tr-logall-btn { display: inline-flex; align-items: center; gap: 5px; min-height: 36px; padding: 6px 10px; border-radius: 999px; border: 1px solid var(--line-strong); background: var(--card); color: var(--ink); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: border-color .12s, background .12s; }
.tr-logall-btn svg { color: var(--slate-light); }
.tr-logall-btn:hover { border-color: var(--ink); }
.tr-logall-btn:disabled { opacity: .5; cursor: default; }
.tr-logall-btn.tr-logall-sold { border-color: rgba(46,125,91,.45); background: #F1F8F4; color: #1F6B4A; }
.tr-logall-btn.tr-logall-sold svg { color: var(--green); }
.tr-logall-btn.tr-logall-sold:hover { border-color: var(--green); }
.tr-logall .tr-link-btn { align-self: center; margin-top: 0; font-size: 13px; }
.tr-logall-more { margin-left: 4px; padding: 8px 4px; white-space: nowrap; }
.tr-logall-row-done .tr-logall-who strong { color: var(--slate); }
.tr-logall-saved { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; font-size: 13.5px; font-weight: 600; color: #1F6B4A; }
.tr-logall-saved span svg { vertical-align: -2px; }
.tr-logall-sale { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.tr-logall-premium { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--slate); }
.tr-logall-premium input { width: 130px; min-height: 36px; }
.tr-logall-err { margin: 0; }
.tr-logall .tr-modal-foot .tr-form-actions { align-items: center; }
.tr-logall-foot-note { margin-right: auto; font-size: 12.5px; }
.tr-logall-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 10px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--card); font-size: 13.5px; color: var(--slate); }
@media (max-width: 640px) {
  .tr-logall-acts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .tr-logall-btn { justify-content: center; padding: 6px 4px; min-height: 40px; white-space: nowrap; }
  .tr-logall-btn svg { display: none; }
  .tr-logall-more { justify-self: center; }
  .tr-logall-foot-note { display: none; }
}
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
.tr-profile-form { display: flex; flex-direction: column; gap: 12px; margin: 14px 0 6px; padding: 14px; border-radius: var(--radius-sm); border: 1px solid var(--line); background: var(--paper); }
.tr-profile-form .tr-form-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
.tr-profile-form input { min-width: 0; width: 100%; box-sizing: border-box; }
@media (max-width: 640px) { .tr-profile-form .tr-form-grid { grid-template-columns: minmax(0, 1fr); } }
.tr-profile-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
.tr-profile-saved { font-size: 13px; font-weight: 600; color: var(--green); }
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
.tr-pagehead:has(> .tr-pagehead-actions > .tr-icon-btn:only-child) { flex-wrap: nowrap; align-items: flex-start; }
.tr-pagehead:has(> .tr-pagehead-actions > .tr-icon-btn:only-child) > .tr-pagehead-actions { width: auto; flex-shrink: 0; }

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
.tr-note-add input { flex: 1; min-width: 0; font-family: inherit; font-size: 14px; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); }
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
.tr-weeknav-label { display: flex; align-items: center; gap: 8px; font-weight: 500; color: var(--ink); font-size: 15px; }
/* ‹ and › sit right beside the week or month they move. */
.tr-weeknav > .tr-icon-btn:nth-of-type(2) { margin-right: auto; }
.tr-monthnav { display: inline-flex; align-items: center; gap: 4px; }
.tr-monthnav .tr-weeknav-label { padding: 0 2px; white-space: nowrap; }
.tr-cal-tools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-left: auto; }
@media (max-width: 640px) {
  .tr-cal-toolbar { row-gap: 10px; }
  .tr-cal-toolbar .tr-monthnav { flex: 1 1 auto; justify-content: space-between; }
  .tr-cal-tools { margin-left: 0; width: 100%; }
  .tr-cal-tools .tr-cal-personfilter { flex: 1 1 140px; min-width: 0; }
}
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
.tr-icon-btn-line { border-color: var(--line-strong); background: var(--card); }
.tr-icon-btn-line:hover { border-color: var(--brass); color: var(--ink); }
/* ⓘ explanations and ⋯ menus */
.tr-titleline { display: flex; align-items: center; gap: 4px; min-width: 0; }
.tr-info, .tr-more { position: relative; display: inline-flex; }
.tr-info-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border: none; border-radius: 50%; background: none; color: var(--slate-light); cursor: pointer; }
.tr-info-btn:hover, .tr-info-btn[aria-expanded="true"] { color: var(--ink); background: var(--paper-dim); }
.tr-info-pop { position: absolute; top: calc(100% + 6px); left: 0; z-index: 40; width: max-content; max-width: min(320px, calc(100vw - 24px)); padding: 10px 12px; border-radius: var(--radius-sm); background: var(--ink); color: #fff; font-family: 'IBM Plex Sans', system-ui, sans-serif; font-size: 13px; font-weight: 400; line-height: 1.5; letter-spacing: 0; box-shadow: 0 10px 30px rgba(19,33,46,0.25); }
.tr-more-pop { position: absolute; top: calc(100% + 4px); right: 0; z-index: 40; display: flex; flex-direction: column; min-width: 180px; padding: 4px; border-radius: var(--radius-sm); border: 1px solid var(--line); background: var(--card); box-shadow: 0 10px 30px rgba(19,33,46,0.16); }
.tr-more-item { padding: 9px 12px; border: none; border-radius: 6px; background: none; font-family: inherit; font-size: 13.5px; color: var(--ink); text-align: left; cursor: pointer; white-space: nowrap; }
.tr-more-item:hover { background: var(--paper); }
.tr-more-item:disabled { opacity: .5; cursor: default; }
.tr-more-spacer { display: inline-block; width: 32px; flex-shrink: 0; }
.tr-main .tr-icon-btn:hover { color: var(--ink); }
/* Devices with a real touchscreen (not just a narrow window) get larger
   tap targets, matching Apple's and Google's 44px minimum — a mouse
   pointer doesn't need this, so desktop stays compact. */
/* Call and Text (contact.jsx). Call is the one green button in the app. */
.tr-btn-call { background: var(--green); border-color: #276B4E; color: #fff; }
.tr-btn-call:hover { background: #276B4E; }
.tr-root a.tr-btn-call, .tr-root a.tr-btn-call:visited { color: #fff; }
.tr-btn-icononly { width: 32px; min-width: 32px; padding: 0; gap: 0; }
.tr-contact-phone { font-variant-numeric: tabular-nums; }
.tr-text-picks { display: flex; flex-direction: column; gap: 8px; margin: 14px 0 12px; }
.tr-text-pick { display: flex; flex-direction: column; gap: 3px; width: 100%; padding: 10px 12px; text-align: left; font-family: inherit; font-size: 13px; line-height: 1.45; color: var(--slate); background: var(--card); border: 1px solid var(--line-strong); border-radius: var(--radius-sm); cursor: pointer; transition: border-color .15s, background .15s; }
.tr-text-pick strong { font-size: 13.5px; color: var(--ink); }
.tr-text-pick:hover { border-color: #AEB8C2; }
.tr-text-pick-on, .tr-text-pick-on:hover { border-color: var(--brass); background: rgba(196,154,60,0.06); box-shadow: 0 0 0 1px var(--brass); }
.tr-text-note { margin: 10px 0 0; font-size: 12.5px; color: var(--slate-light); }
.tr-text-sheet:focus { outline: none; }
@media (hover: none) and (pointer: coarse) {
  .tr-icon-btn { width: 44px; height: 44px; }
  .tr-btn { min-height: 44px; }
  .tr-btn-icononly { width: 44px; min-width: 44px; }
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
.tr-field { display: flex; flex-direction: column; min-width: 0; gap: 6px; font-size: 13px; font-weight: 600; color: var(--ink); }
.tr-field-wide { grid-column: 1 / -1; }
.tr-root input:not([type="checkbox"]):not([type="radio"]), .tr-root select, .tr-root textarea { max-width: 100%; }
.tr-field input, .tr-field select, .tr-field textarea { font-family: inherit; font-size: 14px; font-weight: 400; min-height: 40px; padding: 9px 12px; border-radius: var(--radius-sm); border: 1px solid var(--line-strong); background-color: var(--card); color: var(--ink); transition: border-color .15s, box-shadow .15s; }
.tr-field input::placeholder, .tr-field textarea::placeholder { color: #7A8591; }
.tr-field select { padding-right: 28px; }
.tr-field textarea { resize: vertical; min-height: 88px; line-height: 1.5; }
.tr-field input:focus, .tr-field select:focus, .tr-field textarea:focus { border-color: var(--brass); box-shadow: var(--ring); outline: none; }
.tr-field input:disabled, .tr-field select:disabled { background-color: var(--paper); color: var(--slate-light); }
.tr-pw-wrap { position: relative; display: flex; }
.tr-pw-wrap input { flex: 1; min-width: 0; padding-right: 46px; }
.tr-pw-toggle { position: absolute; top: 0; right: 0; bottom: 0; width: 44px; display: flex; align-items: center; justify-content: center; border: none; background: none; color: var(--slate-light); cursor: pointer; border-radius: 0 var(--radius-sm) var(--radius-sm) 0; }
.tr-pw-toggle:hover { color: var(--ink); }
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
/* "How did it go?": four big answers first, then what fits. */
.tr-log-title { margin-bottom: 2px; }
.tr-log-tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 12px 0 4px; }
.tr-log-tile { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 84px; padding: 10px 6px; border: 1px solid var(--line-strong); border-radius: 12px; background: var(--card); font-family: inherit; font-size: 14px; font-weight: 600; color: var(--ink); cursor: pointer; transition: border-color .12s, background .12s; }
.tr-log-tile svg { color: var(--brass-dark); }
.tr-log-tile:hover { border-color: var(--brass); }
.tr-log-tiles-picked { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-bottom: 14px; }
.tr-log-tiles-picked .tr-log-tile { min-height: 56px; gap: 4px; padding: 6px 4px; font-size: 12px; line-height: 1.15; border-radius: 10px; }
.tr-log-tiles-picked .tr-log-tile:not(.tr-log-tile-on) { opacity: .62; }
.tr-log-tile-on, .tr-log-tile-on:hover { background: var(--ink); border-color: var(--ink); color: #fff; opacity: 1; }
.tr-log-tile-on svg { color: #D9B25A; }
.tr-log-pick { margin: 10px 0 0; font-size: 12.5px; color: var(--slate-light); text-align: center; }
.tr-log-premium { display: flex; flex-direction: column; gap: 8px; padding: 12px; margin-top: -4px; border-left: 2px solid var(--brass); background: var(--paper); border-radius: 0 8px 8px 0; }
.tr-log-needed { font-style: normal; font-size: 11px; font-weight: 700; color: #9B3A26; background: rgba(176,67,47,0.1); border-radius: 999px; padding: 1px 7px; margin-left: 4px; }
.tr-log-recruit-yes { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 14px; font-weight: 600; color: #23654A; }
.tr-field input.tr-input-bad { border-color: var(--rust); box-shadow: 0 0 0 3px rgba(176,67,47,0.12); }
.tr-check-inline { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 13.5px; color: var(--ink); cursor: pointer; }
.tr-check-inline input { width: 18px; height: 18px; accent-color: var(--ink); }
.tr-pillrow { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 5px; }
.tr-pill-btn { font-family: inherit; font-size: 13px; font-weight: 500; padding: 6px 13px; border-radius: 999px; border: 1px solid var(--line-strong); background: var(--card); color: var(--slate); cursor: pointer; transition: background .15s, border-color .15s, color .15s; }
.tr-pill-static { cursor: default; }
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
/* Manage Team: room for "UA — Unlicensed Associate" and long names. */
.tr-manage-table td select { max-width: 230px; }
.tr-note { color: var(--slate-light); }
.tr-empty { font-size: 13.5px; color: var(--slate-light); margin: 4px 0 0; }
.tr-subtitle { font-size: 14px; color: var(--slate-light); margin: -6px 0 16px; }
.tr-link { color: inherit; text-decoration: underline; }
.tr-form-section { margin-bottom: 14px; }
.tr-field-hint { font-size: 12px; font-weight: 400; color: var(--slate-light); line-height: 1.4; }
/* Appointment form: the extras fold under "More options" */
.tr-form-more { margin-top: 14px; border-radius: var(--radius-sm); border: 1px solid var(--line); background: var(--paper); }
.tr-form-more-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 8px; width: 100%; padding: 11px 12px; border: none; background: none; font-family: inherit; text-align: left; cursor: pointer; color: var(--ink); }
.tr-form-more-head svg { align-self: center; color: var(--slate-light); }
.tr-form-more-head strong { font-size: 14px; font-weight: 600; }
.tr-form-more-head span { font-size: 12.5px; color: var(--slate-light); }
.tr-form-more-body { padding: 4px 12px 14px; }
.tr-form-more-body .tr-invite-box { background: var(--card); }
/* Form sheet that slides up (phones) */
.tr-fsheet-backdrop { position: fixed; inset: 0; z-index: 95; display: flex; align-items: flex-end; justify-content: center; background: rgba(19,33,46,0.45); }
.tr-fsheet { display: flex; flex-direction: column; width: 100%; max-width: 640px; max-height: calc(100% - 28px); border-radius: 16px 16px 0 0; background: var(--card); box-shadow: 0 -12px 40px rgba(19,33,46,0.25); animation: tr-fsheet-up .22s ease-out; }
@keyframes tr-fsheet-up { from { transform: translateY(40px); opacity: .4; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .tr-fsheet { animation: none; } }
.tr-fsheet-grab { width: 40px; height: 4px; border-radius: 2px; background: var(--line-strong); margin: 8px auto 0; flex-shrink: 0; }
.tr-fsheet-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px 6px 18px; flex-shrink: 0; }
.tr-fsheet-head .tr-h3 { margin: 0; font-size: 18px; }
.tr-fsheet-body { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; padding: 6px 18px 16px; }
.tr-fsheet-body .tr-form-grid { grid-template-columns: 1fr 1fr; gap: 12px; }
.tr-fsheet-body .tr-form-grid > * { grid-column: 1 / -1; }
.tr-fsheet-body .tr-form-grid > .tr-field-half { grid-column: auto; }
.tr-fsheet-actions { flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; padding: 12px 18px calc(12px + env(safe-area-inset-bottom, 0px)); border-top: 1px solid var(--line); background: var(--card); }
.tr-fsheet-actions .tr-btn { width: 100%; justify-content: center; min-height: 46px; font-size: 15.5px; }
.tr-fsheet-actions .tr-error { margin: 0; }
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
.tr-health-warn { color: #94600F; font-weight: 600; }
.tr-audit-list { margin-top: 12px; display: flex; flex-direction: column; gap: 2px; }
.tr-audit-row { display: flex; gap: 10px; font-size: 13px; padding: 7px 0; border-bottom: 1px solid var(--line); }
.tr-audit-row:last-child { border-bottom: none; }
.tr-audit-time { color: var(--slate-light); font-size: 11.5px; white-space: nowrap; min-width: 110px; }

.tr-summary-card { padding: 0; overflow: hidden; }
.tr-table-summary th, .tr-table-summary td { padding: 12px 8px; }
.tr-table-summary th:first-child, .tr-table-summary td:first-child { padding-left: 16px; }
.tr-table-summary th:last-child, .tr-table-summary td:last-child { padding-right: 16px; }
.tr-table-summary .tr-expand-row td { padding: 16px; }
.tr-clickable-row { cursor: pointer; }
.tr-rowname-btn { display: inline; padding: 0; border: none; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; }
.tr-rowname-btn:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; border-radius: 4px; }
/* Track Production: who they sold to and recruited */
.tr-prod-detail { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; }
.tr-prod-h { margin: 0 0 8px; font-size: 12px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--slate-light); }
.tr-prod-h span { margin-left: 4px; color: var(--ink); letter-spacing: 0; }
.tr-prod-list { list-style: none; margin: 0; padding: 0; border-radius: var(--radius-sm); border: 1px solid var(--line); background: var(--card); }
.tr-prod-list li { padding: 10px 12px; border-top: 1px solid var(--line); }
.tr-prod-list li:first-child { border-top: none; }
.tr-prod-line { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; color: var(--ink); }
.tr-prod-line strong { font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
.tr-prod-line .tr-mono { flex-shrink: 0; font-size: 13px; }
.tr-prod-sub { margin-top: 2px; font-size: 12.5px; color: var(--slate-light); }
.tr-prod-detail .tr-empty { margin: 0; }
@media (max-width: 640px) { .tr-prod-detail { grid-template-columns: minmax(0, 1fr); gap: 14px; } }
.tr-clickable-row:hover { background: rgba(19,33,46,0.035); }
.tr-clickable-row:focus-visible { outline: 2px solid var(--brass); outline-offset: -2px; }
.tr-row-open, .tr-row-open:hover { background: rgba(196,154,60,0.08); box-shadow: inset 3px 0 0 var(--brass); }
.tr-row-toggle { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; margin-right: 6px; vertical-align: -3px; border-radius: 4px; color: var(--slate-light); }
.tr-clickable-row:hover .tr-row-toggle, .tr-row-open .tr-row-toggle { color: var(--brass-dark); }
.tr-expand-inner { display: flex; flex-direction: column; gap: 12px; }
.tr-weekdetail { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
.tr-weekdetail-batch { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 12px 14px; min-width: 0; }
.tr-weekdetail-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 6px; }
.tr-weekdetail-title { font-size: 13.5px; font-weight: 600; color: var(--ink); }
.tr-weekdetail-count { font-size: 12.5px; font-weight: 600; color: var(--slate-light); font-variant-numeric: tabular-nums; white-space: nowrap; }
.tr-weekdetail-met { color: #23654A; }
.tr-weekdetail-none { font-size: 13px; color: var(--slate-light); }
.tr-weekdetail-list { list-style: none; margin: 0; padding: 0; }
.tr-weekdetail-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; padding: 8px 0; border-top: 1px solid var(--line); font-size: 13.5px; }
.tr-weekdetail-row:first-child { border-top: none; padding-top: 2px; }
.tr-weekdetail-when { flex-basis: 100%; font-size: 12.5px; font-weight: 600; color: var(--slate); font-variant-numeric: tabular-nums; }
.tr-weekdetail-client { flex: 1; min-width: 0; color: var(--ink); }
.tr-weekdetail-meta { display: block; font-size: 12px; color: var(--slate-light); }
.tr-weekdetail-state { flex-shrink: 0; }
.tr-weekdetail-upcoming { font-size: 12px; color: var(--slate-light); }
.tr-expand-row td { background: var(--paper); padding: 16px; }
.tr-expand-row .tr-card { margin-bottom: 12px; }
.tr-expand-row .tr-card:last-child { margin-bottom: 0; }

.tr-minibar-wrap { display: flex; align-items: center; gap: 5px; min-width: 50px; }
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
.tr-pill-sale.tr-pill-btn-active-sale { background: #B95A24; border-color: var(--type-sale-dark); color: #fff; }
.tr-typefilter-row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.tr-search-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; min-height: 42px; background: var(--card); border: 1px solid var(--line-strong); border-radius: var(--radius-sm); padding: 0 12px; transition: border-color .15s, box-shadow .15s; }
.tr-search-row > .tr-search-input { align-self: stretch; }
.tr-search-row:focus-within { border-color: var(--brass); box-shadow: var(--ring); }
.tr-search-icon { color: var(--slate-light); flex-shrink: 0; }
.tr-search-input { flex: 1; min-width: 0; width: 100%; border: none; background: none; font-family: inherit; font-size: 14px; color: var(--ink); outline: none; }
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
.tr-tenure { font-size: 12px; color: var(--slate-light); margin-top: 2px; }

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
/* An appointment in the month grid opens when clicked (computers). */
.tr-cal-appt-btn { display: block; width: 100%; margin: 0; border: 0; font-family: inherit; text-align: left; }
@media (hover: hover) { .tr-cal-appt-btn:hover { text-decoration: underline; text-underline-offset: 2px; } }
.tr-cal-appt-btn:focus-visible { outline: 2px solid var(--brass); outline-offset: 1px; }
.tr-cal-appt-recruit { border-left: 2px solid var(--type-recruit); }
.tr-cal-appt-sale { border-left: 2px solid var(--type-sale); }
.tr-cal-appt-both { border-left: 3px solid transparent; border-image: linear-gradient(180deg, var(--type-recruit) 50%, var(--type-sale) 50%) 1; }
.tr-cal-more { font-size: 11px; color: var(--slate-light); padding-left: 4px; }

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
.tr-prospect-card-acts { display: inline-flex; align-items: center; gap: 8px; }
.tr-prospect-card-acts:empty { display: none; }
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
.tr-agenda-time { width: 5.4em; flex-shrink: 0; font-size: 13px; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; white-space: nowrap; }
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
.tr-dayagenda-time { width: 5.4em; flex-shrink: 0; font-size: 13.5px; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; white-space: nowrap; }
.tr-dayagenda-main { flex: 1; min-width: 0; color: var(--ink); }
.tr-dayagenda-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 12.5px; color: var(--slate-light); }
.tr-dayagenda-badge { font-size: 11.5px; font-weight: 600; color: var(--brass-dark); background: var(--brass-tint); padding: 1px 8px; border-radius: 999px; }
.tr-tasks { list-style: none; margin: 0; padding: 0; }
.tr-task { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; column-gap: 12px; align-items: start; padding: 12px 0; border-top: 1px solid var(--line); }
.tr-task-extra { grid-column: 2 / -1; min-width: 0; }
.tr-tasks > .tr-task:first-child { border-top: none; }
.tr-task-node { flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; margin-top: 1px; border-radius: 50%; background: var(--brass-tint); color: var(--brass-dark); }
.tr-task-rust .tr-task-node { background: rgba(176,67,47,0.1); color: var(--rust); }
.tr-task-amber .tr-task-node { background: rgba(194,124,30,0.12); color: #8A5410; }
.tr-task-violet .tr-task-node { background: rgba(107,81,160,0.12); color: var(--violet-dark); }
.tr-task-green .tr-task-node { background: rgba(46,125,91,0.12); color: var(--green); }
.tr-task-blue .tr-task-node { background: rgba(45,104,168,0.12); color: #24548A; }
.tr-task-done .tr-task-node { background: var(--green); color: #fff; }
.tr-task-body { flex: 1; min-width: 0; }
.tr-task-title { font-size: 14.5px; line-height: 1.4; color: var(--ink); overflow-wrap: anywhere; }
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
.tr-task-link:hover { text-decoration: underline; }
.tr-task-link { background: none; border: none; padding: 0; font-family: inherit; font-size: 12.5px; font-weight: 500; color: var(--brass-dark); cursor: pointer; }
.tr-plan-more { margin: 2px 0 10px 40px; }
.tr-calllist { margin-top: 10px; padding: 2px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--paper); }
.tr-calllist-head { padding: 7px 0 3px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--slate-light); }
.tr-calllist-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 7px 0; border-top: 1px solid var(--line); }
.tr-calllist-who { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.tr-calllist-acts { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.tr-calllist-acts .tr-link-btn { margin-top: 0; }
.tr-calllist-addnum { display: inline-flex; align-items: center; gap: 3px; text-decoration: none; font-weight: 600; white-space: nowrap; }
.tr-calllist-number { flex-basis: 100%; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding-bottom: 2px; }
.tr-calllist-number input { flex: 1; min-width: 150px; max-width: 260px; padding: 7px 10px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); font: inherit; font-size: 14px; background: var(--card); color: var(--ink); }
.tr-calllist-number input.tr-input-bad { border-color: var(--rust); }
.tr-calllist-number .tr-link-btn { margin-top: 0; }
.tr-calllist-number .tr-error { flex-basis: 100%; margin: 0; }
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
.tr-newadv-toggle { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; padding: 0; border: none; background: none; font-family: inherit; text-align: left; cursor: pointer; color: inherit; }
.tr-newadv-titles { display: flex; flex-direction: column; min-width: 0; }
.tr-newadv-title { display: block; margin: 0; }
.tr-newadv-sub { margin-top: 2px; font-size: 13px; color: var(--slate-light); }
.tr-newadv-chev { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; font-size: 13px; font-weight: 600; color: var(--brass-dark); padding: 6px 10px; border-radius: var(--radius-sm); }
.tr-newadv-toggle:hover .tr-newadv-chev { background: var(--paper-dim); }
.tr-newadv-closed { padding-top: 14px; padding-bottom: 14px; }
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
  .tr-today-grid { grid-template-columns: minmax(0, 1fr); }
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
/* The follow-up note field looks like a field (it had no border), with a
   visible focus ring. */
.tr-intake-link-row > .tr-search-input { min-height: 40px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--card); transition: border-color .15s, box-shadow .15s; }
.tr-intake-link-row > .tr-search-input:focus { border-color: var(--brass); box-shadow: var(--ring); }
/* org chart */
.tr-org-stats { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; }
.tr-org-stats > span, .tr-org-stat-ready { font-size: 13px; color: var(--slate); background: var(--card); border: 1px solid var(--line); border-radius: 999px; padding: 5px 12px; }
.tr-org-stats strong { color: var(--ink); }
.tr-org-stat-ready { display: inline-flex; align-items: center; gap: 5px; font-family: inherit; cursor: pointer; background: rgba(201,162,75,0.14); border-color: rgba(201,162,75,0.45); color: #7A5C18; }
.tr-org-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.tr-org-search { flex: 1; min-width: 200px; margin: 0; }
.tr-org-card { padding: 8px 10px; }
.tr-org-tree, .tr-org-children { list-style: none; margin: 0; padding: 0; }
.tr-org-children { margin-left: 17px; padding-left: 14px; border-left: 1px solid var(--line); }
.tr-org-row { display: flex; align-items: center; gap: 10px; padding: 9px 8px; border-radius: 8px; }
.tr-org-row:hover { background: var(--paper); }
.tr-org-hit { background: rgba(201,162,75,0.12); }
.tr-org-me .tr-org-avatar { background: var(--ink); color: #fff; }
.tr-org-toggle { width: 22px; height: 22px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; border: none; background: none; color: var(--slate); border-radius: 6px; cursor: pointer; padding: 0; }
.tr-org-toggle:hover { background: var(--paper-dim); color: var(--ink); }
.tr-org-toggle-none { cursor: default; }
.tr-org-toggle-none:hover { background: none; }
.tr-org-avatar { width: 32px; height: 32px; flex-shrink: 0; border-radius: 999px; background: var(--paper-dim); color: var(--slate); font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; letter-spacing: .02em; }
.tr-org-main { flex: 1; min-width: 0; }
.tr-org-name { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 14px; color: var(--ink); }
.tr-org-you { font-size: 11px; color: var(--slate-light); }
.tr-org-tier { font-size: 11px; font-weight: 600; letter-spacing: .03em; padding: 1px 7px; border-radius: 999px; background: rgba(20,32,43,0.07); color: var(--ink); }
.tr-org-role { font-size: 11px; padding: 1px 7px; border-radius: 999px; border: 1px solid var(--line); color: var(--slate); }
.tr-org-ready { display: inline-flex; align-items: center; gap: 4px; font-family: inherit; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(201,162,75,0.5); background: rgba(201,162,75,0.15); color: #7A5C18; cursor: pointer; }
.tr-org-sub { font-size: 12px; color: var(--slate-light); margin-top: 2px; }
.tr-org-pace { display: flex; align-items: center; gap: 8px; flex-shrink: 0; font-size: 13px; color: var(--slate); }
/* org chart: solar system view */
.tr-solar { display: flex; flex-direction: column; gap: 12px; }
.tr-solar-trail { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; font-size: 13px; }
.tr-solar-trail button { font-family: inherit; font-size: 13px; border: none; background: none; color: var(--slate); padding: 4px 8px; border-radius: 6px; cursor: pointer; }
.tr-solar-trail button:hover { background: var(--paper-dim); color: var(--ink); }
.tr-solar-trail .tr-solar-crumb-on { color: var(--ink); font-weight: 600; background: var(--card); border: 1px solid var(--line); }
.tr-solar-crumb-sep { color: var(--slate-light); }
.tr-solar-space { position: relative; border-radius: 16px; overflow: hidden; background: radial-gradient(ellipse at 50% 45%, #1C2F42 0%, #111C27 55%, #0A121A 100%); border: 1px solid #0A121A; box-shadow: inset 0 0 80px rgba(0,0,0,0.35); }
.tr-solar-svg { display: block; width: 100%; max-width: 640px; margin: 0 auto; height: auto; animation: tr-solar-zoom .45s ease-out; }
@keyframes tr-solar-zoom { from { opacity: 0; transform: scale(.9); } to { opacity: 1; transform: none; } }
.tr-solar-star { animation: tr-solar-twinkle 4s ease-in-out infinite alternate; }
@keyframes tr-solar-twinkle { from { opacity: .15; } }
.tr-solar-orbit { fill: none; stroke: rgba(255,255,255,0.16); stroke-width: 1; stroke-dasharray: 3 7; animation: tr-solar-drift 60s linear infinite; }
@keyframes tr-solar-drift { to { stroke-dashoffset: -400; } }
.tr-solar-sun:not(.tr-solar-sun-person) circle:nth-child(2) { filter: drop-shadow(0 0 18px rgba(242,200,102,0.55)); }
.tr-solar-sun-text { font-size: 22px; font-weight: 700; fill: #14202B; letter-spacing: .02em; }
.tr-solar-ready { fill: none; stroke: #F2C866; stroke-width: 2; stroke-dasharray: 4 4; animation: tr-solar-drift 12s linear infinite; }
.tr-solar-planet { cursor: pointer; animation: tr-solar-planet-in .55s cubic-bezier(.2,.8,.3,1) both; outline: none; }
@keyframes tr-solar-planet-in { from { transform: translate(300px, 300px) scale(.2); opacity: 0; } }
.tr-solar-planet .tr-body, .tr-solar-sun-person .tr-body { transition: filter .15s; }
.tr-solar-planet:hover .tr-body, .tr-solar-planet:focus-visible .tr-body, .tr-solar-planet-on .tr-body,
.tr-solar-sun-person:hover .tr-body, .tr-solar-sun-person:focus-visible .tr-body { filter: brightness(1.15); }
.tr-solar-planet:focus-visible .tr-solar-label, .tr-solar-sun-person:focus-visible .tr-solar-label { text-decoration: underline; }
.tr-solar-sun-person { cursor: pointer; outline: none; }
.tr-solar-halo { fill: rgba(255,255,255,0.08); stroke: rgba(255,255,255,0.6); stroke-width: 1.2; }
.tr-solar-sublabel-ready { fill: #F2C866; }
.tr-solar-label { fill: #fff; font-size: 12.5px; font-weight: 600; pointer-events: none; }
.tr-solar-sublabel { fill: rgba(255,255,255,0.6); font-size: 10.5px; pointer-events: none; }
.tr-solar-moonpath { fill: none; stroke: rgba(255,255,255,0.12); stroke-width: 1; }
.tr-solar-moon { fill: #C9D6E3; }
.tr-solar-legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 14px; padding: 4px 14px 14px; font-size: 11.5px; color: rgba(255,255,255,0.72); }
.tr-solar-legend span { display: inline-flex; align-items: center; gap: 6px; }
.tr-solar-legend i { width: 10px; height: 10px; border-radius: 999px; display: inline-block; }
.tr-solar-legend .tr-solar-legend-ring { border: 2px dashed #F2C866; width: 12px; height: 12px; background: none; }
.tr-solar-legend .tr-solar-legend-moon { background: #C9D6E3; width: 6px; height: 6px; }
.tr-solar-legend .tr-solar-legend-pace { width: 12px; height: 12px; background: none; border: 2px solid #4FB286; border-right-color: rgba(255,255,255,0.2); }
.tr-solar-levels { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 12px; padding: 0 14px 14px; font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.7); }
.tr-solar-levels span { display: inline-flex; align-items: center; gap: 3px; }
.tr-solar-panel { padding: 14px 16px; }
.tr-solar-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.tr-solar-panel-title { font-weight: 600; color: var(--ink); font-size: 15px; }
.tr-solar-panel-sub { font-size: 12.5px; color: var(--slate); margin-top: 2px; }
.tr-solar-list { list-style: none; margin: 10px 0 0; padding: 0; }
.tr-solar-list li { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid var(--line); }
.tr-solar-dot { width: 10px; height: 10px; border-radius: 999px; flex-shrink: 0; }
.tr-solar-list-name { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 14px; color: var(--ink); }
.tr-solar-list-sub { flex-basis: 100%; font-size: 12px; color: var(--slate-light); }
.tr-solar-results { display: flex; flex-wrap: wrap; gap: 6px; }
.tr-solar-sortnote { font-size: 12px; color: var(--slate-light); margin-top: 10px; }
.tr-solar-list li.tr-solar-li-on { background: var(--brass-tint); border-radius: 10px; border-top-color: transparent; padding-left: 8px; padding-right: 8px; }
.tr-solar-name-btn { font: inherit; color: inherit; background: none; border: none; padding: 0; cursor: pointer; text-align: left; }
.tr-solar-name-btn:hover strong { text-decoration: underline; }
.tr-solar-list-bar { flex-basis: 100%; height: 4px; border-radius: 999px; background: var(--paper-dim); overflow: hidden; max-width: 260px; }
.tr-solar-list-bar i { display: block; height: 100%; border-radius: 999px; background: var(--brass); }
/* level bodies */
.tr-body-icon { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 999px; background: #0D1620; overflow: hidden; }
.tr-body-icon svg { overflow: visible; }
/* milestone card: a popover beside the picture on wide screens, a bottom sheet on phones */
.tr-solar-pop { position: absolute; top: 14px; width: 316px; max-width: calc(100% - 28px); max-height: calc(100% - 28px); overflow-y: auto; z-index: 3; border-radius: 14px; box-shadow: 0 18px 44px rgba(0,0,0,0.45); background: var(--card); }
.tr-solar-pop-right { right: 14px; }
.tr-solar-pop-left { left: 14px; }
@media (prefers-reduced-motion: no-preference) {
  .tr-solar-pop { animation: tr-pop .18s ease-out; }
}
.tr-ms-card { padding: 14px 16px 16px; font-size: 13px; color: var(--slate); }
.tr-ms-head { display: flex; align-items: center; gap: 10px; }
.tr-ms-who { flex: 1; min-width: 0; }
.tr-ms-name { font-weight: 600; color: var(--ink); font-size: 16px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.tr-ms-sub { font-size: 12.5px; color: var(--slate-light); }
.tr-ms-head .tr-icon-btn { align-self: flex-start; }
.tr-ms-note { margin: 12px 0 0; font-size: 13px; color: var(--slate); }
.tr-ms-next { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--line); }
.tr-ms-next .tr-label { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--slate-light); font-weight: 600; }
.tr-ms-nextrow { display: flex; align-items: center; gap: 5px; margin-top: 5px; color: var(--slate-light); }
.tr-ms-nextrow strong { color: var(--ink); font-size: 14px; margin-left: 2px; }
.tr-ms-bar { height: 7px; border-radius: 999px; background: var(--paper-dim); overflow: hidden; margin: 8px 0 3px; }
.tr-ms-bar i { display: block; height: 100%; border-radius: 999px; background: var(--brass); }
.tr-ms-bar i.tr-ms-bar-done, .tr-solar-list-bar i.tr-ms-bar-done { background: var(--green); }
.tr-ms-bar-sm { height: 5px; margin: 4px 0 1px; }
.tr-ms-meta { font-size: 12px; color: var(--slate-light); }
.tr-ms-reqs { margin-top: 8px; }
.tr-ms-req { padding: 5px 0; }
.tr-ms-req-top { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; }
.tr-ms-req-top strong { color: var(--ink); font-weight: 600; white-space: nowrap; }
.tr-ms-req-gap .tr-ms-req-top span { color: #9B4A1E; font-weight: 600; }
.tr-ms-req-gap .tr-ms-bar i { background: #C9702E; }
.tr-ms-req-met .tr-ms-req-top span { color: var(--slate-light); }
.tr-ms-months { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
.tr-ms-months span { font-size: 11.5px; padding: 2px 8px; border-radius: 999px; background: var(--paper-dim); color: var(--slate); }
.tr-ms-months span.tr-ms-month-met { background: rgba(46,125,91,0.12); color: #23654A; }
.tr-ms-window { font-size: 11.5px; color: var(--slate-light); margin-top: 2px; }
.tr-ms-gap { display: flex; gap: 8px; align-items: flex-start; background: var(--brass-tint); border-radius: 9px; padding: 9px 11px; margin-top: 10px; font-size: 12.5px; color: #5B4510; line-height: 1.45; }
.tr-ms-gap strong { color: #3F2F07; }
.tr-ms-gap svg { color: var(--brass-dark); margin-top: 2px; flex-shrink: 0; }
.tr-ms-gap-ready { background: rgba(46,125,91,0.1); color: #1E5A40; }
.tr-ms-gap-ready strong { color: #164532; }
.tr-ms-gap-ready svg { color: var(--green); }
.tr-ms-week { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 12px; font-size: 12.5px; }
.tr-ms-week > span:first-child { display: inline-flex; align-items: center; gap: 5px; }
.tr-ms-week strong { color: var(--ink); }
.tr-ms-lic { color: var(--slate-light); }
.tr-ms-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.tr-ms-actions:empty { display: none; }
.tr-ms-actions .tr-ms-on { background: var(--paper-dim); }
.tr-ms-card .tr-coaching-panel { margin-top: 12px; padding-top: 12px; }
.tr-ms-open { width: 100%; margin-top: 10px; }
.tr-ms-sheet .tr-modal-card { padding: 4px 0 calc(8px + env(safe-area-inset-bottom, 0px)); }
.tr-ms-sheet .tr-modal-card::before { content: ''; display: block; width: 40px; height: 5px; border-radius: 999px; background: var(--line-strong); margin: 6px auto 0; }
/* My path: your own level on Milestones */
.tr-path-hero { position: relative; overflow: hidden; border-radius: 14px; padding: 18px 20px 12px; background: radial-gradient(ellipse at 20% 30%, #1C2F42 0%, #111C27 55%, #0A121A 100%); color: #fff; }
.tr-path-hero-stars { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.tr-path-hero-top { position: relative; display: flex; align-items: center; gap: 18px; }
.tr-path-hero-body { width: 140px; height: 140px; flex-shrink: 0; overflow: visible; }
.tr-path-hero-k { font-size: 12.5px; color: #9FB0C0; }
.tr-path-hero-h { font-family: 'Newsreader', serif; font-size: 26px; font-weight: 600; line-height: 1.15; color: #fff; }
.tr-path-hero-s { font-size: 13px; color: #B9C6D2; margin-top: 2px; }
.tr-path-hero-p { font-size: 13px; margin-top: 6px; color: #9FE0BF; }
.tr-path-hero-p.tr-path-hero-p-progress { color: #F2C866; }
.tr-path-hero-p.tr-path-hero-p-missed { color: #F0A090; }
.tr-journey { position: relative; display: block; width: 100%; max-width: 420px; margin: 10px 0 0; overflow: visible; }
.tr-journey-label { fill: #7F8E9C; font-size: 10px; font-weight: 600; }
.tr-journey-you { fill: #F2C866; font-weight: 700; }
/* Growth → My path is full width: the path sits beside you, not under. */
@media (min-width: 900px) {
  .tr-growth .tr-path-hero { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 40px; padding: 22px 32px; }
  .tr-growth .tr-path-hero .tr-journey { max-width: 540px; margin: 0; justify-self: end; }
}
.tr-progress-summary { margin: 2px 0 12px; }
.tr-progress-summary .tr-ms-next { margin-top: 0; padding-top: 0; border-top: none; }
@media (prefers-reduced-motion: reduce) {
  .tr-solar-svg, .tr-solar-star, .tr-solar-orbit, .tr-solar-ready, .tr-solar-planet { animation: none; }
}
@media (max-width: 640px) {
  .tr-solar-space { border-radius: 12px; margin: 0 -4px; }
  .tr-solar-legend { font-size: 10.5px; gap: 4px 10px; }
  .tr-solar-label { font-size: 19px; }
  .tr-solar-sublabel { font-size: 15px; }
  .tr-path-hero { padding: 14px 14px 10px; }
  .tr-path-hero-top { gap: 12px; }
  .tr-path-hero-body { width: 96px; height: 96px; }
  .tr-path-hero-h { font-size: 22px; }
}
/* licensing tracker */
.tr-lic-card { padding: 18px 20px; }
.tr-lic-count { font-size: 12.5px; font-weight: 600; color: var(--slate); background: var(--paper-dim); padding: 3px 10px; border-radius: 999px; }
.tr-lic-count-done { background: rgba(63,143,108,0.14); color: #2E6E51; }
.tr-lic-bar { height: 6px; border-radius: 999px; background: var(--paper-dim); overflow: hidden; margin-top: 8px; }
.tr-lic-bar > div { height: 100%; background: var(--brass); border-radius: 999px; transition: width .3s ease; }
.tr-lic-state { max-width: 320px; margin-bottom: 6px; }
.tr-lic-steps { list-style: none; margin: 10px 0 0; padding: 0; }
.tr-lic-step { display: flex; gap: 12px; padding: 12px 0; border-top: 1px solid var(--line); position: relative; }
.tr-lic-dot { width: 26px; height: 26px; flex-shrink: 0; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; background: var(--paper-dim); color: var(--slate); }
.tr-lic-done .tr-lic-dot { background: #3F8F6C; color: #fff; }
.tr-lic-next .tr-lic-dot { background: var(--brass); color: var(--ink); box-shadow: 0 0 0 4px rgba(201,162,75,0.2); }
.tr-lic-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.tr-lic-title { font-size: 14.5px; font-weight: 600; color: var(--ink); }
.tr-lic-later .tr-lic-title { color: var(--slate); font-weight: 500; }
.tr-lic-done .tr-lic-title { color: var(--slate); }
.tr-lic-detail { font-size: 13px; color: var(--slate); line-height: 1.45; }
.tr-lic-later .tr-lic-detail { color: var(--slate-light); }
.tr-lic-main > .tr-link-btn { align-self: flex-start; font-size: 12.5px; }
.tr-lic-main > .tr-btn { align-self: flex-start; margin-top: 4px; }
.tr-lic-inline { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 4px; }
.tr-lic-inline input { font-family: inherit; font-size: 14px; min-height: 36px; padding: 7px 11px; border-radius: var(--radius-sm); border: 1px solid var(--line-strong); background: var(--card); color: var(--ink); min-width: 0; }
.tr-lic-inline input:focus { border-color: var(--brass); box-shadow: var(--ring); outline: none; }
.tr-lic-stat-warn { background: rgba(216,100,78,0.1) !important; border-color: rgba(216,100,78,0.35) !important; color: #9B3A26 !important; }
.tr-lic-recent { margin-top: 14px; padding: 16px 18px; }
.tr-org-lic { font-size: 11px; padding: 1px 7px; border-radius: 999px; background: rgba(124,137,152,0.14); color: var(--slate); }
@media (max-width: 640px) {
  .tr-lic-card { padding: 16px 14px; }
  .tr-lic-inline input { flex: 1 1 100%; font-size: 16px; }
}
/* promotion alerts on Today */
.tr-promo-list { list-style: none; margin: 10px 0 0 48px; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; color: var(--slate); }
.tr-promo-list li { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.tr-promo-list strong { color: var(--ink); }
.tr-promo-ready-cell { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px; }
@media (max-width: 640px) {
  .tr-org-children { margin-left: 10px; padding-left: 8px; }
  .tr-org-row { display: grid; grid-template-columns: 22px 28px minmax(0, 1fr); column-gap: 8px; row-gap: 4px; padding: 8px 4px; }
  .tr-org-avatar { width: 28px; height: 28px; font-size: 11px; }
  .tr-org-pace { grid-column: 3; }
  .tr-org-search { flex-basis: 100%; }
  .tr-promo-list { margin-left: 0; }
}
.tr-invite-email { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--line); display: flex; flex-direction: column; gap: 6px; }
.tr-invite-email-label { font-size: 13px; font-weight: 600; color: var(--ink); }
.tr-invite-email-row { display: flex; align-items: center; gap: 8px; }
.tr-invite-email-input { flex: 1; min-width: 0; font-family: inherit; font-size: 14px; min-height: 36px; padding: 7px 11px; border-radius: var(--radius-sm); border: 1px solid var(--line-strong); background-color: var(--card); color: var(--ink); }
.tr-invite-email-input::placeholder { color: #7A8591; }
.tr-invite-email-input:focus { border-color: var(--brass); box-shadow: var(--ring); outline: none; }
.tr-invite-email-row .tr-btn { flex-shrink: 0; white-space: nowrap; }
.tr-invite-email-sent { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: #2E6E51; }
@media (max-width: 640px) {
  .tr-invite-email-input { font-size: 16px; }
}
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
  .tr-form-grid { grid-template-columns: minmax(0, 1fr); }
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
  .tr-cal-headcell { font-size: 10.5px; padding: 6px 1px; }
  .tr-cal-daynum { font-size: 12px; }
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
  .tr-prospect-card-side { width: 100%; flex-wrap: wrap; padding-left: 40px; gap: 8px 6px; }
  .tr-prospect-card-side .tr-type-badge { margin-left: 0; }
  .tr-prospect-card-acts { margin-left: auto; gap: 6px; }
  /* week header: arrows + dates on one line, "This week" and the total below */
  .tr-pace-head .tr-weeknav { display: contents; }
  .tr-pace-head .tr-weeknav-label { flex: 1 1 calc(100% - 140px); min-width: 0; margin-right: 0; font-size: 14px; justify-content: center; }
  .tr-pace-total { margin-left: auto; }
  /* Phones: on this week, "This week" (greyed out) steps aside so the week,
     its arrows and the total share one line. */
  .tr-pace-head .tr-weeknav-label { flex: 1 1 0; }
  .tr-pace-head .tr-weeknav-label svg { display: none; }
  .tr-pace-head .tr-weeknav > .tr-btn:disabled { display: none; }
  /* The Zoom reminder stays one line. */
  .tr-connect-slim.tr-connect-nudge { flex-wrap: nowrap; }
  .tr-connect-nudge .tr-connect-text { flex: 1 1 auto; min-width: 0; }
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
    min-height: 54px; padding: 0 1px; border: none; background: transparent; font-family: inherit; font-size: 11px; font-weight: 500;
    color: var(--slate-light); cursor: pointer; border-radius: 10px;
  }
  /* Labels use the whole width of their slot (no button padding), so
     "Production" and "Resources" aren't cut short. */
  .tr-bottomnav button span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; letter-spacing: -0.1px; }
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

  /* Weekly pace: two batches per row, smaller dots */
  .tr-pace-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 14px 16px; }
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
  .tr-cal-more { font-size: 10.5px; font-weight: 600; padding: 0; line-height: 1.2; white-space: nowrap; }
  .tr-cal-more-word { display: none; }
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
  .tr-table-wrap .tr-table .tr-expand-row td:first-child { position: static; min-width: 0; max-width: none; box-shadow: none; background: var(--paper); }
  .tr-table-wrap .tr-table .tr-row-open td:first-child { background: #faf7ef; }
  .tr-expand-inner { position: sticky; left: 0; width: calc(100vw - 60px); }
  .tr-weekdetail { grid-template-columns: 1fr; }
  .tr-appt-group .tr-table td:first-child { position: static; box-shadow: none; min-width: 0; max-width: none; background: transparent; }
  /* Team tables marked tr-table-stack: one card per person on a phone, with
     each number labelled, instead of a table you swipe sideways. */
  .tr-table-wrap:has(> .tr-table-stack) { overflow: visible; margin: 0; padding: 0; }
  .tr-table.tr-table-stack thead { display: none; }
  .tr-table.tr-table-stack, .tr-table.tr-table-stack tbody { display: block; width: 100%; }
  .tr-table.tr-table-stack tbody tr { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 6em), 1fr)); align-items: end; gap: 10px 12px; padding: 14px 16px; border-bottom: 1px solid var(--line); }
  .tr-table.tr-table-stack tbody tr:last-child { border-bottom: none; }
  .tr-table-wrap .tr-table.tr-table-stack td, .tr-table-wrap .tr-table.tr-table-stack td:first-child { display: block; position: static; min-width: 0; max-width: none; padding: 0; border: none; box-shadow: none; background: transparent; }
  .tr-table-wrap .tr-table.tr-table-stack td:first-child { grid-column: 1 / -1; font-size: 14.5px; }
  .tr-table.tr-table-stack td[data-label]::before { content: attr(data-label); display: block; margin-bottom: 2px; font-family: 'IBM Plex Sans', system-ui, sans-serif; font-size: 12px; font-weight: 500; color: var(--slate-light); }
  .tr-table.tr-table-stack tbody tr.tr-expand-row { display: block; padding: 0; background: var(--paper); }
  .tr-table-wrap .tr-table.tr-table-stack .tr-expand-row td { padding: 14px 16px; }
  .tr-table-stack .tr-expand-inner { position: static; width: auto; }
  .tr-table-wrap .tr-table.tr-table-stack .tr-row-open td:first-child { background: transparent; }
  .tr-table.tr-table-stack .tr-row-open { background: #faf7ef; }
  /* Manage Team: name and delete on top, then email, then each picker on
     its own line (so "Super Admin" and long names fit). */
  .tr-table.tr-manage-table tbody tr { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; grid-template-areas: "name name del" "email email email" "role role role" "mgr mgr mgr" "tier tier tier"; }
  .tr-table-wrap .tr-table.tr-manage-table td.tr-mt-name { grid-area: name; }
  .tr-manage-table td.tr-mt-email { grid-area: email; color: var(--slate); overflow-wrap: anywhere; }
  .tr-manage-table td.tr-mt-role { grid-area: role; }
  .tr-manage-table td.tr-mt-mgr { grid-area: mgr; }
  .tr-manage-table td.tr-mt-tier { grid-area: tier; }
  .tr-manage-table td.tr-mt-del { grid-area: del; align-self: start; margin: -10px 0 0 0; }
  .tr-table-wrap .tr-table.tr-manage-table td select { width: 100%; max-width: none; min-height: 40px; }
  .tr-table.tr-manage-table tbody tr { padding-left: 0; padding-right: 0; } /* (the card's own padding is enough; more room for the pickers) */
  /* Tables that still scroll sideways fade at the edge, so you can tell
     there's more to see. */
  .tr-summary-card .tr-table-wrap:not(:has(> .tr-table-stack)) { -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 26px), transparent); mask-image: linear-gradient(90deg, #000 calc(100% - 26px), transparent); }

  /* iOS Safari zooms the whole page when you tap a field smaller than
     16px — keep every field at 16px on phones so it never does. */
  .tr-root input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), .tr-root select, .tr-root textarea { font-size: 16px !important; }
}

@media (max-width: 640px) {
  .tr-plan-head { padding: 16px 16px 10px; }
  .tr-plan-score { padding: 0 16px 14px; }
  .tr-plan-section { padding: 12px 16px 6px; }
  .tr-dayagenda-soon { margin: 0 -16px; padding: 10px 16px; }
  .tr-task { column-gap: 10px; }
  .tr-f30-head { gap: 12px; padding: 16px; }
  .tr-f30-head .tr-ring, .tr-f30-head .tr-ring svg { width: 46px !important; height: 46px !important; }
  .tr-f30 .tr-ring-label strong { font-size: 18px; }
  .tr-f30-head-main { padding-right: 22px; }
  .tr-f30-title { font-size: 20px; }
  .tr-f30-foot { padding: 10px 16px 14px; }
  .tr-f30-week { padding: 14px 16px 10px; }
  .tr-f30-complete .tr-f30-head { flex-wrap: wrap; }
  .tr-dayagenda-time { width: 4.9em; }  /* (in em, so it grows with bigger phone text) */
}

/* ---- + New and search (header) ------------------------------------ */
.tr-header-new { min-height: 34px; padding: 6px 13px; }
.tr-gsearch { position: relative; flex: 1; min-width: 0; max-width: 440px; margin: 0 auto 0 28px; }
.tr-gsearch-box { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 10px 0 12px; border-radius: 9px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.14); color: rgba(255,255,255,0.65); }
.tr-gsearch-box:focus-within { background: #fff; color: var(--slate-light); border-color: #fff; box-shadow: 0 0 0 3px rgba(196,154,60,0.35); }
.tr-gsearch-box input { flex: 1; min-width: 0; border: none; background: transparent; font-family: inherit; font-size: 13.5px; color: #fff; outline: none; -webkit-appearance: none; appearance: none; }
.tr-gsearch-box input::-webkit-search-cancel-button { display: none; }
.tr-root .tr-gsearch-box input:focus-visible { outline: none; }
/* Search boxes and the note field show focus with their own ring, so the
   field inside doesn't need a second outline. */
.tr-root .tr-search-row .tr-search-input:focus-visible, .tr-root .tr-intake-link-row > .tr-search-input:focus-visible { outline: none; }
.tr-gsearch-box:focus-within input { color: var(--ink); }
.tr-gsearch-box input::placeholder { color: rgba(255,255,255,0.6); }
.tr-gsearch-box:focus-within input::placeholder { color: var(--slate-light); }
.tr-gsearch-box kbd { font-family: 'IBM Plex Mono', monospace; font-size: 11px; line-height: 1; padding: 3px 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.25); color: rgba(255,255,255,0.6); }
.tr-gsearch-box:focus-within kbd { display: none; }
.tr-gsearch-pop { position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 80; max-height: min(70vh, 520px); overflow-y: auto; background: var(--card); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 18px 44px rgba(19,33,46,0.28); padding: 6px; }
.tr-gsearch-group + .tr-gsearch-group { margin-top: 4px; padding-top: 4px; border-top: 1px solid var(--line); }
.tr-gsearch-label { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; font-weight: 700; color: var(--slate-light); padding: 6px 8px 4px; }
.tr-gsearch-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 8px; border: none; border-radius: 8px; background: transparent; font-family: inherit; text-align: left; cursor: pointer; color: var(--slate); }
.tr-gsearch-item-on { background: var(--paper-dim); }
.tr-gsearch-icon { width: 30px; height: 30px; flex-shrink: 0; border-radius: 999px; background: var(--paper-dim); color: var(--slate); display: inline-flex; align-items: center; justify-content: center; }
.tr-gsearch-item-on .tr-gsearch-icon { background: var(--card); }
.tr-gsearch-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.tr-gsearch-text strong { color: var(--ink); font-size: 14px; font-weight: 600; }
.tr-gsearch-text span { font-size: 12px; color: var(--slate-light); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tr-gsearch-tag { flex-shrink: 0; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: rgba(46,125,91,0.12); color: #23654A; }
.tr-gsearch-tag-today { background: rgba(194,124,30,0.14); color: #7E520E; }
.tr-gsearch-empty { margin: 0; padding: 12px 10px; font-size: 13px; color: var(--slate-light); }
.tr-gsearch-phone { display: none; }
.tr-search-overlay { position: fixed; inset: 0; z-index: 95; background: var(--card); display: flex; flex-direction: column; }
.tr-search-overlay-top { display: flex; align-items: center; gap: 10px; padding: calc(12px + env(safe-area-inset-top, 0px)) 14px 12px; background: var(--ink); }
.tr-gsearch-box-phone { flex: 1; height: 42px; background: #fff; border-color: #fff; color: var(--slate-light); }
.tr-gsearch-box-phone input { align-self: stretch; color: var(--ink); font-size: 16px; }
.tr-gsearch-box-phone input::placeholder { color: var(--slate-light); }
.tr-search-cancel { border: none; background: none; font-family: inherit; font-size: 15px; font-weight: 600; color: var(--brass); padding: 8px 2px; cursor: pointer; }
.tr-search-overlay-body { flex: 1; overflow-y: auto; padding: 8px 10px calc(24px + env(safe-area-inset-bottom, 0px)); }
.tr-search-overlay-body .tr-gsearch-item { padding: 10px 8px; }

/* + New menu: a dropdown under the header button on a computer */
.tr-new-backdrop { position: fixed; inset: 0; z-index: 85; }
.tr-new-menu { position: absolute; top: 58px; right: 24px; width: 300px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 18px 44px rgba(19,33,46,0.28); padding: 8px; }
@media (prefers-reduced-motion: no-preference) { .tr-new-menu { animation: tr-pop .16s ease-out; } }
.tr-new-grip { display: none; }
.tr-new-head { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; font-weight: 700; color: var(--slate-light); padding: 4px 8px 6px; }
.tr-new-item { display: flex; align-items: center; gap: 11px; width: 100%; padding: 8px; border: none; border-radius: 9px; background: transparent; font-family: inherit; text-align: left; cursor: pointer; }
.tr-new-item:hover, .tr-new-item:focus-visible { background: var(--paper-dim); outline: none; }
.tr-new-icon { width: 34px; height: 34px; flex-shrink: 0; border-radius: 9px; background: var(--brass-tint); color: var(--brass-dark); display: inline-flex; align-items: center; justify-content: center; }
.tr-new-text { display: flex; flex-direction: column; }
.tr-new-text strong { color: var(--ink); font-size: 14px; font-weight: 600; }
.tr-new-text span { font-size: 12px; color: var(--slate-light); }
.tr-invite-modal .tr-invite-box > .tr-invite-title { display: none; }
.tr-bottomnav-plus { width: 46px; height: 46px; border-radius: 999px; background: var(--brass); color: var(--ink); display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 6px 14px rgba(196,154,60,0.45); }

/* ---- Today: Needs you ---------------------------------------------- */
.tr-needs { margin-top: 14px; padding: 14px 16px 6px; }
.tr-needs-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.tr-needs-title { margin: 0; font-size: 15px; font-weight: 600; color: var(--ink); }
.tr-needs-count { font-size: 12.5px; color: var(--slate-light); }
.tr-needs-list { list-style: none; margin: 8px 0 0; padding: 0; }
.tr-needs-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--line); }
.tr-needs-icon { width: 36px; height: 36px; flex-shrink: 0; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; }
.tr-needs-icon-brass { background: var(--brass-tint); color: var(--brass-dark); }
.tr-needs-icon-blue { background: rgba(45,104,168,0.1); color: #24548A; }
.tr-needs-icon-rust { background: rgba(176,67,47,0.1); color: #9B3A26; }
.tr-needs-icon-amber { background: rgba(194,124,30,0.13); color: #8A5A10; }
.tr-needs-ring { flex-shrink: 0; width: 36px; display: inline-flex; justify-content: center; }
.tr-needs-body { flex: 1; min-width: 0; }
.tr-needs-row-title { font-size: 14px; color: var(--slate); }
.tr-needs-row-title strong { color: var(--ink); }
.tr-needs-row-sub { font-size: 12.5px; color: var(--slate-light); margin-top: 1px; }
.tr-needs-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.tr-needs-hide { margin-top: 0; align-self: center; }

/* ---- Team Overview ------------------------------------------------- */
.tr-tov-tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.tr-tov-tile { display: flex; flex-direction: column; gap: 2px; padding: 14px 16px; text-align: left; font-family: inherit; color: inherit; }
.tr-tov-tile-link { cursor: pointer; transition: border-color .15s, box-shadow .15s; }
.tr-tov-tile-link:hover { border-color: var(--line-strong); box-shadow: 0 2px 10px rgba(19,33,46,0.06); }
.tr-tov-tile-brass { border-color: rgba(196,154,60,0.55); background: linear-gradient(0deg, rgba(196,154,60,0.07), rgba(196,154,60,0.07)), var(--card); }
.tr-tov-tile-label { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--slate-light); }
.tr-tov-tile-value { font-family: 'Newsreader', serif; font-size: 26px; font-weight: 600; color: var(--ink); line-height: 1.2; }
.tr-tov-tile-sub { font-size: 12.5px; color: var(--slate-light); }
.tr-tov { display: flex; flex-direction: column; gap: 16px; }
.tr-tov .tr-pagehead { margin-bottom: 0; }
.tr-tov-cols { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.tr-tov-side { display: flex; flex-direction: column; gap: 16px; }
.tr-tov-box { padding: 14px 16px; }
.tr-tov-box-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
.tr-tov-box-head h3 { margin: 0; font-size: 15px; font-weight: 600; color: var(--ink); }
.tr-tov-box-head span { font-size: 12.5px; color: var(--slate-light); }
.tr-tov-list { list-style: none; margin: 0; padding: 0; }
.tr-tov-list li { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--line); }
.tr-tov-text { flex: 1; min-width: 0; font-size: 14px; color: var(--slate); }
.tr-tov-text strong { color: var(--ink); }
.tr-tov-sub { font-size: 12.5px; color: var(--slate-light); margin-top: 1px; }
.tr-tov-win-icon { width: 30px; height: 30px; flex-shrink: 0; border-radius: 999px; background: rgba(46,125,91,0.12); color: #23654A; display: inline-flex; align-items: center; justify-content: center; }
.tr-tov-clear { display: flex; align-items: center; gap: 8px; }
.tr-tov-galaxy { display: block; width: 100%; padding: 0; border: none; border-radius: 12px; overflow: hidden; cursor: pointer; background: radial-gradient(ellipse at 50% 50%, #1C2F42 0%, #111C27 60%, #0A121A 100%); }
.tr-tov-galaxy svg { display: block; width: 100%; height: auto; }

@media (max-width: 900px) {
  .tr-tov-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .tr-tov-cols { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 640px) {
  .tr-gsearch, .tr-header-new { display: none; }
  .tr-gsearch-phone { display: inline-flex; margin-left: auto; }
  .tr-header-row .tr-gsearch-phone + .tr-header-user { margin-left: 4px; }
  .tr-new-backdrop { background: rgba(20,32,43,0.45); display: flex; align-items: flex-end; z-index: 90; }
  .tr-new-menu { position: static; width: 100%; top: auto !important; left: auto !important; border-radius: 16px 16px 0 0; border: none; padding: 8px 12px calc(16px + env(safe-area-inset-bottom, 0px)); box-shadow: 0 -8px 30px rgba(19,35,48,0.2); }
  .tr-new-grip { display: block; }
  .tr-new-item { padding: 10px 8px; }
  .tr-bottomnav .tr-bottomnav-new { flex: 0 0 58px; }
  @media (max-width: 360px) {
    .tr-bottomnav .tr-bottomnav-new { flex-basis: 52px; }
    .tr-bottomnav button { font-size: 10.5px; }
  }
  .tr-bottomnav-plus { margin-top: -18px; width: 50px; height: 50px; }
  .tr-needs-row { flex-wrap: wrap; }
  .tr-needs-actions { width: 100%; padding-left: 48px; }
  .tr-tov-tile-value { font-size: 22px; }
  .tr-tov-list li { flex-wrap: wrap; row-gap: 8px; }
  .tr-tov-list li .tr-tov-text { flex: 1 1 calc(100% - 50px); }
  .tr-tov-list li > .tr-btn { margin-left: 48px; }
  .tr-tov-wins li > .tr-btn { margin-left: 42px; }
}

/* ---- Team Overview: today's checklist ------------------------------ */
.tr-tov-main { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.tr-check { padding: 16px 18px 14px; border-color: rgba(196,154,60,0.45); }
.tr-check-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.tr-check-head h3 { margin: 0; display: flex; align-items: center; gap: 7px; font-family: 'Newsreader', serif; font-size: 21px; font-weight: 600; color: var(--ink); }
.tr-check-head h3 svg { color: var(--brass-dark); }
.tr-check-date { font-size: 12.5px; color: var(--slate-light); margin-top: 2px; }
.tr-check-why { margin: 6px 0 4px; font-size: 12.5px; color: var(--slate-light); }
.tr-check-list { list-style: none; margin: 4px 0 0; padding: 0; }
.tr-check-list li { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid var(--line); }
.tr-check-box { width: 24px; height: 24px; flex-shrink: 0; border-radius: 7px; border: 2px solid var(--line-strong); background: var(--card); color: #fff; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; transition: background .15s, border-color .15s; }
.tr-check-box:hover { border-color: var(--brass); }
.tr-check-done .tr-check-box { background: var(--green); border-color: var(--green); }
.tr-check-done .tr-tov-text { color: var(--slate-light); }
.tr-check-done .tr-tov-text > div:first-child { text-decoration: line-through; text-decoration-color: rgba(52,66,79,0.45); }
.tr-check-done .tr-tov-text strong { color: var(--slate-light); }
.tr-check-done .tr-needs-icon { opacity: 0.5; }
.tr-needs-icon-green { background: rgba(46,125,91,0.12); color: #23654A; }
.tr-needs-icon-ink { background: var(--paper-dim); color: var(--slate); }
.tr-check-own .tr-icon-btn { flex-shrink: 0; }
.tr-check-add { display: flex; gap: 8px; margin-top: 10px; padding-top: 12px; border-top: 1px solid var(--line); }
.tr-check-add input { flex: 1; min-width: 0; height: 36px; padding: 0 12px; border-radius: var(--radius-sm); border: 1px solid var(--line-strong); font-family: inherit; font-size: 14px; color: var(--ink); background: var(--card); }
.tr-check-add input:focus { border-color: var(--brass); box-shadow: var(--ring); outline: none; }
.tr-check-note { margin: 10px 0 0; font-size: 12.5px; color: #8A5A10; background: rgba(194,124,30,0.1); border-radius: 8px; padding: 8px 10px; }
@media (max-width: 640px) {
  .tr-check-list li { flex-wrap: wrap; row-gap: 8px; }
  .tr-check-list li .tr-tov-text { flex: 1 1 calc(100% - 80px); }
  .tr-check-list li > .tr-btn { margin-left: 80px; }
  .tr-check-add input { font-size: 16px; }
}

/* ---- Email compose window ------------------------------------------ */
.tr-compose { display: flex; flex-direction: column; gap: 12px; max-width: 520px; }
.tr-compose-to { display: flex; align-items: center; gap: 10px; font-size: 13.5px; color: var(--slate); padding: 8px 12px; border-radius: var(--radius-sm); background: var(--paper); border: 1px solid var(--line); }
.tr-compose-to span { color: var(--slate-light); font-weight: 600; font-size: 12.5px; }
.tr-compose-to strong { flex: 1; min-width: 0; color: var(--ink); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tr-compose-to .tr-link-btn { margin-top: 0; align-self: center; }
.tr-compose-label { font-size: 12px; font-weight: 600; color: var(--slate-light); margin-bottom: -4px; }
.tr-compose-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.tr-compose-note { margin: 0; font-size: 12.5px; color: var(--slate-light); }
@media (max-width: 640px) {
  .tr-compose-actions .tr-btn { flex: 1 1 calc(50% - 8px); justify-content: center; }
  .tr-compose .tr-field input, .tr-compose .tr-field textarea { font-size: 16px; }
}

/* ---- presenting for your team (counts toward your pace) ------------ */
.tr-presenting-chip { display: inline-flex; align-items: center; font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: 999px; background: rgba(45,104,168,0.1); color: #24548A; white-space: nowrap; }
.tr-promo-status { margin-top: 5px; font-size: 12px; color: var(--slate-light); line-height: 1.45; }
.tr-promo-warn { color: var(--rust); font-weight: 600; }
.tr-promo-note { font-size: 12px; color: var(--slate-light); }
.tr-promo-status .tr-promo-resend { margin-top: 0; font-size: 12px; }
.tr-forms-toolbar { margin-bottom: 14px; }
.tr-forms-toolbar .tr-search-row { flex: 1 1 260px; margin: 0; }
.tr-forms-sub { font-size: 12px; color: var(--slate-light); margin-top: 2px; }
.tr-forms-action { text-align: right; font-size: 12.5px; font-weight: 600; color: var(--brass-dark); white-space: nowrap; }
.tr-forms-table .tr-expand-row td { background: var(--paper); }
@media (max-width: 640px) { .tr-forms-table .tr-forms-action, .tr-forms-table .tr-forms-action-h { display: none; } }
/* Team Pace → Recruits */
.tr-rec-stages { display: flex; align-items: stretch; gap: 6px; margin: 4px 0 14px; overflow-x: auto; padding-bottom: 2px; }
.tr-rec-stage { flex: 1 0 auto; min-width: 92px; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 9px 12px; border-radius: var(--radius-sm); border: 1px solid var(--line-strong); background: var(--card); font-family: inherit; font-size: 12px; color: var(--slate-light); cursor: pointer; text-align: left; transition: border-color .15s, box-shadow .15s; }
.tr-rec-stage strong { font-size: 20px; line-height: 1.1; color: var(--ink); font-variant-numeric: tabular-nums; }
.tr-rec-stage:hover { border-color: var(--brass); }
.tr-rec-stage-on { border-color: var(--brass); box-shadow: var(--ring); color: var(--ink); }
.tr-rec-stage-flag { background: rgba(176,67,47,0.06); border-color: rgba(176,67,47,0.35); }
.tr-rec-stage-flag strong { color: var(--rust); }
.tr-rec-stage-flag > span { color: var(--slate); }
.tr-rec-arrow { flex: 0 0 auto; align-self: center; color: var(--line-strong); }
.tr-rec-list { list-style: none; margin: 0; padding: 0; }
.tr-rec-row { display: flex; align-items: center; gap: 12px; padding: 13px 16px; border-top: 1px solid var(--line); }
.tr-rec-row:first-child { border-top: none; }
.tr-rec-dot { flex: 0 0 8px; width: 8px; height: 8px; border-radius: 50%; align-self: flex-start; margin-top: 7px; }
.tr-rec-dot-late { background: var(--rust); }
.tr-rec-dot-action, .tr-rec-dot-stuck { background: var(--brass); }
.tr-rec-main { flex: 1; min-width: 0; }
.tr-rec-name { font-size: 14.5px; color: var(--ink); }
.tr-rec-name strong { font-weight: 600; }
.tr-rec-context { margin-left: 4px; font-size: 13px; color: var(--slate-light); }
.tr-rec-detail { font-size: 13px; color: var(--slate); margin-top: 3px; line-height: 1.45; }
.tr-rec-flagtext { font-weight: 600; color: var(--brass-dark); }
.tr-rec-flagtext-late { color: var(--rust); }
.tr-rec-actions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex: 0 0 auto; }
.tr-screen-head { margin-bottom: 10px; }
.tr-rec-sub { font-size: 12.5px; color: var(--slate-light); margin-top: 2px; }
.tr-titleline .tr-section-title { margin: 0; }
.tr-screen-loading { padding: 4px 0; }
.tr-screen-failed { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 20px; }
.tr-screen-failed p { margin: 0 0 6px; color: var(--slate-light); font-size: 14px; }
.tr-count-line { margin: 0 0 10px; font-size: 14px; color: var(--slate-light); }
.tr-count-line strong { color: var(--ink); font-weight: 700; }
.tr-count-line .tr-count-warn { color: var(--rust); }
.tr-seg-view { margin: 0 0 12px; align-self: flex-start; width: max-content; max-width: 100%; }

/* My work → Pipeline: five stages a name moves through, left to right. The
   wrappers step aside so each arrow gets its own narrow column. */
.tr-pipeline, .tr-growth { display: flex; flex-direction: column; gap: 16px; }
.tr-won { display: flex; flex-direction: column; gap: 14px; }
.tr-won .tr-seg-view, .tr-won .tr-count-line { margin: 0; }
.tr-stages { display: grid; grid-template-columns: minmax(0, 1fr) repeat(4, 22px minmax(0, 1fr)); align-items: stretch; }
.tr-stage-wrap { display: contents; }
.tr-stage-arrow { align-self: center; justify-self: center; color: var(--line-strong); }
.tr-stage { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 12px 14px; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); font-family: inherit; color: var(--ink); text-align: left; cursor: pointer; transition: border-color .12s, box-shadow .12s; }
.tr-stage:hover { border-color: var(--line-strong); }
.tr-stage-on, .tr-stage-on:hover { border-color: var(--brass); box-shadow: 0 0 0 3px var(--brass-tint); }
.tr-stage-top { display: flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 600; color: var(--slate); white-space: nowrap; }
.tr-stage-on .tr-stage-top { color: var(--brass-dark); }
.tr-stage-n { font-family: 'Newsreader', serif; font-size: 30px; font-weight: 600; line-height: 1.15; font-variant-numeric: tabular-nums; }
.tr-stage-sub { max-width: 100%; font-size: 12.5px; line-height: 1.35; color: var(--slate-light); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }

/* Screens shown inside Pipeline or Growth: their side list becomes a row
   of chips above the content, so the page reads top to bottom. */
.tr-flat .tr-appts-shell { flex-direction: column; align-items: stretch; gap: 14px; }
.tr-flat .tr-appts-sidebar { position: static; flex-direction: row; flex-wrap: wrap; width: auto; max-height: none; overflow: visible; gap: 6px; }
.tr-flat .tr-sidebar-divider, .tr-flat .tr-bizplan-glance { display: none; }
.tr-flat .tr-sidebar-item { flex: 0 0 auto; min-height: 36px; padding: 6px 14px; white-space: nowrap; background: var(--card); border-color: var(--line); border-radius: 999px; font-size: 13.5px; }
.tr-flat .tr-sidebar-item:hover { border-color: var(--line-strong); }
.tr-flat .tr-sidebar-item-active, .tr-flat .tr-sidebar-item-active:hover { background: var(--ink); color: #fff; border-color: var(--ink); }
.tr-flat .tr-sidebar-item-active .tr-mono { background: rgba(255,255,255,0.16); color: #fff; }
.tr-flat .tr-appts-main { width: 100%; }
/* A screen with its own sections inside (Business Plan in Growth): those
   look like a small switch, so they read as a level below. */
.tr-flat .tr-appts-main .tr-appts-sidebar { align-self: flex-start; width: max-content; max-width: 100%; gap: 2px; padding: 3px; border-radius: 9px; background: rgba(19,33,46,0.07); }
.tr-flat .tr-appts-main .tr-sidebar-item { min-height: 32px; padding: 5px 12px; border: none; border-radius: 6px; background: transparent; font-size: 13px; }
.tr-flat .tr-appts-main .tr-sidebar-item-active, .tr-flat .tr-appts-main .tr-sidebar-item-active:hover { background: var(--card); color: var(--ink); box-shadow: 0 1px 3px rgba(19,33,46,0.12); }
.tr-pipeline .tr-flat .tr-h2 { font-size: 22px; }
@media (max-width: 960px) {
  .tr-stages { grid-template-columns: minmax(0, 1fr) repeat(4, 14px minmax(0, 1fr)); }
  .tr-stage-arrow { width: 12px; }
  .tr-stage { padding: 10px; }
  .tr-stage-n { font-size: 26px; }
}
/* Phones: the stages scroll sideways. */
@media (max-width: 640px) {
  .tr-stages { display: flex; overflow-x: auto; margin: 0 -14px; padding: 2px 14px 6px; scrollbar-width: none; }
  .tr-stages::-webkit-scrollbar { display: none; }
  .tr-stage { flex: 0 0 136px; }
  .tr-stage-arrow { flex: 0 0 auto; }
  .tr-stage-n { font-size: 24px; }
  .tr-pipeline .tr-flat .tr-h2 { font-size: 20px; }
  .tr-flat .tr-appts-sidebar { flex-wrap: nowrap; overflow-x: auto; gap: 8px; }
  .tr-flat .tr-sidebar-item { min-height: 40px; }
  .tr-flat .tr-appts-main .tr-appts-sidebar { margin: 0; padding: 3px; gap: 2px; flex-wrap: wrap; overflow: visible; -webkit-mask-image: none; mask-image: none; }
  /* Resources: all three (PDFs, PowerPoints, links) in view, no swiping. */
  .tr-appts-sidebar.tr-docs-tabs { flex-wrap: wrap; overflow: visible; margin: 0; padding: 2px 0 4px; -webkit-mask-image: none; mask-image: none; }
  .tr-flat .tr-appts-main .tr-sidebar-item { min-height: 36px; border: none; font-size: 13px !important; }
  .tr-flat .tr-appts-main .tr-sidebar-item-active, .tr-flat .tr-appts-main .tr-sidebar-item-active:hover { background: var(--card); color: var(--ink); }
}
/* Submitted, not issued */
.tr-pend-item + .tr-pend-item { border-top: 1px solid var(--line); }
.tr-pend-premium { margin-left: 6px; font-size: 13px; color: var(--ink); }
.tr-pend-note { margin-top: 4px; font-size: 12.5px; color: var(--slate); font-style: italic; }
.tr-pend-note span { font-style: normal; color: var(--slate-light); margin-left: 4px; }
.tr-pend-open { padding: 0 16px 14px 36px; }
.tr-pend-open .tr-policy-card { margin: 0; }
.tr-pend-foot { font-size: 12px; color: var(--slate-light); margin: 10px 2px 0; }
.tr-promo-ready-text { display: inline-flex; align-items: center; gap: 3px; font-size: 13.5px; font-weight: 600; color: var(--green); }
.tr-promo-waiting-text { font-size: 13px; font-weight: 600; color: var(--brass-dark); }
.tr-ft-card .tr-titleline { margin: 0 0 8px; }
.tr-ft-card .tr-titleline .tr-h3 { margin: 0; }
/* Team Pace → Field training */
.tr-ft-card { padding: 16px 18px; margin-bottom: 14px; }
.tr-ft-card .tr-h3 { margin: 0 0 8px; }
.tr-ft-list { list-style: none; margin: 0; padding: 0; }
.tr-ft-row { display: flex; align-items: center; gap: 12px; padding: 11px 0; border-top: 1px solid var(--line); }
.tr-ft-row:first-child { border-top: none; }
.tr-ft-main { flex: 1; min-width: 0; font-size: 14px; color: var(--ink); }
.tr-ft-main .tr-type-badge { margin-left: 4px; }
.tr-ft-main .tr-presenting-chip { margin-left: 6px; }
.tr-ft-dots { display: inline-flex; align-items: center; gap: 4px; flex: 0 0 auto; }
.tr-ft-dots > span:not(.tr-ft-dots-n) { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--line-strong); background: var(--card); }
.tr-ft-dots > span.tr-ft-dot-on { border-color: var(--green); background: var(--green); }
.tr-ft-dots-n { margin-left: 6px; font-size: 12.5px; font-weight: 600; color: var(--slate); font-variant-numeric: tabular-nums; white-space: nowrap; }
.tr-ft-assign { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; flex-wrap: wrap; justify-content: flex-end; }
.tr-ft-assign .tr-toolbar-select { height: 34px; min-height: 34px; font-size: 13px; }
.tr-ft-more { margin-top: 8px; }
/* Today → Your paycheck */
.tr-pay .tr-h3 { display: inline-flex; align-items: center; gap: 6px; }
.tr-pay-month { font-size: 11.5px; font-weight: 600; color: var(--slate-light); text-transform: uppercase; letter-spacing: .04em; }
.tr-pay-line { font-size: 13px; color: var(--slate); margin: 6px 0 0; line-height: 1.45; }
.tr-pay .tr-ov-bar { margin-top: 10px; }
.tr-pay-facts { list-style: none; margin: 10px 0 0; padding: 10px 0 0; border-top: 1px solid var(--line); display: grid; gap: 5px; font-size: 12.5px; color: var(--slate); }
.tr-pay-facts:empty { display: none; }
.tr-pay-next { color: var(--brass-dark); font-weight: 600; }
.tr-pay-warn { color: var(--rust); }
.tr-pay-foot { font-size: 11.5px; color: var(--slate-light); margin: 10px 0 0; }
/* Today → Team wins + top 3 */
.tr-wins-wrap { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr); gap: 16px; margin-top: 16px; align-items: start; }
.tr-wins .tr-h3, .tr-top3 .tr-h3 { display: inline-flex; align-items: center; gap: 6px; }
.tr-wins-sub { font-size: 12.5px; color: var(--slate-light); margin: 4px 0 10px; }
.tr-wins-note { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 9px 12px; margin-bottom: 10px; border-radius: var(--radius-sm); background: var(--brass-tint); color: var(--ink); font-size: 13.5px; }
.tr-wins-list { list-style: none; margin: 0; padding: 0; }
.tr-win { display: grid; grid-template-columns: 36px minmax(0, 1fr); column-gap: 12px; align-items: start; padding: 12px 0; border-top: 1px solid var(--line); }
.tr-win:first-child { border-top: none; }
.tr-win-av { position: relative; width: 36px; height: 36px; }
.tr-win-face { width: 36px; height: 36px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: var(--paper-dim); color: var(--slate); font-size: 12.5px; font-weight: 600; object-fit: cover; }
img.tr-win-face { display: block; }
.tr-win-face-trophy { background: var(--brass-tint); color: var(--brass-dark); }
.tr-win-badge { position: absolute; right: -3px; bottom: -3px; width: 17px; height: 17px; border-radius: 50%; border: 2px solid var(--card); display: inline-flex; align-items: center; justify-content: center; color: #fff; background: var(--slate-light); }
.tr-win-badge-sale { background: var(--type-sale); }
.tr-win-badge-first_sale, .tr-win-badge-promotion, .tr-win-badge-pace { background: var(--brass); }
.tr-win-badge-recruit, .tr-win-badge-joined { background: var(--type-recruit); }
.tr-win-badge-licensed, .tr-win-badge-exam, .tr-win-badge-issued { background: var(--green); }
.tr-win-main { min-width: 0; }
.tr-win-text { font-size: 14px; color: var(--ink); line-height: 1.4; padding-top: 1px; }
.tr-win-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-top: 3px; min-height: 20px; font-size: 12px; color: var(--slate-light); }
.tr-win-meta .tr-react { margin-left: auto; }
.tr-win-meta .tr-react-btn { width: 30px; height: 30px; font-size: 14px; }
.tr-win-fresh { animation: tr-win-in 2.4s ease-out; border-radius: 8px; }
@keyframes tr-win-in { from { background: var(--brass-tint); } to { background: transparent; } }
@media (prefers-reduced-motion: reduce) { .tr-win-fresh { animation: none; } }
/* Who reacted: the top reactions stacked, then names. */
.tr-react-sum { display: inline-flex; align-items: center; gap: 6px; padding: 0; border: 0; background: none; font: inherit; font-size: 12px; color: var(--slate); cursor: pointer; }
.tr-react-sum:hover .tr-react-who, .tr-react-sum:focus-visible .tr-react-who { text-decoration: underline; text-underline-offset: 2px; }
.tr-react-stack { display: inline-flex; }
.tr-react-stack > span { width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; line-height: 1; background: var(--paper-dim); box-shadow: 0 0 0 2px var(--card); }
.tr-react-stack > span + span { margin-left: -4px; }
/* One quiet button per win; the six reactions open above it. */
.tr-react { position: relative; align-self: center; }
.tr-react-btn { width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--line); background: var(--card); color: var(--slate-light); display: inline-flex; align-items: center; justify-content: center; font-size: 16px; line-height: 1; cursor: pointer; transition: border-color .15s, color .15s, background .15s; }
.tr-react-btn:hover, .tr-react-btn[aria-expanded="true"] { border-color: var(--brass); color: var(--brass-dark); }
.tr-react-btn-on { background: var(--card); border-color: rgba(196,154,60,0.55); }
.tr-react-tray { position: absolute; right: -4px; bottom: calc(100% + 6px); z-index: 30; display: flex; gap: 2px; padding: 4px; background: var(--card); border: 1px solid var(--line); border-radius: 999px; box-shadow: 0 12px 30px rgba(19,33,46,0.18); transform-origin: 90% 100%; animation: tr-tray-in .14s ease-out; }
.tr-react-tray button { width: 38px; height: 38px; border-radius: 50%; border: 0; background: transparent; font-size: 20px; line-height: 1; cursor: pointer; transition: transform .1s, background .1s; }
.tr-react-tray button:hover, .tr-react-tray button:focus-visible { transform: scale(1.15); background: var(--paper); }
.tr-react-tray .tr-react-on { background: var(--brass-tint); }
@keyframes tr-tray-in { from { opacity: 0; transform: translateY(4px) scale(0.92); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .tr-react-tray { animation: none; } .tr-react-tray button:hover, .tr-react-tray button:focus-visible { transform: none; } }
/* Last week's winners: the one dark card on Today. */
.tr-spot { margin: 12px 0 8px; padding: 5px; border-radius: 14px; background: var(--ink); color: #fff; }
.tr-spot-plate { border: 1px solid rgba(196,154,60,0.42); border-radius: 10px; padding: 14px 14px 6px; }
.tr-spot-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding-bottom: 10px; border-bottom: 1px solid rgba(196,154,60,0.28); }
.tr-spot-head h4 { margin: 0; font-family: 'Newsreader', serif; font-size: 20px; font-weight: 600; letter-spacing: -0.1px; color: #fff; }
.tr-spot-head > span { font-size: 12.5px; color: rgba(255,255,255,0.62); white-space: nowrap; }
.tr-spot-list { list-style: none; margin: 0; padding: 0; }
.tr-spot-list li { display: grid; grid-template-columns: 52px minmax(0, 1fr) auto; align-items: center; column-gap: 10px; padding: 10px 0; border-top: 1px solid rgba(255,255,255,0.07); }
.tr-spot-list li:first-child { border-top: none; }
.tr-spot-faces { display: inline-flex; align-items: center; }
.tr-spot-face { width: 34px; height: 34px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: #2A3E52; color: #fff; font-size: 12px; font-weight: 600; object-fit: cover; box-shadow: 0 0 0 2px var(--ink); flex: none; }
img.tr-spot-face { display: block; }
.tr-spot-tie .tr-spot-face { width: 28px; height: 28px; font-size: 10.5px; }
.tr-spot-face + .tr-spot-face { margin-left: -8px; }
.tr-spot-face-you { box-shadow: 0 0 0 2px var(--ink), 0 0 0 3.5px var(--brass); }
.tr-spot-who { min-width: 0; }
.tr-spot-who strong { display: block; font-size: 14.5px; font-weight: 600; line-height: 1.25; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tr-spot-who > span { display: block; margin-top: 1px; font-size: 12px; color: rgba(255,255,255,0.6); }
.tr-spot-you .tr-spot-who strong { color: #EED493; }
.tr-spot-n { font-family: 'Newsreader', serif; font-size: 30px; line-height: 1; font-weight: 600; color: var(--brass); font-variant-numeric: lining-nums tabular-nums; text-align: right; min-width: 30px; }
.tr-spot-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 2px; padding: 8px 0 4px; border-top: 1px solid rgba(196,154,60,0.28); }
.tr-spot-cheer { font-size: 12.5px; color: rgba(255,255,255,0.62); }
.tr-spot .tr-react-sum { color: rgba(255,255,255,0.85); }
.tr-spot .tr-react-stack > span { background: rgba(255,255,255,0.14); box-shadow: 0 0 0 2px var(--ink); }
.tr-spot .tr-react-btn { background: transparent; border-color: rgba(255,255,255,0.26); color: rgba(255,255,255,0.82); }
.tr-spot .tr-react-btn:hover, .tr-spot .tr-react-btn[aria-expanded="true"] { border-color: var(--brass); color: var(--brass); }
.tr-spot .tr-react-btn-on { background: rgba(196,154,60,0.24); border-color: var(--brass); }
.tr-reactors-modal { max-width: 380px; }
.tr-reactors-win { margin: 6px 0 10px; font-size: 13.5px; color: var(--slate); line-height: 1.4; }
.tr-reactors-list { list-style: none; margin: 0; padding: 0; max-height: 50vh; overflow-y: auto; }
.tr-reactors-list li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid var(--line); font-size: 14px; color: var(--ink); }
.tr-reactors-emoji { font-size: 16px; letter-spacing: 2px; white-space: nowrap; }
.tr-wins-more { margin-top: 6px; }
.tr-top3-group { padding: 10px 0; border-top: 1px solid var(--line); }
.tr-top3-group:first-of-type { border-top: none; padding-top: 4px; }
.tr-top3-tabs { display: flex; width: 100%; margin: 10px 0 4px; }
.tr-top3-tabs button { flex: 1; }
.tr-wins-compact .tr-top3-tabs + .tr-top3-group { border-top: none; padding-top: 6px; }
.tr-top3-label { font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--slate-light); margin-bottom: 6px; }
.tr-top3-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.tr-top3-list li { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: var(--radius-sm); font-size: 14px; color: var(--ink); }
.tr-top3-you { background: var(--brass-tint); }
.tr-top3-rank { width: 18px; font-family: 'Newsreader', serif; font-size: 19px; line-height: 1; font-weight: 600; color: var(--brass-dark); font-variant-numeric: lining-nums tabular-nums; text-align: center; }
.tr-top3-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tr-top3-name .tr-org-you { margin-left: 6px; }
.tr-top3-n { font-weight: 700; font-variant-numeric: tabular-nums; }
.tr-top3-empty { font-size: 12.5px; color: var(--slate-light); margin: 0; }
@media (max-width: 860px) { .tr-wins-wrap { grid-template-columns: minmax(0, 1fr); } }
/* Today → the four tiles */
.tr-tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
.tr-tile { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 12px 14px; border-radius: var(--radius); border: 1px solid var(--line); background: var(--card); font-family: inherit; text-align: left; cursor: pointer; transition: border-color .15s, box-shadow .15s; min-width: 0; }
.tr-tile:hover { border-color: var(--line-strong); }
.tr-tile-on { border-color: var(--brass); box-shadow: var(--ring); }
.tr-tile-label { display: flex; align-items: center; gap: 6px; width: 100%; font-size: 12px; font-weight: 600; color: var(--slate-light); }
.tr-tile-chev { margin-left: auto; color: var(--line-strong); display: inline-flex; }
.tr-tile-value { font-family: 'Newsreader', serif; font-size: 30px; font-weight: 600; line-height: 1.15; color: var(--ink); }
.tr-tile-green { color: var(--green); }
.tr-tile-amber { color: #94600F; }
.tr-tile-rust { color: var(--rust); }
.tr-tile-sub { font-size: 12px; color: var(--slate-light); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tr-tile-detail { position: relative; margin-top: 12px; }
.tr-tile-detail > .tr-card { margin: 0; }
.tr-tile-close { position: absolute; top: 10px; right: 10px; }
.tr-tile-detail .tr-row-head { padding-right: 34px; }
/* Today → Do next */
.tr-task-actions { display: flex; flex-direction: row-reverse; align-items: center; gap: 12px; align-self: center; }
.tr-task-hide { margin-top: 0; font-size: 12px; font-weight: 500; color: var(--slate-light); text-decoration: none; align-self: center; }
.tr-task-hide:hover { color: var(--ink); text-decoration: underline; }
.tr-today-plan .tr-plan-sub { margin: 0; text-align: right; }
.tr-wins-scope { font-size: 12.5px; color: var(--slate-light); white-space: nowrap; }
.tr-wins-seeall { align-self: center; margin-top: 0; font-size: 13px; }
.tr-top3-face { width: 26px; height: 26px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex: none; background: var(--paper-dim); color: var(--slate); font-size: 10.5px; font-weight: 600; object-fit: cover; }
img.tr-top3-face { display: block; }
.tr-wins-compact .tr-wins-list { margin-top: 8px; }
.tr-wins-compact .tr-top3 > .tr-row-head { margin-bottom: 6px; }
.tr-wins-compact .tr-top3 > .tr-row-head + .tr-top3-group { border-top: none; padding-top: 4px; }
.tr-folds { display: grid; gap: 8px; }
.tr-fold { border-radius: var(--radius-sm); background: var(--paper); }
.tr-fold-head { display: flex; align-items: center; gap: 12px; width: 100%; padding: 11px 12px; border: none; background: none; font-family: inherit; text-align: left; cursor: pointer; color: var(--slate-light); }
.tr-fold-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.tr-fold-text strong { font-size: 13.5px; color: var(--ink); font-weight: 600; }
.tr-fold-text span { font-size: 12px; color: var(--slate-light); }
.tr-fold-body { padding: 0 12px 10px; }
.tr-fold-week { margin-top: 8px; }
/* Today → wins in the side column */
.tr-wins-compact { grid-template-columns: minmax(0, 1fr); margin-top: 0; gap: 16px; }
.tr-wins-compact .tr-wins-sub { margin-bottom: 6px; }
@media (max-width: 760px) {
  .tr-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .tr-tile { padding: 10px 12px; }
  .tr-tile-value { font-size: 24px; }
  .tr-tile-label { font-size: 12px; }
  /* Up to two lines on a phone instead of "10 to catc…". */
  .tr-tile-sub { font-size: 12px; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .tr-task-actions { flex-direction: column; align-items: flex-end; gap: 4px; }
}
@media (max-width: 640px) {
  .tr-ft-row { flex-wrap: wrap; }
  .tr-ft-main { flex: 1 1 calc(100% - 40px); }
  .tr-ft-assign { max-width: none; justify-content: flex-start; flex: 1 1 100%; min-width: 0; }
  .tr-ft-assign .tr-toolbar-select { flex: 0 1 auto; min-width: 0; }
  .tr-rec-row { flex-wrap: wrap; padding: 12px 14px; column-gap: 10px; }
  .tr-rec-main { flex: 1 1 calc(100% - 60px); }
  .tr-rec-actions { margin-left: 18px; }
  .tr-rec-stage { min-width: 84px; padding: 8px 10px; }
  .tr-rec-arrow { display: none; }
}

/* Chat ---------------------------------------------------------------------- */
.tr-header-chat { position: relative; width: 36px; height: 36px; }
.tr-header .tr-header-chat-on { background: rgba(255,255,255,0.14); color: #fff; }
.tr-header-chat-badge { position: absolute; top: -3px; right: -5px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: var(--brass); color: var(--ink); font-size: 11px; font-weight: 700; line-height: 18px; text-align: center; box-shadow: 0 0 0 2px var(--ink); }
.tr-header-chat-badge-hot { background: #C94A32; color: #fff; }
.tr-main:has(.tr-chat) { padding-bottom: 16px; }
.tr-chat { display: grid; grid-template-columns: 232px minmax(0, 1fr); min-height: 360px; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
.tr-chat-loading, .tr-chat-gate { display: flex; justify-content: center; }
.tr-chat-side { display: flex; flex-direction: column; gap: 2px; padding: 16px 10px; background: var(--paper); border-right: 1px solid var(--line); min-height: 0; overflow-y: auto; }
.tr-chat-side-title { font-family: 'Newsreader', serif; font-size: 22px; font-weight: 600; color: var(--ink); padding: 0 10px 10px; }
.tr-chat-chan { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 40px; padding: 8px 10px; border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent; font-family: inherit; font-size: 14.5px; font-weight: 500; color: var(--slate); text-align: left; cursor: pointer; }
.tr-chat-chan:hover { background: rgba(19,33,46,0.05); color: var(--ink); }
.tr-chat-chan-on, .tr-chat-chan-on:hover { background: var(--card); border-color: var(--line); color: var(--ink); font-weight: 600; box-shadow: 0 1px 2px rgba(19,33,46,0.05); }
.tr-chat-chan-unread { color: var(--ink); font-weight: 700; }
.tr-chat-chan svg { flex-shrink: 0; color: var(--slate-light); }
.tr-chat-chan-on svg { color: var(--brass-dark); }
.tr-chat-chan-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.tr-chat-chan-about { font-size: 12.5px; font-weight: 400; color: var(--slate-light); white-space: normal; }
.tr-chat-count { min-width: 22px; padding: 1px 7px; border-radius: 999px; background: var(--brass); color: var(--ink); font-size: 12px; font-weight: 700; text-align: center; }
.tr-chat-count-hot { background: #C94A32; color: #fff; }
.tr-chat-side-foot { margin-top: auto; display: flex; flex-direction: column; gap: 10px; padding: 16px 10px 2px; }
.tr-chat-side-foot .tr-link-btn { margin: 0; color: var(--slate); }
.tr-chat-main { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.tr-chat-head { display: flex; align-items: center; gap: 10px; padding: 14px 20px; border-bottom: 1px solid var(--line); }
.tr-chat-title { display: flex; align-items: center; gap: 7px; margin: 0; font-family: 'Newsreader', serif; font-size: 21px; font-weight: 600; color: var(--ink); }
.tr-chat-about { margin: 1px 0 0; font-size: 13px; color: var(--slate-light); }
.tr-chat-main-urgent .tr-chat-head { background: #FCF1EE; border-bottom-color: #F1D5CD; }
.tr-chat-main-urgent .tr-chat-title svg { color: #C2462E; }
.tr-chat-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 12px 12px; overscroll-behavior: contain; }
.tr-chat-earlier { display: block; margin: 8px auto; }
.tr-chat-day { position: relative; display: flex; justify-content: center; margin: 14px 0 6px; }
.tr-chat-day::before { content: ''; position: absolute; left: 8px; right: 8px; top: 50%; border-top: 1px solid var(--line); }
.tr-chat-day span { position: relative; padding: 2px 10px; border: 1px solid var(--line); border-radius: 999px; background: var(--card); font-size: 12px; font-weight: 600; color: var(--slate); }
.tr-chat-msg { position: relative; display: flex; align-items: flex-start; gap: 10px; padding: 2px 40px 2px 8px; border-radius: var(--radius-sm); }
.tr-chat-msg-first { margin-top: 10px; }
.tr-chat-msg:hover { background: var(--paper); }
.tr-chat-avatar { flex-shrink: 0; width: 36px; height: 36px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: 13px; font-weight: 700; letter-spacing: .3px; margin-top: 2px; }
.tr-chat-gutter { flex-shrink: 0; width: 36px; display: flex; justify-content: center; padding-top: 3px; }
.tr-chat-gutter time { font-size: 10.5px; color: var(--slate-light); opacity: 0; }
.tr-chat-msg:hover .tr-chat-gutter time { opacity: 1; }
.tr-chat-msg-main { flex: 1; min-width: 0; }
.tr-chat-meta { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 8px; font-size: 14px; color: var(--ink); }
.tr-chat-meta time { font-size: 12px; color: var(--slate-light); }
.tr-chat-tag { padding: 0 6px; border-radius: 4px; background: var(--brass-tint); color: var(--brass-dark); font-size: 11px; font-weight: 700; line-height: 17px; }
.tr-chat-text { margin: 1px 0 0; font-size: 14.5px; line-height: 1.5; color: var(--ink-2, var(--ink)); white-space: pre-wrap; overflow-wrap: anywhere; }
.tr-chat-text a { color: #24548A; }
.tr-chat-removed { font-style: italic; color: var(--slate-light); }
.tr-chat-actions { position: absolute; top: 2px; right: 6px; opacity: 0; transition: opacity .12s; }
.tr-chat-msg:hover .tr-chat-actions, .tr-chat-actions:focus-within { opacity: 1; }
@media (hover: none) { .tr-chat-actions { opacity: 1; } .tr-chat-actions .tr-icon-btn { color: var(--line-strong); } .tr-chat-gutter time { opacity: 0; } }
.tr-chat-empty { margin: 48px auto; max-width: 340px; text-align: center; color: var(--slate); font-size: 14px; }
.tr-chat-empty p { margin: 4px 0; }
.tr-chat-newpill { position: absolute; left: 50%; bottom: 92px; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border: none; border-radius: 999px; background: var(--ink); color: #fff; font-family: inherit; font-size: 13px; font-weight: 600; box-shadow: 0 6px 18px rgba(19,33,46,0.25); cursor: pointer; z-index: 2; }
.tr-chat-compose { display: flex; flex-direction: column; gap: 6px; padding: 10px 14px 14px; border-top: 1px solid var(--line); background: var(--card); }
.tr-chat-compose-row { display: flex; align-items: flex-end; gap: 8px; }
.tr-chat-compose textarea { flex: 1; min-width: 0; min-height: 42px; max-height: 140px; resize: none; padding: 10px 12px; border: 1px solid var(--line-strong); border-radius: 10px; font-family: inherit; font-size: 15px; line-height: 1.4; color: var(--ink); background: var(--card); }
.tr-chat-compose textarea:focus { border-color: var(--brass); box-shadow: var(--ring); outline: none; }
.tr-chat-send { min-height: 42px; gap: 6px; }
.tr-chat-urgent-note, .tr-chat-notice, .tr-chat-senderr { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 13px; }
.tr-chat-urgent-note { color: #A63B26; font-weight: 600; }
.tr-chat-notice { color: var(--green); font-weight: 600; }
.tr-chat-senderr { color: var(--rust); font-weight: 600; }
.tr-chat-left { align-self: flex-end; font-size: 12px; color: var(--slate-light); }
.tr-chat-rules { max-width: 560px; }
.tr-chat-rules .tr-h2 { margin: 6px 0 8px; }
.tr-chat-rules p, .tr-chat-rules li { font-size: 14.5px; line-height: 1.5; color: var(--ink); }
.tr-chat-rules ul { margin: 0 0 12px; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; }
.tr-chat-rules-icon { display: inline-flex; width: 42px; height: 42px; align-items: center; justify-content: center; border-radius: 50%; background: var(--brass-tint); color: var(--brass-dark); }
.tr-chat-rules-zero { padding: 10px 12px; border-radius: var(--radius-sm); background: var(--paper); font-size: 13.5px !important; color: var(--slate) !important; }
.tr-chat-rules .tr-btn { margin-top: 6px; }
.tr-chat-dialog-p { margin: 10px 0; font-size: 14px; line-height: 1.5; color: var(--ink); }
.tr-chat-dialog-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.tr-chat-quote { margin: 12px 0; padding: 10px 12px; border-left: 3px solid var(--brass); border-radius: 6px; background: var(--paper); font-size: 14px; line-height: 1.5; color: var(--ink); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 160px; overflow-y: auto; }
.tr-chat-reasons { margin: 0 0 12px; padding: 0; border: none; display: flex; flex-direction: column; gap: 4px; }
.tr-chat-reasons legend { margin-bottom: 6px; font-size: 13px; font-weight: 600; color: var(--ink); }
.tr-chat-reasons label { display: flex; align-items: center; gap: 8px; min-height: 34px; font-size: 14px; color: var(--ink); cursor: pointer; }
.tr-chat-blocked { list-style: none; margin: 0; padding: 0; }
.tr-chat-blocked li { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid var(--line); font-size: 14px; }
.tr-chat-reports { display: flex; flex-direction: column; gap: 12px; padding: 8px 6px; }
.tr-chat-report { padding: 16px 18px; }
.tr-chat-report-meta { font-size: 13.5px; color: var(--slate); }
.tr-chat-report-meta strong { color: var(--ink); }
.tr-chat-report-why { margin: 0; padding-left: 18px; font-size: 13.5px; color: var(--slate); }
.tr-chat-report-foot { margin: 0; font-size: 12.5px; color: var(--slate-light); }
@media (max-width: 760px) { .tr-chat { grid-template-columns: 196px minmax(0, 1fr); } }
@media (max-width: 640px) {
  .tr-main:has(.tr-chat) { padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }
  .tr-chat { display: flex; flex-direction: column; margin: -4px -6px 0; border-radius: 12px; }
  .tr-chat-side { flex: 1; padding: 14px 8px; border-right: none; background: var(--card); }
  .tr-chat-chan { align-items: flex-start; min-height: 60px; padding: 10px; border-color: var(--line); background: var(--card); }
  .tr-chat-chan + .tr-chat-chan { margin-top: 6px; }
  .tr-chat-chan svg { margin-top: 2px; }
  .tr-chat-chan-on, .tr-chat-chan-on:hover { box-shadow: none; }
  .tr-chat-main { flex: 1; }
  .tr-chat-head { padding: 10px 12px; }
  .tr-chat-head .tr-icon-btn { margin-left: -4px; flex-shrink: 0; }
  .tr-chat-scroll { padding: 4px 6px 10px; }
  .tr-chat-msg { padding: 2px 34px 2px 4px; gap: 8px; }
  .tr-chat-avatar { width: 32px; height: 32px; font-size: 12px; }
  .tr-chat-gutter { width: 32px; }
  .tr-chat-compose { padding: 8px 10px 10px; }
  .tr-chat-compose textarea { font-size: 16px; }
  .tr-chat-send { width: 44px; padding: 0; justify-content: center; }
  .tr-header-chat { width: 34px; height: 34px; }
  /* Room for the chat button: your role is in Your account. */
  .tr-header-role { display: none; }
  .tr-header-user { gap: 8px; }
}

/* ---- Prospects: history, possible matches, phone in quick add ---------- */
.tr-prospect-history { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--line); }
.tr-prospect-history-label { font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--slate-light); margin-bottom: 6px; }
.tr-prospect-history ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.tr-prospect-history li { display: flex; align-items: baseline; gap: 9px; font-size: 13px; color: var(--slate); }
.tr-prospect-history li em { font-style: normal; color: var(--slate-light); }
.tr-ph-dot { flex-shrink: 0; width: 8px; height: 8px; border-radius: 50%; background: var(--line-strong); transform: translateY(-1px); }
.tr-ph-good .tr-ph-dot { background: var(--green); }
.tr-ph-good em { color: var(--green) !important; font-weight: 600; }
.tr-prospect-maybe { margin-top: 12px; padding: 10px 12px; border: 1px dashed var(--line-strong); border-radius: var(--radius-sm); background: var(--paper); }
.tr-prospect-maybe-title { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--ink); margin-bottom: 6px; }
.tr-prospect-maybe-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; font-size: 13px; color: var(--slate); padding: 4px 0; }
.tr-prospect-maybe-row + .tr-prospect-maybe-row { border-top: 1px solid var(--line); padding-top: 8px; }
.tr-prospect-maybe-actions { display: inline-flex; align-items: center; gap: 12px; }
.tr-prospect-maybe-actions .tr-link-btn { margin-top: 0; }
.tr-quickadd input.tr-quickadd-phone { flex: 0.8; }
@media (max-width: 640px) { .tr-quickadd input.tr-quickadd-phone { flex: 1 1 100%; } }

/* ---- Appointment rows: Zoom, Call and Text -------------------------------- */
.tr-appt-links { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-top: 4px; }
.tr-appt-contact { display: inline-flex; align-items: center; gap: 6px; }
.tr-dayagenda-acts { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; }

/* ---- Appointment form: pick the client from your list ---------------------- */
.tr-combo { position: relative; }
.tr-combo-menu { position: absolute; z-index: 30; top: calc(100% + 4px); left: 0; right: 0; list-style: none; margin: 0; padding: 4px; background: var(--card); border: 1px solid var(--line-strong); border-radius: var(--radius-sm); box-shadow: 0 10px 28px rgba(20,32,44,0.16); max-height: 330px; overflow-y: auto; }
.tr-combo-opt { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 6px; cursor: pointer; font-weight: 400; }
.tr-combo-opt:hover, .tr-combo-opt-on { background: var(--brass-tint); }
.tr-combo-add { border-top: 1px solid var(--line); margin-top: 2px; }
.tr-combo-add:first-child { border-top: none; margin-top: 0; }
.tr-combo-avatar { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; background: #2D68A8; color: #fff; font-size: 11.5px; font-weight: 700; letter-spacing: 0.02em; }
.tr-combo-avatar-add { background: var(--brass-tint); color: var(--brass-dark); }
.tr-combo-text { display: flex; flex-direction: column; min-width: 0; }
.tr-combo-text strong { font-size: 14px; font-weight: 600; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tr-combo-text span { font-size: 12.5px; color: var(--slate-light); }
.tr-combo-add .tr-combo-text strong { color: var(--brass-dark); }
.tr-combo-linked { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; padding: 7px 10px; border-radius: var(--radius-sm); background: rgba(46,125,91,0.08); color: #24654A; font-size: 13px; font-weight: 400; }
.tr-combo-linked strong { font-weight: 600; }
.tr-combo-linked .tr-link-btn { margin-top: 0; margin-left: auto; }
.tr-combo-linked-new { background: var(--brass-tint); color: var(--brass-dark); }
/* In the phone sheet the list sits in the page, so the keyboard never hides it. */
.tr-fsheet-body .tr-combo-menu { position: static; margin-top: 2px; box-shadow: none; max-height: none; }

/* ---- Presenters logging what they presented ------------------------------ */
.tr-sidebar-item-blue { --dot: #2D68A8; }
.tr-presented-tag { display: inline-flex; align-items: center; gap: 4px; margin-left: 8px; padding: 1px 8px; border-radius: 999px; background: rgba(45,104,168,0.1); color: #24548A; font-size: 11.5px; font-weight: 600; white-space: nowrap; vertical-align: 1px; }
.tr-fu-head-static { cursor: default; }
.tr-fu-head-static:hover { background: transparent; }
.tr-fu-setby { font-weight: 600; color: var(--slate); }
.tr-fu-logged { display: inline-flex; align-items: center; gap: 5px; margin-top: 5px; padding: 2px 9px; border-radius: 999px; background: rgba(46,125,91,0.09); color: #24654A; font-size: 12.5px; font-weight: 600; }
/* ---- Profile photos ------------------------------------------------------ */
.tr-avatar-img { object-fit: cover; background: var(--paper-dim); }
.tr-header-avatar { width: 26px; height: 26px; flex-shrink: 0; border-radius: 50%; object-fit: cover; background: rgba(255,255,255,0.15); box-shadow: 0 0 0 1.5px rgba(255,255,255,0.55); }
.tr-photo { display: flex; flex-direction: column; gap: 12px; margin: 14px 0 0; padding: 14px; border-radius: var(--radius-sm); border: 1px solid var(--line); background: var(--paper); }
.tr-photo-head { display: flex; align-items: flex-start; gap: 14px; }
.tr-photo-current { flex-shrink: 0; width: 64px; height: 64px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: var(--ink); color: #fff; font-size: 20px; font-weight: 700; letter-spacing: .02em; }
img.tr-photo-current { box-shadow: 0 0 0 1px var(--line); }
.tr-photo-main { flex: 1; min-width: 0; }
.tr-photo-title { font-size: 14px; font-weight: 600; color: var(--ink); }
.tr-photo-sub { margin: 2px 0 0; font-size: 12.5px; line-height: 1.45; color: var(--slate-light); }
.tr-photo-web a { color: var(--brass-dark); font-weight: 600; }
.tr-photo-actions { display: flex; align-items: center; gap: 14px; margin-top: 10px; }
.tr-photo-actions .tr-link-btn { margin-top: 0; align-self: center; }
.tr-photo-pick { position: relative; cursor: pointer; }
.tr-photo-pick:focus-within { box-shadow: var(--ring); }
.tr-photo-pick-off { opacity: .6; pointer-events: none; }
.tr-photo-done { font-size: 13px; font-weight: 600; color: var(--green); }
.tr-photo-tips { padding-top: 10px; border-top: 1px solid var(--line); font-size: 13px; color: var(--slate); }
.tr-photo-tips strong { display: block; margin-bottom: 4px; color: var(--ink); }
.tr-photo-tips ul { display: flex; flex-direction: column; gap: 2px; margin: 0 0 8px; padding-left: 18px; }
.tr-photo-files { font-size: 12.5px; line-height: 1.45; color: var(--slate-light); }
.tr-photo-editing { align-items: center; text-align: center; }
.tr-photo-editing .tr-form-actions, .tr-photo-editing .tr-error { align-self: stretch; text-align: left; }
.tr-photo-stage { position: relative; overflow: hidden; border-radius: var(--radius-sm); background: #10202F; cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; }
.tr-photo-stage:active { cursor: grabbing; }
.tr-photo-stage:focus-visible { outline: none; box-shadow: var(--ring); }
.tr-photo-stage img { position: absolute; left: 0; top: 0; max-width: none; pointer-events: none; -webkit-user-drag: none; }
.tr-photo-ring { position: absolute; inset: 0; border-radius: 50%; border: 2px solid rgba(255,255,255,0.85); box-shadow: 0 0 0 200px rgba(16,32,47,0.6); pointer-events: none; }
.tr-photo-zoom { display: flex; align-items: center; gap: 8px; width: 100%; max-width: 280px; }
.tr-photo-zoom input[type="range"] { flex: 1; accent-color: var(--brass); }
.tr-photo-hint { margin: 0; font-size: 12.5px; color: var(--slate-light); }
.tr-photo-warn { margin: 0; padding: 6px 10px; border-radius: var(--radius-sm); background: rgba(194,124,30,0.1); font-size: 12.5px; color: #8A5410; }
/* ---- Team & admin → Profiles (super admins) --------------------------------- */
.tr-pf { display: flex; flex-direction: column; gap: 12px; }
.tr-pf-light { color: var(--slate-light); font-weight: 400; font-style: normal; }
.tr-pf-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.tr-pf-tabs { display: inline-flex; gap: 2px; padding: 3px; border-radius: 10px; background: var(--paper-dim); margin-right: auto; }
.tr-pf-tabs button { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border: none; border-radius: 8px; background: transparent; font-family: inherit; font-size: 13.5px; font-weight: 500; color: var(--slate); cursor: pointer; }
.tr-pf-tabs button i { font-style: normal; font-size: 11.5px; font-weight: 700; color: var(--slate-light); }
.tr-pf-tabs .tr-pf-tab-on { background: var(--card); color: var(--ink); font-weight: 600; box-shadow: 0 1px 3px rgba(19,33,46,0.12); }
.tr-pf-search { flex: 0 1 300px; margin: 0; }
.tr-pf-sort { display: inline-flex; align-items: center; gap: 6px; padding: 0 4px 0 10px; height: 42px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--card); color: var(--slate); }
.tr-pf-sort select { border: none; background: transparent; font-family: inherit; font-size: 13px; color: var(--ink); height: 40px; cursor: pointer; }
.tr-pf-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.tr-pf-chip { display: inline-flex; align-items: center; gap: 5px; padding: 5px 11px; border-radius: 999px; border: 1px solid var(--line); background: var(--card); font-family: inherit; font-size: 12.5px; font-weight: 500; color: var(--slate); cursor: pointer; white-space: nowrap; }
.tr-pf-chip i { font-style: normal; font-size: 11px; font-weight: 700; padding: 0 6px; border-radius: 999px; background: var(--paper-dim); }
.tr-pf-chip-red { color: #9B3A26; }
.tr-pf-chip-amber { color: #8A5410; }
.tr-pf-chip-on { background: var(--ink); border-color: var(--ink); color: #fff; }
.tr-pf-chip-on i { background: rgba(255,255,255,0.12); }
.tr-pf-chip-amber.tr-pf-chip-on { background: #8A5410; border-color: #8A5410; }
.tr-pf-chip-red.tr-pf-chip-on { background: #9B3A26; border-color: #9B3A26; }
.tr-pf-list { overflow: hidden; padding: 0; }
.tr-pf-row { display: grid; grid-template-columns: 22px minmax(0, 1.35fr) minmax(0, 0.95fr) minmax(0, 1.4fr) 168px 16px; align-items: center; gap: 12px; width: 100%; padding: 11px 14px; border: none; border-top: 1px solid var(--line); background: transparent; font-family: inherit; font-size: 13.5px; color: var(--ink); text-align: left; cursor: pointer; transition: background .12s; }
.tr-pf-row:hover { background: var(--paper); }
.tr-pf-row:focus-visible { outline-offset: -2px; }
.tr-pf-row-head { cursor: default; border-top: none; background: var(--paper); font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--slate-light); padding-top: 9px; padding-bottom: 9px; }
.tr-pf-row-head:hover { background: var(--paper); }
.tr-pf-row-flag { background: rgba(176,67,47,0.045); box-shadow: inset 3px 0 0 #B0432F; }
.tr-pf-row-flag:hover { background: rgba(176,67,47,0.08); }
.tr-pf-row-flagicon { display: inline-flex; color: #B0432F; }
.tr-pf-row-name { min-width: 0; display: flex; flex-direction: column; }
.tr-pf-row-name strong { font-weight: 600; }
.tr-pf-row-title { display: block; }
.tr-pf-row-person { flex-direction: row; align-items: center; gap: 10px; }
.tr-pf-row-person > span:last-child { display: flex; flex-direction: column; min-width: 0; }
.tr-pf-row-sub { display: block; margin-top: 1px; font-size: 12px; color: var(--slate-light); }
.tr-pf-row-reason { display: flex; align-items: center; gap: 4px; margin-top: 3px; font-size: 11.5px; font-weight: 600; color: #9B3A26; }
.tr-pf-row-prog { display: flex; flex-wrap: wrap; align-items: center; gap: 3px 8px; min-width: 0; }
.tr-pf-row-count { font-size: 11.5px; color: var(--slate-light); white-space: nowrap; }
.tr-pf-row-now { font-size: 13px; line-height: 1.35; min-width: 0; }
.tr-pf-phase-name { font-weight: 600; color: var(--brass-dark); }
.tr-pf-row-chev { color: #9AA6B2; }
.tr-pf-ok { font-weight: 600; color: #23654A; }
.tr-pf-none { padding: 18px 16px; margin: 0; }
.tr-pf-foot { margin: 0; font-size: 12.5px; color: var(--slate-light); }
.tr-pf-segs { display: inline-flex; gap: 5px; flex-shrink: 0; }
.tr-pf-seg-group { display: inline-flex; gap: 2px; }
.tr-pf-segs i { width: 11px; height: 8px; border-radius: 2px; background: var(--paper-dim); border: 1px solid var(--line-strong); }
.tr-pf-segs i.tr-pf-seg-done { background: var(--green); border-color: var(--green); }
.tr-pf-segs i.tr-pf-seg-now { background: var(--brass); border-color: var(--brass); }
.tr-pf-segs-flag i.tr-pf-seg-now { background: #B0432F; border-color: #B0432F; }
.tr-pf-dots { display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0; }
.tr-pf-dot-wrap { display: inline-flex; align-items: center; }
.tr-pf-dots i { width: 9px; height: 9px; border-radius: 50%; background: var(--paper-dim); border: 1px solid var(--line-strong); }
.tr-pf-dots i.tr-pf-dot-done { background: var(--green); border-color: var(--green); }
.tr-pf-dots i.tr-pf-dot-now { background: var(--brass); border-color: var(--brass); }
.tr-pf-dots b { width: 6px; }
.tr-pf-lag { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--slate-light); white-space: nowrap; }
.tr-pf-lag-stalled { padding: 3px 9px; border-radius: 999px; background: rgba(194,124,30,0.13); color: #8A5410; font-weight: 600; }
.tr-pf-lag-done { color: #23654A; font-weight: 600; }
.tr-pf-avatar { flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: #2D68A8; color: #fff; font-size: 11.5px; font-weight: 700; }
.tr-pf-avatar-lg { width: 54px; height: 54px; font-size: 17px; }
.tr-pf-entity-tag { display: inline-flex; align-items: center; gap: 4px; margin-left: 6px; padding: 0 7px; border-radius: 999px; background: rgba(107,81,160,0.1); color: var(--violet-dark); font-size: 11px; font-weight: 600; vertical-align: 1px; }
/* a profile */
.tr-pf-detail { display: flex; flex-direction: column; gap: 12px; }
.tr-pf-back { align-self: flex-start; display: inline-flex; align-items: center; gap: 3px; padding: 4px 6px 4px 0; border: none; background: none; font-family: inherit; font-size: 13.5px; font-weight: 600; color: var(--brass-dark); cursor: pointer; }
.tr-pf-detail-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 10px 16px; }
.tr-pf-detail-title { min-width: 0; }
.tr-pf-detail-title .tr-h2 { margin: 0; }
.tr-pf-detail-sub { margin: 3px 0 0; font-size: 13px; color: var(--slate-light); }
.tr-pf-detail-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.tr-pf-who { display: flex; align-items: center; gap: 12px; min-width: 0; }
.tr-pf-btn-flagged { border: 1px solid rgba(176,67,47,0.45); background: rgba(176,67,47,0.06); color: #9B3A26; }
.tr-pf-flagbar { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid rgba(176,67,47,0.3); border-radius: 10px; background: rgba(176,67,47,0.07); font-size: 13px; color: #7E2F1F; }
.tr-pf-flagbar > div { flex: 1; min-width: 0; }
.tr-pf-flagbar .tr-link-btn { margin-top: 0; align-self: center; color: #9B3A26; }
.tr-pf-archived-tag { margin-left: 8px; padding: 1px 8px; border-radius: 999px; background: var(--paper-dim); font-size: 11.5px; font-weight: 600; color: var(--slate); }
.tr-pf-inline-link { margin-top: 0 !important; font-size: inherit; font-weight: 600; text-decoration: none; }
.tr-pf-two { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 14px; align-items: start; }
.tr-pf-side { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.tr-pf-checklist { padding: 14px 16px; }
.tr-pf-checklist-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-bottom: 6px; font-size: 12.5px; }
.tr-pf-box { padding: 14px 16px; }
.tr-pf-box-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.tr-pf-box-head .tr-pf-box-title { margin: 0; }
.tr-pf-box-title { margin: 0 0 8px; font-size: 14.5px; font-weight: 700; color: var(--ink); }
.tr-pf-checklist-head .tr-pf-box-title { margin: 0; }
.tr-pf-phase { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--line); }
.tr-pf-phase-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; font-size: 13.5px; color: var(--ink); }
.tr-pf-phase-label { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--slate-light); }
.tr-pf-phase-count { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--slate-light); }
.tr-pf-phase-done { color: #23654A; font-weight: 600; }
.tr-pf-step { padding: 8px 0; }
.tr-pf-step-now { margin: 2px -10px; padding: 9px 10px; border: 1px solid rgba(196,154,60,0.38); border-radius: 10px; background: rgba(196,154,60,0.07); }
.tr-pf-step-head { display: flex; align-items: flex-start; gap: 8px; }
.tr-pf-step-icon { display: inline-flex; flex-shrink: 0; margin-top: 1px; color: #B6C0CA; }
.tr-pf-step-done .tr-pf-step-icon, .tr-pf-lic-done .tr-pf-step-icon { color: var(--green); }
.tr-pf-step-now .tr-pf-step-icon, .tr-pf-lic-now .tr-pf-step-icon { color: var(--brass); }
.tr-pf-step-num { width: 14px; flex-shrink: 0; margin-top: 2px; font-size: 11.5px; font-weight: 700; color: var(--slate-light); }
.tr-pf-step-title { flex: 1; min-width: 0; }
.tr-pf-step-title strong { display: block; font-size: 13.5px; font-weight: 600; color: var(--ink); }
.tr-pf-step-done .tr-pf-step-title strong { color: var(--slate); }
.tr-pf-step-title span { display: block; margin-top: 1px; font-size: 12px; color: var(--slate-light); line-height: 1.4; }
.tr-pf-step-side { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 6px; flex-shrink: 0; }
.tr-pf-done-on, .tr-pf-uploading { font-size: 12px; color: var(--slate-light); }
.tr-pf-step-upload { width: 28px; height: 28px; }
.tr-pf-item .tr-btn-xs { margin-left: 4px; }
.tr-pf-items { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 6px 0 0 44px; }
.tr-pf-item { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 2px 6px; }
.tr-pf-check { display: inline-flex; align-items: center; gap: 6px; padding: 3px 0; border: none; background: none; font-family: inherit; font-size: 13px; color: var(--slate); cursor: pointer; text-align: left; }
.tr-pf-check svg { flex-shrink: 0; color: #9AA6B2; }
.tr-pf-item-on .tr-pf-check { color: var(--ink); }
.tr-pf-item-on .tr-pf-check svg { color: var(--green); }
.tr-pf-check:disabled { opacity: .6; cursor: default; }
.tr-pf-item-date { padding: 1px 4px; border: none; border-radius: 4px; background: none; font-family: inherit; font-size: 11.5px; color: var(--slate-light); cursor: pointer; }
.tr-pf-item-date:hover { background: var(--paper-dim); color: var(--ink); }
.tr-pf-item-dateinput { font-family: inherit; font-size: 12px; padding: 2px 6px; border: 1px solid var(--line-strong); border-radius: 6px; }
.tr-pf-step-extra { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 0 44px; }
.tr-pf-field { padding: 1px 8px; border-radius: 6px; background: var(--paper-dim); font-size: 12px; color: var(--slate); }
.tr-pf-field strong { color: var(--ink); font-weight: 600; }
.tr-pf-field-add { margin-top: 0 !important; font-size: 12px; }
.tr-pf-doc-chip { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px; border: none; border-radius: 6px; background: rgba(45,104,168,0.09); font-family: inherit; font-size: 12px; font-weight: 600; color: #24548A; cursor: pointer; }
.tr-pf-nonres-none { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; font-size: 13px; }
.tr-pf-nonres-none .tr-link-btn, .tr-pf-addstate { margin-top: 0 !important; }
.tr-pf-states-list { display: flex; flex-direction: column; gap: 2px; width: 100%; }
.tr-pf-state-row { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 16px; font-size: 13px; }
.tr-pf-state-row > strong { width: 110px; font-weight: 600; color: var(--ink); }
.tr-pf-dl { display: flex; flex-direction: column; gap: 6px; margin: 0; }
.tr-pf-dl > div { display: flex; gap: 10px; font-size: 13px; }
.tr-pf-dl dt { width: 104px; flex-shrink: 0; color: var(--slate-light); }
.tr-pf-dl dd { margin: 0; min-width: 0; color: var(--ink); overflow-wrap: anywhere; }
.tr-pf-dl dd a { color: var(--brass-dark); }
.tr-pf-entity-link { display: inline-flex; align-items: center; gap: 4px; text-align: left; }
.tr-pf-docs { list-style: none; margin: 0; padding: 0; }
.tr-pf-docs li { display: flex; align-items: flex-start; gap: 8px; padding: 7px 0; border-top: 1px solid var(--line); color: #24548A; }
.tr-pf-docs li > div { flex: 1; min-width: 0; }
.tr-pf-docs li span { display: block; font-size: 11.5px; color: var(--slate-light); }
.tr-pf-doc-name { padding: 0; border: none; background: none; font-family: inherit; font-size: 13px; font-weight: 600; color: var(--ink); cursor: pointer; text-align: left; overflow-wrap: anywhere; }
.tr-pf-doc-name:hover { color: var(--brass-dark); text-decoration: underline; }
.tr-pf-noteform { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; margin-bottom: 8px; }
.tr-pf-noteform textarea { width: 100%; resize: vertical; font-family: inherit; font-size: 13.5px; padding: 8px 10px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); color: var(--ink); background: var(--card); }
.tr-pf-noteform textarea:focus { outline: none; border-color: var(--brass); box-shadow: var(--ring); }
.tr-pf-notes { list-style: none; margin: 0; padding: 0; }
.tr-pf-notes li { padding: 8px 0; border-top: 1px solid var(--line); font-size: 13px; }
.tr-pf-note-head { display: flex; align-items: center; gap: 8px; }
.tr-pf-note-head strong { color: var(--ink); }
.tr-pf-note-head span { font-size: 11.5px; color: var(--slate-light); }
.tr-pf-note-del { margin-left: auto; width: 26px; height: 26px; }
.tr-pf-notes p { margin: 2px 0 0; color: var(--slate); line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
.tr-pf-reasons { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 4px; }
.tr-modal-card:has(.tr-pf-form) { max-width: 640px; }
.tr-pf-dialog:focus, .tr-pf-form:focus { outline: none; }
.tr-pf-form { display: flex; flex-direction: column; gap: 12px; }
.tr-pf-form .tr-subtitle { margin: -6px 0 0; }
.tr-pf-form-sub { margin-top: 4px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--slate-light); }
.tr-pf-form-actions { flex-wrap: wrap; align-items: center; }
.tr-pf-form-actions .tr-link-btn { margin-top: 0; align-self: center; }
.tr-pf-grow { flex: 1; }
.tr-pf-danger { color: var(--rust) !important; }
.tr-pf-states { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.tr-pf-state-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 4px 3px 10px; border-radius: 999px; background: var(--ink); color: #fff; font-size: 12.5px; font-weight: 500; }
.tr-pf-state-chip em { font-style: normal; opacity: .7; }
.tr-pf-state-chip button { display: inline-flex; padding: 2px; border: none; border-radius: 999px; background: rgba(255,255,255,0.15); color: #fff; cursor: pointer; }
.tr-pf-states select { height: 32px; padding: 0 8px; border: 1px dashed var(--line-strong); border-radius: 999px; background: var(--card); font-family: inherit; font-size: 12.5px; color: var(--brass-dark); font-weight: 600; cursor: pointer; }
.tr-pf-licsteps { list-style: none; margin: 4px 0 0; padding: 0; }
.tr-pf-licsteps li { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid var(--line); font-size: 13.5px; color: var(--slate); }
.tr-pf-licsteps li:first-child { border-top: none; }
.tr-pf-licsteps li.tr-pf-lic-done { color: var(--ink); }
.tr-pf-licsteps li.tr-pf-lic-now { margin: 2px -10px; padding: 9px 10px; border: 1px solid rgba(196,154,60,0.38); border-radius: 10px; background: rgba(196,154,60,0.07); color: var(--ink); font-weight: 600; }
.tr-pf-licsteps li.tr-pf-lic-now + li { border-top: none; }
.tr-pf-lic-text { flex: 1; min-width: 0; }
.tr-pf-lic-group { margin: 12px 0 0; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--slate-light); }
.tr-pf-lic-detail { font-size: 12.5px; color: var(--slate-light); font-weight: 400; }
.tr-pf-editsteps .tr-pf-light { margin: 4px 0 10px; font-size: 12.5px; }
@media (max-width: 640px) {
  .tr-pf-bar { gap: 8px; }
  .tr-pf-tabs { width: 100%; margin-right: 0; }
  .tr-pf-tabs button { flex: 1; justify-content: center; padding: 8px 6px; }
  .tr-pf-search { flex: 1 1 100%; }
  .tr-pf-sort { flex: 1; }
  .tr-pf-sort select { flex: 1; }
  .tr-pf-add { flex: 1; }
  .tr-pf-chips { flex-wrap: nowrap; overflow-x: auto; margin: 0 -14px; padding: 0 14px 2px; scrollbar-width: none; }
  .tr-pf-chips::-webkit-scrollbar { display: none; }
  .tr-pf-row-head { display: none; }
  .tr-pf-row { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "name flag" "prog prog" "now now" "lag lag"; gap: 6px 10px; padding: 12px 14px; }
  .tr-pf-row-flagicon { grid-area: flag; align-self: start; }
  .tr-pf-row-name { grid-area: name; }
  .tr-pf-row-prog { grid-area: prog; }
  .tr-pf-row-now { grid-area: now; }
  .tr-pf-row-lag { grid-area: lag; }
  .tr-pf-row-lag:empty { display: none; }
  .tr-pf-row-chev { display: none; }
  .tr-pf-two { grid-template-columns: minmax(0, 1fr); }
  .tr-pf-checklist, .tr-pf-box { padding: 12px 14px; }
  /* A step: the title with the upload button beside it; the lag on the
     step it's on goes under the title (each item already shows its date). */
  .tr-pf-step-head { flex-wrap: wrap; }
  .tr-pf-step-title { flex: 1 1 calc(100% - 70px); }
  .tr-pf-step-side { display: contents; }
  .tr-pf-step-side .tr-pf-done-on { display: none; }
  .tr-pf-step-side .tr-pf-lag { order: 3; margin-left: 26px; }
  .tr-pf-step-upload { margin: -5px -6px -5px 0; }
  .tr-pf-items, .tr-pf-step-extra { margin-left: 22px; }
  .tr-pf-step-num { display: none; }
  .tr-pf-state-row > strong { width: 100%; }
  .tr-pf-flagbar { flex-wrap: wrap; }
}
/* ---- MegaPhone: announcements (Today, Team overview, the pop-up, Chat) ---- */
.tr-ann { position: relative; background: linear-gradient(180deg, rgba(196,154,60,0.11), rgba(196,154,60,0.04)); border: 1px solid rgba(196,154,60,0.5); border-radius: 14px; padding: 16px 18px 14px; box-shadow: 0 1px 2px rgba(19,33,46,0.05); }
.tr-ann-top { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; font-size: 12.5px; color: var(--slate-light); }
.tr-ann-badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px 3px 7px; border-radius: 999px; background: var(--ink); color: #F3D58C; font-size: 11px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
.tr-ann-meta strong { color: var(--ink); font-weight: 600; }
.tr-ann-right { margin-left: auto; display: inline-flex; align-items: center; gap: 10px; white-space: nowrap; }
.tr-ann-of { padding: 1px 8px; border-radius: 999px; background: var(--card); border: 1px solid var(--line); font-weight: 600; color: var(--slate); }
.tr-ann-title { font-family: 'Newsreader', serif; font-size: 22px; font-weight: 600; line-height: 1.25; color: var(--ink); margin: 10px 0 4px; overflow-wrap: anywhere; }
.tr-ann-body { font-size: 14.5px; line-height: 1.55; color: var(--slate); max-width: 78ch; margin: 0; white-space: pre-line; overflow-wrap: anywhere; }
.tr-ann-body a { color: var(--brass-dark); font-weight: 600; }
.tr-ann-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(196,154,60,0.32); }
.tr-ann-check { display: inline-flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 600; color: var(--ink); cursor: pointer; }
.tr-ann-check input { width: 20px; height: 20px; margin: 0; accent-color: var(--brass-dark); cursor: pointer; }
.tr-ann-hint { font-size: 12.5px; color: var(--slate-light); }
.tr-ann-confirm { margin-left: auto; }
.tr-ann-err { flex-basis: 100%; }
.tr-ann-done { display: inline-flex; align-items: center; gap: 6px; color: #23654A; font-weight: 600; font-size: 13.5px; }
.tr-ann-compact .tr-ann-title { font-size: 19px; margin: 8px 0 2px; }
.tr-ann-compact .tr-ann-body { margin-top: 4px; }
.tr-ann-team { margin-top: 12px; padding: 12px 14px; border-radius: 10px; background: var(--card); border: 1px solid var(--line); }
.tr-ann-team-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; font-size: 13.5px; color: var(--ink); }
.tr-ann-team-head strong { font-weight: 700; }
.tr-ann-bar { flex: 1 1 140px; min-width: 120px; height: 8px; border-radius: 999px; background: var(--paper-dim); overflow: hidden; }
.tr-ann-bar i { display: block; height: 100%; border-radius: 999px; background: var(--green); }
.tr-ann-toggle { margin-top: 0 !important; align-self: center; font-size: 13px; font-weight: 600; }
.tr-ann-sub { margin: 10px 0 6px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--slate-light); }
.tr-ann-people { display: flex; flex-wrap: wrap; gap: 6px; }
.tr-ann-person { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px 3px 3px; border-radius: 999px; background: var(--paper); border: 1px solid var(--line); font-size: 12.5px; color: var(--ink); white-space: nowrap; }
.tr-ann-av { flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%; color: #fff; font-size: 9.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; object-fit: cover; }
.tr-ann-more { align-self: center; font-size: 12.5px; color: var(--slate-light); }
/* the pop-up: over everything until it's confirmed */
.tr-ann-gate { position: fixed; inset: 0; z-index: 96; background: rgba(19,33,46,0.55); display: flex; align-items: center; justify-content: center; padding: 20px; }
.tr-ann-gate-card { width: 100%; max-width: 560px; max-height: calc(100vh - 40px); overflow-y: auto; background: var(--card); border-radius: 16px; padding: 22px 24px 18px; box-shadow: 0 24px 60px rgba(19,33,46,0.35); }
.tr-ann-gate-card:focus { outline: none; }
.tr-ann-gate-card .tr-ann-title { font-size: 24px; }
.tr-ann-must { display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 999px; background: rgba(176,67,47,0.1); color: #9B3A26; font-size: 11.5px; font-weight: 700; }
.tr-ann-gate-note { margin: 10px 0 0; font-size: 12.5px; color: var(--slate-light); }
.tr-ann-gate-note strong { color: var(--ink); font-weight: 600; }
/* Chat → MegaPhone */
.tr-mega { display: flex; flex-direction: column; gap: 14px; padding: 16px 20px 20px; }
.tr-mega-newbtn { margin-left: auto; flex-shrink: 0; }
.tr-mega-new { display: flex; flex-direction: column; gap: 12px; padding: 14px 16px; background: var(--card); border: 1px solid var(--line-strong); border-radius: 12px; box-shadow: 0 4px 14px rgba(19,33,46,0.06); }
.tr-mega-new-h { display: flex; align-items: center; justify-content: space-between; }
.tr-mega-new-h h3 { margin: 0; font-size: 15px; font-weight: 700; color: var(--ink); }
.tr-mega-row { display: flex; flex-wrap: wrap; gap: 12px 18px; align-items: flex-end; }
.tr-mega-row .tr-field input { min-width: 170px; }
.tr-mega-seg { display: inline-flex; gap: 2px; padding: 3px; border-radius: 10px; background: var(--paper-dim); }
.tr-mega-seg button { padding: 7px 12px; border: none; border-radius: 8px; background: transparent; font-family: inherit; font-size: 13px; font-weight: 500; color: var(--slate); cursor: pointer; }
.tr-mega-seg .tr-mega-seg-on { background: var(--card); color: var(--ink); font-weight: 600; box-shadow: 0 1px 3px rgba(19,33,46,.12); }
.tr-mega-help { margin: -4px 0 0; font-size: 12.5px; color: var(--slate-light); }
.tr-mega-opt { display: flex; align-items: flex-start; gap: 9px; font-size: 13px; color: var(--slate); cursor: pointer; }
.tr-mega-opt input { width: 18px; height: 18px; margin: 1px 0 0; accent-color: var(--brass-dark); flex-shrink: 0; }
.tr-mega-opt b { color: var(--ink); }
.tr-mega-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.tr-mega-grow { flex: 1; }
.tr-mega-delete { margin-top: 0 !important; align-self: center; color: var(--rust) !important; }
.tr-mega-item { padding: 14px 16px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; }
.tr-mega-item-live { border-color: rgba(196,154,60,0.55); box-shadow: inset 3px 0 0 var(--brass); }
.tr-mega-item .tr-ann-title { font-size: 19px; margin: 8px 0 3px; }
.tr-mega-item .tr-ann-body { font-size: 13.5px; }
.tr-mega-status { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px; border-radius: 999px; background: var(--paper-dim); color: var(--slate-light); font-size: 11.5px; font-weight: 700; }
.tr-mega-status-live { background: rgba(46,125,91,0.12); color: #23654A; }
.tr-mega-status-pop { background: rgba(176,67,47,0.1); color: #9B3A26; }
.tr-mega-acts { display: inline-flex; gap: 6px; margin-left: auto; }
.tr-mega-mine { margin-top: 8px; }
.tr-mega-who { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 6px 18px; margin-top: 4px; }
.tr-mega-who ul { list-style: none; margin: 0; padding: 0; }
.tr-mega-who li { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-top: 1px solid var(--line); font-size: 12.5px; color: var(--ink); }
.tr-mega-who li > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tr-mega-who li em { margin-left: auto; padding-left: 8px; font-style: normal; font-size: 11.5px; color: var(--slate-light); white-space: nowrap; }
.tr-mega-who .tr-ann-sub { margin: 6px 0 2px; }
.tr-mega-who .tr-empty { margin: 4px 0 0; font-size: 12.5px; }
.tr-mega-more { color: var(--slate-light) !important; }
@media (max-width: 640px) {
  .tr-ann { padding: 14px 14px 12px; border-radius: 12px; }
  .tr-ann-title { font-size: 20px; }
  .tr-ann-body { font-size: 14px; }
  .tr-ann-confirm { width: 100%; justify-content: center; margin-left: 0; }
  .tr-ann-gate { align-items: flex-end; padding: 0; }
  .tr-ann-gate-card { max-width: none; max-height: 92vh; border-radius: 18px 18px 0 0; padding: 18px 18px calc(20px + env(safe-area-inset-bottom, 0px)); }
  .tr-ann-gate-card .tr-ann-title { font-size: 22px; }
  .tr-mega { padding: 12px 12px 16px; }
  .tr-mega-who { grid-template-columns: minmax(0, 1fr); }
  .tr-mega-acts { margin-left: 0; width: 100%; }
}
/* Appointments open when tapped (Calendar, Today), and show when they end */
.tr-time-end { display: block; margin-top: 1px; font-size: 11.5px; font-weight: 400; color: var(--slate-light); white-space: nowrap; }
.tr-agenda-open { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; margin: -4px 0; padding: 4px 0; background: none; border: 0; border-radius: 6px; font: inherit; color: inherit; text-align: left; cursor: pointer; }
.tr-agenda-open .tr-agenda-what { display: block; }
.tr-agenda-open:focus-visible .tr-agenda-what strong { text-decoration: underline; text-underline-offset: 2px; }
.tr-agenda-open:focus-visible, .tr-dayagenda-open:focus-visible, .tr-ov-row-open:focus-visible, .tr-note-open:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }
.tr-dayagenda-open { display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0; margin: -6px 0; padding: 6px 0; background: none; border: 0; border-radius: 8px; font: inherit; color: inherit; text-align: left; cursor: pointer; }
.tr-dayagenda-open:focus-visible .tr-dayagenda-main > strong { text-decoration: underline; text-underline-offset: 2px; }
.tr-ov-row-open { width: 100%; margin: 0; background: none; border: 0; border-top: 1px solid var(--line); font-family: inherit; color: inherit; text-align: left; cursor: pointer; }
.tr-ov-day-label + .tr-ov-row-open { border-top: none; }
.tr-ov-row-open:focus-visible strong { text-decoration: underline; text-underline-offset: 2px; }
.tr-note-item-appt { position: relative; padding: 0; }
.tr-note-open { display: block; width: 100%; margin: 0; padding: 8px 64px 8px 10px; background: none; border: 0; border-radius: 8px; font: inherit; color: inherit; text-align: left; cursor: pointer; }
.tr-note-open > span { display: block; }
/* Hover only where there's a mouse, so a tapped row doesn't stay underlined on a phone. */
@media (hover: hover) {
  .tr-agenda-open:hover .tr-agenda-what strong, .tr-dayagenda-open:hover .tr-dayagenda-main > strong, .tr-ov-row-open:hover strong { text-decoration: underline; text-underline-offset: 2px; }
  .tr-note-open:hover { background: rgba(19,33,46,0.04); }
}
.tr-note-open-hint { position: absolute; top: 8px; right: 10px; font-size: 12px; font-weight: 600; color: var(--brass-dark); }
.tr-note-item-appt > div { padding: 0 10px 8px; }

/* The appointment form: date, start and end on one line */
.tr-appt-when { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr); gap: 14px; }
.tr-appt-len { margin-left: 6px; font-style: normal; font-weight: 500; color: var(--slate-light); }
.tr-fsheet-body .tr-appt-when { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
.tr-fsheet-body .tr-appt-when-date { grid-column: 1 / -1; }
/* A presenter's open times, above the date and time */
.tr-open { grid-column: 1 / -1; border: 1px solid var(--line); border-radius: var(--radius); background: var(--paper); padding: 12px 14px 10px; }
.tr-open-head { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; color: var(--ink); font-size: 14px; }
.tr-open-head svg { color: var(--brass-dark); flex-shrink: 0; }
.tr-open-sub { margin-left: auto; font-size: 12.5px; color: var(--slate-light); }
.tr-open-weekbar { display: flex; align-items: center; justify-content: space-between; margin: 8px 0 6px; }
.tr-open-weeklabel { font-size: 12.5px; font-weight: 600; color: var(--slate); }
.tr-open-arrow:disabled { opacity: .35; cursor: default; }
.tr-open-week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
.tr-open-day { display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 7px 2px 6px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); font-family: inherit; color: var(--ink); cursor: pointer; transition: border-color .15s, background .15s; }
.tr-open-day:disabled { background: transparent; border-color: transparent; color: var(--slate-light); opacity: .6; cursor: default; }
.tr-open-dow { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--slate-light); }
.tr-open-dom { font-size: 17px; font-weight: 700; line-height: 1.15; }
.tr-open-count { min-width: 18px; padding: 0 5px; border-radius: 999px; font-size: 11px; font-weight: 700; line-height: 16px; color: var(--brass-dark); background: var(--brass-tint); }
.tr-open-day:disabled .tr-open-count { background: none; color: inherit; font-weight: 500; }
.tr-open-day-today:not(.tr-open-day-on) .tr-open-dow { color: var(--brass-dark); }
.tr-open-day-on { background: var(--ink); border-color: var(--ink); color: #fff; }
.tr-open-day-on .tr-open-dow { color: rgba(255,255,255,0.75); }
.tr-open-day-on .tr-open-count { background: var(--brass); color: var(--ink); }
.tr-open-dayhead { margin: 10px 0 6px; font-size: 13px; font-weight: 600; color: var(--ink); }
.tr-open-none { font-weight: 400; color: var(--slate-light); }
.tr-open-times { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 6px; }
.tr-open-time { font-family: inherit; font-size: 13.5px; font-weight: 600; padding: 8px 6px; border-radius: 9px; border: 1px solid rgba(196,154,60,0.45); background: var(--card); color: var(--brass-dark); cursor: pointer; transition: background .15s, border-color .15s; font-variant-numeric: tabular-nums; }
.tr-open-time-on { background: var(--brass); border-color: var(--brass); color: var(--ink); }
@media (hover: hover) {
  .tr-open-day:not(:disabled):not(.tr-open-day-on):hover { border-color: var(--line-strong); background: var(--paper-dim); }
  .tr-open-time:not(.tr-open-time-on):hover { background: var(--brass-tint); border-color: var(--brass); }
}
.tr-open-off { margin: 10px 0 0; padding: 8px 10px; border-radius: 9px; font-size: 12.5px; line-height: 1.45; color: var(--ink); background: rgba(194,124,30,0.1); border: 1px solid rgba(194,124,30,0.3); }
.tr-open-foot { margin: 10px 0 0; font-size: 12px; line-height: 1.45; color: var(--slate-light); }
.tr-open-note { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; font-size: 13px; line-height: 1.45; color: var(--slate); }
.tr-open-note svg { margin-top: 1px; color: var(--slate-light); flex-shrink: 0; }
.tr-open-note-warn { background: rgba(194,124,30,0.08); border-color: rgba(194,124,30,0.3); }
.tr-open-note-warn svg { color: var(--amber); }
.tr-open-loading .tr-open-week { margin-top: 10px; }
.tr-open-skel { height: 58px; border-radius: 10px; }
/* Presenting hours (Calendar) */
.tr-ph-intro { margin: 0 0 12px; font-size: 13.5px; line-height: 1.5; color: var(--slate); max-width: 62ch; }
.tr-ph-accept { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; margin-bottom: 12px; border-radius: 10px; background: var(--paper); border: 1px solid var(--line); cursor: pointer; }
.tr-ph-accept input { margin-top: 3px; }
.tr-ph-accept span { display: flex; flex-direction: column; gap: 2px; font-size: 14px; color: var(--ink); }
.tr-ph-week { border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; margin-bottom: 14px; }
.tr-ph-day { display: grid; grid-template-columns: 150px minmax(0, 1fr) auto; align-items: center; gap: 8px 14px; padding: 9px 12px; border-bottom: 1px solid var(--line); background: var(--card); }
.tr-ph-day:last-child { border-bottom: none; }
.tr-ph-day:not(.tr-ph-day-on) { background: var(--paper); }
.tr-ph-dayname { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: var(--ink); cursor: pointer; }
.tr-ph-day:not(.tr-ph-day-on) .tr-ph-dayname { color: var(--slate-light); font-weight: 500; }
.tr-ph-ranges { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.tr-ph-range { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--slate-light); }
.tr-ph-range input[type="time"] { width: 122px; min-width: 0; font-family: inherit; font-size: 14px; padding: 6px 8px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--card); color: var(--ink); }
.tr-ph-range input[type="time"]:focus { outline: none; border-color: var(--brass); box-shadow: var(--ring); }
.tr-ph-remove { width: 30px; height: 30px; }
.tr-ph-off { font-size: 13px; color: var(--slate-light); }
.tr-ph-dayacts { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.tr-ph-dayacts .tr-link-btn { margin-top: 0; display: inline-flex; align-items: center; gap: 4px; text-decoration: none; font-weight: 600; white-space: nowrap; }
@media (hover: hover) { .tr-ph-dayacts .tr-link-btn:hover { text-decoration: underline; } }
.tr-ph-rules { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.tr-ph-google { align-items: flex-start !important; }
.tr-ph-google input { margin-top: 3px; }
.tr-ph-google > span { display: flex; flex-direction: column; gap: 2px; }
.tr-ph-summary { margin: 14px 0 0; font-size: 13px; line-height: 1.5; color: var(--slate); }
.tr-ph-saved { display: flex; align-items: center; gap: 10px; padding: 10px 12px; margin-bottom: 14px; border-color: rgba(46,125,91,0.35); background: rgba(46,125,91,0.07); font-size: 13.5px; color: var(--ink); }
.tr-ph-saved > svg { color: var(--green); flex-shrink: 0; }
.tr-ph-saved > span { flex: 1; min-width: 0; }
.tr-ph-nudge { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 14px; padding: 14px 16px; margin-bottom: 14px; border-color: rgba(196,154,60,0.45); background: linear-gradient(180deg, rgba(196,154,60,0.08), rgba(196,154,60,0.02)); }
.tr-ph-nudge > svg { color: var(--brass-dark); flex-shrink: 0; }
.tr-ph-nudge-text { flex: 1 1 280px; display: flex; flex-direction: column; gap: 2px; font-size: 13.5px; line-height: 1.45; color: var(--slate); }
.tr-ph-nudge-text strong { font-size: 14.5px; color: var(--ink); }
.tr-ph-nudge-acts { display: flex; gap: 8px; flex-wrap: wrap; }
@media (max-width: 640px) {
  .tr-ph-day { grid-template-columns: minmax(0, 1fr); padding: 10px; }
  .tr-ph-dayacts { flex-direction: row; justify-content: flex-start; gap: 16px; }
  .tr-ph-dayacts:empty { display: none; }
  .tr-ph-range { gap: 6px; }
  .tr-ph-range input[type="time"] { width: auto; flex: 1 1 0; padding: 6px 2px 6px 7px; font-size: 13.5px; }
  .tr-ph-range input[type="time"]::-webkit-calendar-picker-indicator { margin-left: 0; padding: 0; }
  .tr-ph-to { font-size: 0; }
  .tr-ph-to::after { content: '–'; font-size: 13px; }
  .tr-ph-rules { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .tr-ph-nudge { padding: 12px; }
  .tr-ph-nudge > svg { display: none; }
}
@media (max-width: 640px) {
  .tr-open { padding: 10px 10px 8px; }
  .tr-open-sub { display: none; }
  .tr-open-week { gap: 4px; }
  .tr-open-dom { font-size: 16px; }
  .tr-open-dow { font-size: 10.5px; letter-spacing: .02em; }
  .tr-open-times { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .tr-open-time { min-height: 44px; }
}
.tr-appt-over { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 12px; padding: 10px 12px; border-radius: 10px; background: var(--brass-tint); border: 1px solid rgba(196,154,60,0.35); font-size: 13.5px; color: var(--ink); }
.tr-appt-delete { margin-right: auto; color: var(--rust); }
.tr-appt-other { padding: 10px 12px; border-radius: 10px; background: rgba(45,104,168,0.07); border: 1px solid rgba(45,104,168,0.25); font-size: 13.5px; line-height: 1.45; color: var(--ink); }
.tr-log-edit { margin: 0 auto 0 0; align-self: center; }
/* An appointment's name in a list opens it */
.tr-appt-client-btn { display: inline; margin: 0; padding: 0; background: none; border: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; }
.tr-appt-client-btn:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; border-radius: 3px; }
.tr-appt-client-btn strong, .tr-appt-sub-btn { text-decoration: underline; text-decoration-color: var(--line-strong); text-underline-offset: 3px; }
@media (hover: hover) { .tr-appt-client-btn:hover strong, .tr-appt-sub-btn:hover { text-decoration-color: currentColor; } }
a.tr-agenda-open, a.tr-cal-appt { text-decoration: none; }
.tr-calinfo-tag { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
.tr-calinfo-training { color: var(--brass-dark); background: rgba(201,162,75,0.14); }
.tr-calinfo-block { color: var(--rust); background: rgba(184,80,61,0.12); }
.tr-appt-delete-link { align-self: center; margin-top: 2px; color: var(--rust); }

/* The window an appointment opens in */
.tr-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.tr-modal-head .tr-h3 { margin: 0; }
.tr-modal-card.tr-modal-form { max-width: 640px; display: flex; flex-direction: column; padding: 0; overflow: hidden; }
.tr-modal-form .tr-modal-head { flex-shrink: 0; margin: 0; padding: 22px 24px 12px; }
.tr-modal-form .tr-modal-body { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 24px 18px; }
.tr-modal-form .tr-modal-foot { flex-shrink: 0; padding: 12px 24px 16px; border-top: 1px solid var(--line); background: var(--card); }
.tr-modal-form .tr-modal-foot .tr-error { margin: 0 0 10px; }
.tr-modal-form .tr-modal-foot .tr-form-actions { margin-top: 0; }
.tr-apptinfo-tags .tr-type-badge { margin-left: 0; }
.tr-modal-card.tr-apptinfo { max-width: 480px; }
.tr-modal-head + .tr-apptinfo-when { margin-top: -6px; }
.tr-apptinfo-top { min-width: 0; }
.tr-apptinfo-top .tr-h3 { margin: 0 0 6px; }
.tr-apptinfo-tags { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.tr-apptinfo-when { margin: 0 0 14px; font-size: 14.5px; font-weight: 600; color: var(--ink); }
.tr-apptinfo-when span { font-weight: 400; color: var(--slate-light); }
.tr-apptinfo-list { margin: 0; border-top: 1px solid var(--line); }
.tr-apptinfo-list > div { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
.tr-apptinfo-list dt { color: var(--slate-light); font-size: 13px; }
.tr-apptinfo-list dd { margin: 0; color: var(--ink); overflow-wrap: anywhere; }
.tr-apptinfo-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 14px; }
.tr-apptinfo-note { margin: 14px 0 0; font-size: 12.5px; color: var(--slate-light); }
@media (max-width: 640px) {
  .tr-appt-when { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
  .tr-appt-when-date { grid-column: 1 / -1; }
  .tr-modal-card.tr-apptinfo { padding: 20px 18px; }
  /* Phones: the name gets the whole line; call, text and Zoom go under it. */
  .tr-dayagenda-row { flex-wrap: wrap; row-gap: 8px; }
  .tr-dayagenda-open { flex-basis: 100%; }
  .tr-dayagenda-acts { margin-left: 5.73em; } /* (the time column plus its gap, in em so it grows with the text) */
  .tr-agenda-item { flex-wrap: wrap; row-gap: 6px; }
  .tr-agenda-open { flex-basis: 100%; }
  .tr-agenda-item > .tr-agenda-what { flex-basis: calc(100% - 82px); }
  .tr-agenda-item > a.tr-btn { margin-left: 82px; }
}
/* ---- Client intake: the send window, the picker, the status row ---- */
.tr-modal-card.tr-intake-modal { max-width: 480px; }
.tr-intake-body { display: flex; flex-direction: column; gap: 14px; }
.tr-modal-card .tr-intake-body { margin-top: 4px; }
.tr-intake-status { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; margin: 0; font-size: 13px; font-weight: 600; padding: 4px 11px; border-radius: 999px; }
.tr-intake-status-none { color: var(--slate); background: var(--paper-dim); }
.tr-intake-status-amber { color: #7E520E; background: rgba(194,124,30,0.13); }
.tr-intake-status-green { color: #23654A; background: rgba(46,125,91,0.11); }
.tr-intake-ways { display: flex; flex-direction: column; gap: 8px; }
.tr-intake-way { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 60px; padding: 10px 12px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--card); font-family: inherit; text-align: left; color: var(--ink); text-decoration: none; cursor: pointer; transition: border-color .15s, background .15s; }
a.tr-intake-way, a.tr-intake-way:visited { color: var(--ink); }
.tr-intake-way:hover:not(.tr-intake-way-ask) { border-color: var(--brass); background: rgba(196,154,60,0.05); }
.tr-intake-way:disabled { opacity: .6; cursor: default; }
.tr-intake-way-ask { cursor: default; }
.tr-intake-way-icon { width: 38px; height: 38px; flex-shrink: 0; border-radius: 10px; background: var(--brass-tint); color: var(--brass-dark); display: inline-flex; align-items: center; justify-content: center; }
.tr-intake-way-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.tr-intake-way-text strong { font-size: 14.5px; font-weight: 600; }
.tr-intake-way-text > span { font-size: 12.5px; color: var(--slate-light); overflow-wrap: anywhere; }
.tr-intake-inline { display: block; margin-top: 4px; }
.tr-intake-inline input { width: 100%; min-height: 38px; padding: 7px 10px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--card); font-family: inherit; font-size: 14px; color: var(--ink); }
.tr-intake-inline input:focus { border-color: var(--brass); box-shadow: var(--ring); outline: none; }
.tr-intake-preview { font-size: 13px; color: var(--slate-light); }
.tr-intake-preview summary { cursor: pointer; font-weight: 500; color: var(--slate); padding: 4px 0; }
.tr-intake-preview p { margin: 6px 0 0; padding: 10px 12px; border-radius: var(--radius-sm); background: var(--paper); color: var(--slate); line-height: 1.5; overflow-wrap: anywhere; }
.tr-intake-search { margin-bottom: 0; }
.tr-intake-pick { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.tr-intake-pick li + li { border-top: 1px solid var(--line); }
.tr-intake-pick button { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 56px; padding: 10px 4px; border: none; background: none; font-family: inherit; text-align: left; color: var(--ink); cursor: pointer; border-radius: 8px; }
.tr-intake-pick button:hover:not(:disabled) { background: var(--paper); }
.tr-intake-pick button:disabled { cursor: default; opacity: .75; }
.tr-intake-pick-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.tr-intake-pick-main strong { font-size: 14.5px; font-weight: 600; }
.tr-intake-pick-main span { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; color: var(--slate-light); }
.tr-intake-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 12px; border-radius: var(--radius-sm); background: var(--paper); color: var(--slate-light); }
.tr-intake-row-text { flex: 1 1 180px; min-width: 0; font-size: 13.5px; color: var(--slate); }
.tr-intake-row-text strong { color: var(--ink); font-weight: 600; }
.tr-intake-check { align-items: flex-start !important; }
.tr-intake-check input[type="checkbox"] { margin-top: 2px; }
.tr-intake-check > span { display: flex; flex-direction: column; gap: 2px; font-weight: 600; }

/* ---- Pipeline → Appointments: folds, the Zoom line, the week tracker ---- */
.tr-list-fold { border-radius: var(--radius); border: 1px solid var(--line); background: var(--card); overflow: hidden; }
.tr-list-fold-head { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 48px; padding: 12px 16px; border: none; background: none; font-family: inherit; text-align: left; cursor: pointer; color: var(--slate-light); }
.tr-list-fold-head strong { font-size: 14px; font-weight: 600; color: var(--ink); }
.tr-list-fold-head span { font-size: 13px; }
.tr-list-fold > .tr-card { border: none; border-top: 1px solid var(--line); border-radius: 0; }
.tr-connect-nudge { padding-top: 6px; padding-bottom: 6px; }
.tr-connect-nudge .tr-icon-btn { margin-right: -6px; color: var(--slate-light); }
.tr-pace.tr-pace-closed { gap: 0; }
.tr-pace-summary { display: flex; align-items: center; gap: 10px; width: 100%; padding: 12px 0 0; border: none; background: none; font-family: inherit; text-align: left; cursor: pointer; }
.tr-pace-closed .tr-pace-summary { padding-bottom: 0; }
.tr-pace-minis { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.tr-pace-mini { display: inline-flex; align-items: baseline; gap: 4px; padding: 3px 9px; border-radius: 999px; background: var(--paper); font-size: 12.5px; color: var(--slate); white-space: nowrap; }
.tr-pace-mini strong { font-family: 'IBM Plex Mono', monospace; font-size: 12px; font-weight: 500; color: var(--brass-dark); }
.tr-pace-mini-done { background: rgba(46,125,91,0.1); }
.tr-pace-mini-done strong { color: #23654A; }
.tr-pace-more { display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0; font-size: 13px; font-weight: 500; color: var(--brass-dark); }
@media (hover: hover) { .tr-pace-summary:hover .tr-pace-more { text-decoration: underline; } }

/* Phones and tablets: toggles, chips and the small text links get a
   finger-sized target too. (Last in the sheet, so these win over each
   control's own size above.) */
@media (hover: none) and (pointer: coarse) {
  .tr-seg button { min-height: 38px; padding-left: 14px; padding-right: 14px; }
  .tr-groupswitch button { min-height: 36px; }
  .tr-pf-chip, .tr-pill-btn, .tr-chip-toggle { min-height: 40px; }
  .tr-react-btn { width: 38px; height: 38px; }
  .tr-win-meta .tr-react-btn { width: 36px; height: 36px; }
  .tr-react-tray button { width: 40px; height: 40px; }
  .tr-react-sum { min-height: 32px; }
  .tr-header-account { min-height: 44px; }
  .tr-info-btn, .tr-org-toggle { width: 36px; height: 36px; }
  .tr-check-box { width: 30px; height: 30px; }
  .tr-link-btn:not(.tr-pf-inline-link), .tr-task-link, .tr-ov-link, .tr-more-toggle, .tr-link-danger, .tr-f30-toggle { min-height: 36px; }
  .tr-task-actions .tr-task-hide { margin-top: -6px; }
  .tr-pf-check, .tr-pf-item-date, .tr-pf-doc-chip, .tr-pf-doc-name { min-height: 34px; }
  .tr-jogger-cat-head { min-height: 40px; }
  .tr-org-stat-ready, .tr-solar-trail button, .tr-pf-back { min-height: 36px; }
  .tr-org-ready { position: relative; }
  .tr-org-ready::after { content: ''; position: absolute; inset: -9px -4px; }
  /* Names and links inside text: a taller tap area without moving the text. */
  .tr-appt-client-btn, .tr-appt-links a, .tr-rowname-btn, .tr-solar-name-btn, .tr-account-links a, .tr-pf-dl dd a, .tr-note-item a.tr-link { padding-top: 8px; padding-bottom: 8px; margin-top: -8px; margin-bottom: -8px; }
}
`;
