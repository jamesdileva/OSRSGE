import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FlipCalculatorPanel from '../../src/components/dashboard/FlipCalculatorPanel.tsx';
import Dashboard from '../../src/pages/Dashboard.tsx';
import { calcFlip } from '../../core/market/flips/flipCalculator.js';

afterEach(() => {
  cleanup();
  window.osrsApi = undefined;
  vi.restoreAllMocks();
});

describe('Sprint 13 slice-2 flip panel (pure + dashboard wiring)', () => {
  it('panel prompts for missing inputs without calling onCalculate', () => {
    const onCalculate = vi.fn();
    render(<FlipCalculatorPanel result={null} error={null} onCalculate={onCalculate} />);
    fireEvent.click(screen.getByText('Calculate'));
    expect(screen.getByText(/Enter a buy price/)).toBeInTheDocument();
    expect(onCalculate).not.toHaveBeenCalled();
  });

  it('panel reports the typed input and renders caps flags from the result', () => {
    const onCalculate = vi.fn();
    render(
      <FlipCalculatorPanel
        result={calcFlip({ buyPrice: 100, sellPrice: 120, quantity: 500, buyLimit: 100, availableCapital: 5000 })}
        error={null}
        onCalculate={onCalculate}
      />,
    );
    fireEvent.change(screen.getByLabelText('Buy price'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Sell price'), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '500' } });
    fireEvent.click(screen.getByText('Calculate'));
    expect(onCalculate).toHaveBeenCalledWith({ buyPrice: 100, sellPrice: 120, quantity: 500 });
    expect(screen.getByText(/50 of 500/)).toBeInTheDocument();
    expect(screen.getByText(/capped by buy limit/)).toBeInTheDocument();
    expect(screen.getByText(/capped by capital/)).toBeInTheDocument();
  });

  it('panel renders the unaffordable zero-quantity notice (not an error)', () => {
    render(
      <FlipCalculatorPanel
        result={calcFlip({ buyPrice: 1000, sellPrice: 1100, quantity: 10, availableCapital: 500 })}
        error={null}
        onCalculate={vi.fn()}
      />,
    );
    expect(screen.getByText(/Nothing affordable/)).toBeInTheDocument();
  });

  it('panel surfaces calculation errors fail-closed', () => {
    render(<FlipCalculatorPanel result={null} error="Invalid buyPrice" onCalculate={vi.fn()} />);
    expect(screen.getByText(/Flip unavailable: Invalid buyPrice/)).toBeInTheDocument();
  });

  it('dashboard calculates via the bridge when the flips surface exists', async () => {
    const calculateFlip = vi.fn().mockResolvedValue({
      result: calcFlip({ buyPrice: 1000, sellPrice: 1100, quantity: 10 }),
    });
    window.osrsApi = {
      app: { getVersion: vi.fn() },
      market: { fetchTop10: vi.fn(), fetchHistory: vi.fn() },
      flips: { calculateFlip },
    };
    render(<Dashboard status="success" opportunities={[]} itemsAnalyzed={0} />);
    fireEvent.change(screen.getByLabelText('Buy price'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('Sell price'), { target: { value: '1100' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '10' } });
    fireEvent.click(screen.getByText('Calculate'));
    expect(calculateFlip).toHaveBeenCalledWith({ input: { buyPrice: 1000, sellPrice: 1100, quantity: 10 } });
    expect(await screen.findByText(/890\.00 gp/)).toBeInTheDocument();
  });

  it('dashboard falls back to the pure calcFlip with zero IPC when the bridge is absent', () => {
    window.osrsApi = undefined;
    render(<Dashboard status="success" opportunities={[]} itemsAnalyzed={0} />);
    fireEvent.change(screen.getByLabelText('Buy price'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('Sell price'), { target: { value: '1100' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '10' } });
    fireEvent.click(screen.getByText('Calculate'));
    expect(screen.getByText(/890\.00 gp/)).toBeInTheDocument();
  });
});
