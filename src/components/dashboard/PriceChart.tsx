import type { JSX } from 'react';
import type { MarketSnapshot } from '../../../core/market/normalization/normalizer.js';

export interface PriceChartProps {
  /** Oldest-first price points (MarketSnapshot shape, stub-first in slice-2). */
  points: MarketSnapshot[];
  itemName?: string;
  windowLabel?: string;
}

function pointPrice(p: MarketSnapshot): number | undefined {
  if (p.high !== undefined && p.low !== undefined) {
    return (p.high + p.low) / 2;
  }
  return p.high ?? p.low;
}

/**
 * Sprint 8 slice-2: pure SVG price chart (roadmap §10, guide §32).
 * Props-driven only — zero IPC, zero chart.js, zero network. The Dashboard
 * owns the getItemHistory fetch; this component only renders points.
 */
export default function PriceChart({ points, itemName, windowLabel }: PriceChartProps): JSX.Element {
  const prices = points.map(pointPrice);
  const finite = prices.filter((v): v is number => v !== undefined && Number.isFinite(v));
  if (points.length < 2 || finite.length < 2) {
    return <p className="placeholder">Not enough history to draw a chart.</p>;
  }
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min || 1;
  const width = 280;
  const height = 80;
  const coords = points.map((p, i) => {
    const price = pointPrice(p) ?? min;
    const x = (i / (points.length - 1)) * width;
    const y = height - ((price - min) / span) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const label = `Price history${itemName ? ` for ${itemName}` : ''}${windowLabel ? ` (${windowLabel})` : ''}`;
  return (
    <figure>
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
      >
        <polyline
          points={coords.join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
      <figcaption>
        {finite.length} points, {Math.round(min).toLocaleString()}–{Math.round(max).toLocaleString()} gp
      </figcaption>
    </figure>
  );
}
