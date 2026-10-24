// Super admins: a tab for each solar system at the top of Org Chart and
// Manage Team (see lib/systemScope.js). Nobody else sees it.
export function SystemTabs({ tabs }) {
  const { systems, current, pick } = tabs;
  if (!systems.length) return null;
  return (
    <div className="tr-systabs" role="tablist" aria-label="Solar systems">
      {systems.map(s => (
        <button key={s.id} type="button" role="tab" aria-selected={s.id === current}
          className={`tr-systab ${s.id === current ? 'tr-systab-on' : ''}`} onClick={() => { if (s.id !== current) pick(s.id); }}>
          {s.name}
        </button>
      ))}
    </div>
  );
}
