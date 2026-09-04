import type { JSX } from 'react';
import AppLayout from './components/layout/AppLayout.tsx';
import Dashboard from './pages/Dashboard.tsx';

export default function App(): JSX.Element {
  return (
    <AppLayout>
      <Dashboard />
    </AppLayout>
  );
}
