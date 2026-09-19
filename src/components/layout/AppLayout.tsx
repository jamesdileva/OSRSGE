import type { JSX, ReactNode } from 'react';
import Header from './Header.tsx';
import Sidebar from './Sidebar.tsx';
import type { SidebarSectionId } from './Sidebar.tsx';

interface AppLayoutProps {
  children: ReactNode;
  activeSection: SidebarSectionId;
  onSelectSection: (section: SidebarSectionId) => void;
}

export default function AppLayout({ children, activeSection, onSelectSection }: AppLayoutProps): JSX.Element {
  return (
    <div className="app-shell">
      <Sidebar activeSection={activeSection} onSelectSection={onSelectSection} />
      <div className="app-main">
        <Header />
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
