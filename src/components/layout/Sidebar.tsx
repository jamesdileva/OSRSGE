import type { JSX } from 'react';

const NAV_ITEMS = [
  { label: 'Dashboard', active: true, note: null as string | null },
  { label: 'Watchlist', active: false, note: 'Sprint 11' },
  { label: 'History', active: false, note: 'Sprint 4' },
  { label: 'Settings', active: false, note: 'Later' },
];

export default function Sidebar(): JSX.Element {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">OSRS GE Analyzer</div>
      <nav aria-label="Primary">
        <ul>
          {NAV_ITEMS.map((item) => (
            <li key={item.label}>
              <span className={item.active ? 'nav-item nav-item-active' : 'nav-item'} aria-current={item.active ? 'page' : undefined}>
                {item.label}
                {item.note !== null && <em className="nav-note">{item.note}</em>}
              </span>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
