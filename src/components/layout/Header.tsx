import type { JSX } from 'react';

export default function Header(): JSX.Element {
  return (
    <header className="app-header">
      <h1>Dashboard</h1>
      <div className="header-status">
        <span className="status-dot" aria-hidden="true" />
        <span>Sprint 1 shell</span>
      </div>
    </header>
  );
}
