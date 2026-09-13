import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App.tsx';
import type { OsrsApi } from '../../shared/ipc.ts';

afterEach(() => {
  cleanup();
  window.osrsApi = undefined;
  vi.restoreAllMocks();
});

describe('App shell', () => {
  it('renders the layout and dashboard placeholder', () => {
    render(<App />);

    expect(screen.getByText('OSRS GE Analyzer')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Top 10 Daily Opportunities' })).toBeInTheDocument();
  });

  it('shows the app version after a successful IPC round-trip', async () => {
    // Old-preload shape (no market surface) by design — cast keeps the
    // runtime fallback covered now that OsrsApi.market is required.
    window.osrsApi = { app: { getVersion: vi.fn().mockResolvedValue('0.1.0-test') } } as unknown as OsrsApi;
    render(<App />);

    expect(await screen.findByText(/IPC round-trip OK/)).toBeInTheDocument();
    expect(await screen.findByText('0.1.0-test')).toBeInTheDocument();
  });

  it('explains browser dev mode when the preload bridge is absent', async () => {
    render(<App />);

    expect(await screen.findByText(/Desktop bridge unavailable/)).toBeInTheDocument();
  });

  it('surfaces IPC failures instead of failing silently', async () => {
    window.osrsApi = {
      app: {
        getVersion: vi.fn().mockRejectedValue(new Error('timeout')),
      },
    } as unknown as OsrsApi;
    render(<App />);

    expect(await screen.findByText(/IPC failed/)).toBeInTheDocument();
    // Main error paragraph now also carries the detail (review #43), so
    // the text matches twice — assert on all matches instead of one.
    expect((await screen.findAllByText(/timeout/)).length).toBeGreaterThanOrEqual(1);
  });
});
