import type { JSX } from 'react';

/**
 * Sidebar section ids. The app is a single Dashboard page — every feature
 * (watchlist, alerts, flip calculator, quality, log) lives as a section on
 * it, so tabs scroll to sections instead of routing to pages that were
 * never built (Sprint 1 scaffold placeholders). History has no page: the
 * 24h price chart lives under Item details, so the History tab targets it.
 * Settings has no feature behind it anywhere and stays visibly disabled.
 */
export type SidebarSectionId = 'dashboard' | 'watchlist' | 'history' | 'settings';

interface NavItem {
  id: SidebarSectionId;
  label: string;
  note: string | null;
  enabled: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', note: null, enabled: true },
  { id: 'watchlist', label: 'Watchlist', note: null, enabled: true },
  { id: 'history', label: 'History', note: null, enabled: true },
  { id: 'settings', label: 'Settings', note: 'Later', enabled: false },
];

interface SidebarProps {
  activeSection: SidebarSectionId;
  onSelectSection: (section: SidebarSectionId) => void;
}

export default function Sidebar({ activeSection, onSelectSection }: SidebarProps): JSX.Element {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">OSRS GE Analyzer</div>
      <nav aria-label="Primary">
        <ul>
          {NAV_ITEMS.map((item) => (
            <li key={item.id}>
              {item.enabled ? (
                <button
                  type="button"
                  className={activeSection === item.id ? 'nav-item nav-item-active' : 'nav-item'}
                  aria-current={activeSection === item.id ? 'page' : undefined}
                  onClick={() => {
                    onSelectSection(item.id);
                  }}
                >
                  {item.label}
                </button>
              ) : (
                <span className="nav-item" aria-disabled="true" title="No settings yet">
                  {item.label}
                  {item.note !== null && <em className="nav-note">{item.note}</em>}
                </span>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
