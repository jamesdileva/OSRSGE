import { useState } from 'react';
import type { JSX } from 'react';
import AppLayout from './components/layout/AppLayout.tsx';
import type { SidebarSectionId } from './components/layout/Sidebar.tsx';
import Dashboard from './pages/Dashboard.tsx';

export default function App(): JSX.Element {
  // Single-page section navigation (no router): the sidebar tabs scroll the
  // Dashboard to their section. Settings is disabled — no feature behind it.
  const [activeSection, setActiveSection] = useState<SidebarSectionId>('dashboard');
  return (
    <AppLayout activeSection={activeSection} onSelectSection={setActiveSection}>
      <Dashboard activeSection={activeSection} />
    </AppLayout>
  );
}
