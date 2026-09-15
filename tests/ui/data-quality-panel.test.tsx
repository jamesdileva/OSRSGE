import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DataQualityPanel from '../../src/components/dashboard/DataQualityPanel.tsx';
import Dashboard from '../../src/pages/Dashboard.tsx';
import { assessDataQuality } from '../../core/market/quality/qualityAssessment.js';

afterEach(() => {
  cleanup();
  window.osrsApi = undefined;
  vi.restoreAllMocks();
});

describe('Sprint 16 slice-2 quality panel (pure + dashboard wiring)', () => {
  it('panel renders the trust notice and calls onAssess without inputs', () => {
    const onAssess = vi.fn();
    render(<DataQualityPanel assessment={null} error={null} onAssess={onAssess} />);
    expect(screen.getByText(/Nothing is fetched here/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Assess quality'));
    expect(onAssess).toHaveBeenCalledTimes(1);
  });

  it('panel renders the verdict (freshness, missing, impossible, duplicate, health)', () => {
    const NOW = 1_788_500_000_000;
    const assessment = assessDataQuality({
      snapshots: [{ itemId: 1, timestamp: NOW, high: 100, low: 90 }],
      nowMs: NOW,
      expectedItemIds: [1, 2],
      totalRecords: 10,
      invalidRecords: 0,
      excluded: 0,
    });
    render(<DataQualityPanel assessment={assessment} error={null} onAssess={vi.fn()} />);
    expect(screen.getByText(/100\.0%.*fresh/)).toBeInTheDocument();
    expect(screen.getByText(/missing: 2/)).toBeInTheDocument();
    expect(screen.getByText(/DEGRADED/)).toBeInTheDocument();
  });

  it('panel surfaces assessment errors fail-closed', () => {
    render(<DataQualityPanel assessment={null} error="Invalid nowMs" onAssess={vi.fn()} />);
    expect(screen.getByText(/Quality unavailable: Invalid nowMs/)).toBeInTheDocument();
  });

  it('dashboard assesses via the bridge when the quality surface exists', async () => {
    const assessQuality = vi.fn().mockResolvedValue({
      assessment: assessDataQuality({ snapshots: [], nowMs: 1_788_500_000_000 }),
    });
    window.osrsApi = {
      app: { getVersion: vi.fn() },
      market: { fetchTop10: vi.fn(), fetchHistory: vi.fn() },
      quality: { assessQuality },
    };
    render(<Dashboard status="success" opportunities={[]} itemsAnalyzed={0} />);
    fireEvent.click(screen.getByText('Assess quality'));
    expect(assessQuality).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Freshness/)).toBeInTheDocument();
  });

  it('dashboard falls back to the pure assessor with zero IPC when the bridge is absent', () => {
    window.osrsApi = undefined;
    render(<Dashboard status="success" opportunities={[]} itemsAnalyzed={0} />);
    fireEvent.click(screen.getByText('Assess quality'));
    expect(screen.getByText(/Freshness/)).toBeInTheDocument();
    expect(screen.getByText(/stale/)).toBeInTheDocument();
  });
});
