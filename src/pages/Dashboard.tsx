import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { fetchAppVersion, isDesktopBridgeAvailable } from '../services/electronApi.ts';
import '../styles/dashboard.css';

/** UI state model per implementation guide §35. */
type Status = 'idle' | 'loading' | 'success' | 'error';

export default function Dashboard(): JSX.Element {
  const [status, setStatus] = useState<Status>(() => (isDesktopBridgeAvailable() ? 'loading' : 'idle'));
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bridgeAvailable = isDesktopBridgeAvailable();

  useEffect(() => {
    if (!isDesktopBridgeAvailable()) {
      return;
    }
    let cancelled = false;
    fetchAppVersion()
      .then((v) => {
        if (!cancelled) {
          setVersion(v);
          setStatus('success');
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setStatus('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section aria-label="Market dashboard">
      <div className="market-summary">
        <div className="summary-card">
          <span className="summary-label">Items analyzed</span>
          <strong>—</strong>
          <small>Provider arrives in Sprint 2</small>
        </div>
        <div className="summary-card">
          <span className="summary-label">Opportunities</span>
          <strong>—</strong>
          <small>Ranking engine arrives in Sprint 6</small>
        </div>
        <div className="summary-card">
          <span className="summary-label">Last update</span>
          <strong>—</strong>
          <small>Scheduler arrives in Sprint 10</small>
        </div>
      </div>

      <h2>Top 10 Daily Opportunities</h2>
      <p className="placeholder">No market data yet — the provider, storage, analytics, and ranking sprints will fill this table.</p>

      <h2>Desktop bridge</h2>
      {!bridgeAvailable && <p className="notice">Desktop bridge unavailable — running in browser dev mode. Launch via Electron to test IPC.</p>}
      {bridgeAvailable && status === 'loading' && <p className="notice">Contacting desktop shell…</p>}
      {bridgeAvailable && status === 'success' && (
        <p className="notice notice-ok">
          IPC round-trip OK — app version: <strong>{version}</strong>
        </p>
      )}
      {bridgeAvailable && status === 'error' && <p className="notice notice-error">IPC failed: {error}</p>}
    </section>
  );
}
