import type { JSX, ReactNode } from 'react';
import Header from './Header.tsx';
import Sidebar from './Sidebar.tsx';

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps): JSX.Element {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <Header />
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
