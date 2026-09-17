import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LogViewerPanel from '../../src/components/dashboard/LogViewerPanel.tsx';
import Dashboard from '../../src/pages/Dashboard.tsx';
import { createLogEvent, summarizeLog } from '../../core/diagnostics/appLog.ts';

afterEach(() => {
  cleanup();
  window.osrsApi = undefined;
  vi.restoreAllMocks();
});

const T0 = 1_786_000_000_000;

describe('S20 slice-4 read-only log viewer (pure + dashboard wiring)', () => {
  it('panel renders the read-only notice and calls onRefresh without inputs', () => {
    const onRefresh = vi.fn();
    render(<LogViewerPanel events={null} summary={null} error={null} onRefresh={onRefresh} />);
    expect(screen.getByText(/Nothing is written here/)).toBeInTheDocument();
    expect(screen.getByText(/No logs loaded yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Refresh logs'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('panel renders summary counts plus newest-first events verbatim', () => {
    const events = [
      createLogEvent(T0, 'info', 'startup', 'boot'),
      createLogEvent(T0 + 1, 'error', 'api-failure', 'timeout'),
    ];
    const summary = summarizeLog(events);
    render(<LogViewerPanel events={events} summary={summary} error={null} onRefresh={vi.fn()} />);
    expect(screen.getByText(/Total events/)).toBeInTheDocument();
    expect(screen.getByText(/1 error/)).toBeInTheDocument();
    expect(screen.getAllByText(/timeout/).length).toBeGreaterThanOrEqual(2);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toMatch(/timeout/);
    expect(items[1]?.textContent).toMatch(/boot/);
  });

  it('panel surfaces read errors fail-closed', () => {
    render(<LogViewerPanel events={null} summary={null} error="boom" onRefresh={vi.fn()} />);
    expect(screen.getByText(/Logs unavailable: boom/)).toBeInTheDocument();
  });

  it('dashboard reads via the bridge when the logs surface exists', async () => {
    const getRecent = vi.fn().mockResolvedValue({
      events: [createLogEvent(T0, 'info', 'api-refresh', 'refresh succeeded')],
    });
    const getSummary = vi.fn().mockResolvedValue({
      summary: summarizeLog([createLogEvent(T0, 'info', 'api-refresh', 'refresh succeeded')]),
    });
    window.osrsApi = {
      app: { getVersion: vi.fn() },
      market: { fetchTop10: vi.fn(), fetchHistory: vi.fn() },
      logs: { getRecent, getSummary },
    };
    render(<Dashboard status="success" opportunities={[]} itemsAnalyzed={0} />);
    fireEvent.click(screen.getByText('Refresh logs'));
    expect(getRecent).toHaveBeenCalledWith({ limit: 500 });
    expect(getSummary).toHaveBeenCalledWith();
    expect(await screen.findByText(/refresh succeeded/)).toBeInTheDocument();
  });

  it('dashboard falls back to empty reads with zero IPC when the bridge is absent', () => {
    window.osrsApi = undefined;
    render(<Dashboard status="success" opportunities={[]} itemsAnalyzed={0} />);
    fireEvent.click(screen.getByText('Refresh logs'));
    expect(screen.getByText(/No log events yet/)).toBeInTheDocument();
  });

  it('dashboard falls back to empty reads on a stale preload without the logs surface', () => {
    window.osrsApi = {
      app: { getVersion: vi.fn() },
      market: { fetchTop10: vi.fn(), fetchHistory: vi.fn() },
    };
    render(<Dashboard status="success" opportunities={[]} itemsAnalyzed={0} />);
    fireEvent.click(screen.getByText('Refresh logs'));
    expect(screen.getByText(/No log events yet/)).toBeInTheDocument();
  });

  it('dashboard surfaces bridge read failures without throwing', async () => {
    const getRecent = vi.fn().mockRejectedValue(new Error('ipc down'));
    const getSummary = vi.fn().mockResolvedValue({
      summary: summarizeLog([]),
    });
    window.osrsApi = {
      app: { getVersion: vi.fn() },
      market: { fetchTop10: vi.fn(), fetchHistory: vi.fn() },
      logs: { getRecent, getSummary },
    };
    render(<Dashboard status="success" opportunities={[]} itemsAnalyzed={0} />);
    fireEvent.click(screen.getByText('Refresh logs'));
    expect(await screen.findByText(/Logs unavailable: ipc down/)).toBeInTheDocument();
  });
});
