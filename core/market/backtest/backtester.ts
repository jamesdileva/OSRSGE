/**
 * Sprint 14 slice-1: pure backtesting core (roadmap §16, arch §31, guide §§49–50).
 * Pure — no fs, no IPC, no scheduler, no UI, no network, no Date.now.
 *
 * Scope contract (slice-1):
 * - Settles caller-supplied picks against caller-supplied price series and
 *   summarizes the settled trades with the roadmap §16 metrics (average /
 *   median return, win rate, max drawdown, false-positive rate, hit rate).
 * - `runRankedBacktest` drives the guide §50 loop (rank at T → top N →
 *   simulate entry → measure later price) with ranking injected as a
 *   `rankAt(timeMs)` callback. No-future-leak holds by construction: the
 *   core only ever passes the evaluation time T to `rankAt` and only reads
 *   series points at/after T + horizon for settlement — but building a
 *   past-only view for `rankAt` stays the caller's job (slice-2 wires the
 *   real scorer over time-sliced snapshots).
 * - Returns are simple percent moves, `(exit − entry) / entry × 100`.
 *   Losses stay negative (no zero floor, S13 precedent).
 * - `falsePositiveRate` and `hitRate` are complements by definition
 *   (losers / settled vs winners / settled, ties count as losers) — both
 *   fields kept so the roadmap §16 metric list maps 1:1 (S13 ROI /
 *   capital-efficiency precedent).
 * - `maxDrawdown` runs over the additive equity curve of settled-trade
 *   returns in (exitTime, entryTime, itemId) order, floored at 0. Additive,
 *   not compounding — documented so a later compounding variant stays an
 *   explicit, separate choice.
 * - Strict on invalid: non-finite timestamps/prices, non-positive prices,
 *   non-integer/negative item ids, non-finite/non-positive horizon, and
 *   negative/non-finite tolerance all throw. Never clamps garbage silently.
 * - Unsettled picks (no series, or no in-tolerance point at/after the exit
 *   target) are counted and skipped — sparse history yields fewer trades,
 *   not an error.
 * - Frozen-input safe: inputs are only read, never mutated; outputs are
 *   fresh objects.
 * - Later slices own snapshots/IPC/persistence/UI and weight comparison
 *   (S15); the S6 no-profit rho 0.9819 watch resolves once weight variants
 *   run through this harness.
 */

/** One observed price at an explicit timestamp (ms). */
export interface BacktestPricePoint {
  timestamp: number;
  price: number;
}

/** A ranked selection simulated as entered at T for `entryPrice`. */
export interface BacktestPick {
  itemId: number;
  entryTime: number;
  entryPrice: number;
}

/** A settled pick with its measured outcome. */
export interface BacktestTrade {
  itemId: number;
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  /** Simple percent move: (exit − entry) / entry × 100. Negative on losses. */
  returnPct: number;
  /** True when returnPct > 0; ties count as losses (fail-closed). */
  win: boolean;
}

/** Roadmap §16 summary over settled trades. Empty trade lists → all zeros. */
export interface BacktestSummary {
  tradeCount: number;
  avgReturn: number;
  medianReturn: number;
  /** Winners / settled. */
  winRate: number;
  /** Max peak-to-trough decline of the additive equity curve, >= 0. */
  maxDrawdown: number;
  /** Losers / settled = 1 − winRate (ties are losers). */
  falsePositiveRate: number;
  /** Winners / settled — complement of falsePositiveRate, kept for the §16 map. */
  hitRate: number;
}

/** Settled trades plus the count of picks skipped for lack of future data. */
export interface SettledBacktest {
  trades: BacktestTrade[];
  unsettled: number;
}

/** Full ranked-backtest outcome: every settled trade plus its summary. */
export interface RankedBacktestResult extends SettledBacktest {
  summary: BacktestSummary;
}

function assertPricePoint(point: BacktestPricePoint, label: string): void {
  if (!Number.isFinite(point.timestamp) || !Number.isFinite(point.price)) {
    throw new Error(`${label} must carry finite timestamp and price`);
  }
  if (!(point.price > 0)) {
    throw new Error(`${label} price must be positive`);
  }
}

function assertPick(pick: BacktestPick): void {
  if (!Number.isInteger(pick.itemId) || !(pick.itemId >= 0)) {
    throw new Error('Backtest pick itemId must be a non-negative integer');
  }
  if (!Number.isFinite(pick.entryTime) || !Number.isFinite(pick.entryPrice)) {
    throw new Error('Backtest pick must carry finite entryTime and entryPrice');
  }
  if (!(pick.entryPrice > 0)) {
    throw new Error('Backtest pick entryPrice must be positive');
  }
}

function assertHorizon(horizonMs: number, toleranceMs: number): void {
  if (!Number.isFinite(horizonMs) || !(horizonMs > 0)) {
    throw new Error('Backtest horizonMs must be a finite positive duration');
  }
  if (!Number.isFinite(toleranceMs) || !(toleranceMs >= 0)) {
    throw new Error('Backtest toleranceMs must be a finite non-negative duration');
  }
}

/**
 * Settle picks against future series points. For each pick the exit target
 * is `entryTime + horizonMs`; the exit is the earliest series point at/after
 * the target within `toleranceMs`. Picks with no series or no in-tolerance
 * future point are counted in `unsettled` and skipped.
 */
export function settlePicks(
  picks: readonly BacktestPick[],
  pricesByItem: ReadonlyMap<number, readonly BacktestPricePoint[]>,
  horizonMs: number,
  toleranceMs: number = horizonMs,
): SettledBacktest {
  assertHorizon(horizonMs, toleranceMs);
  const trades: BacktestTrade[] = [];
  let unsettled = 0;
  for (const pick of picks) {
    assertPick(pick);
    const series = pricesByItem.get(pick.itemId);
    if (series === undefined) {
      unsettled += 1;
      continue;
    }
    const target = pick.entryTime + horizonMs;
    let exit: BacktestPricePoint | null = null;
    for (const point of series) {
      assertPricePoint(point, 'Backtest series point');
      if (point.timestamp >= target && (exit === null || point.timestamp < exit.timestamp)) {
        exit = point;
      }
    }
    if (exit === null || exit.timestamp - target > toleranceMs) {
      unsettled += 1;
      continue;
    }
    const returnPct = ((exit.price - pick.entryPrice) / pick.entryPrice) * 100;
    trades.push({
      itemId: pick.itemId,
      entryTime: pick.entryTime,
      entryPrice: pick.entryPrice,
      exitTime: exit.timestamp,
      exitPrice: exit.price,
      returnPct,
      win: returnPct > 0,
    });
  }
  trades.sort(
    (a, b) => a.exitTime - b.exitTime || a.entryTime - b.entryTime || a.itemId - b.itemId,
  );
  return { trades, unsettled };
}

/** Summarize settled trades with the roadmap §16 metrics. */
export function summarizeTrades(trades: readonly BacktestTrade[]): BacktestSummary {
  const empty: BacktestSummary = {
    tradeCount: 0,
    avgReturn: 0,
    medianReturn: 0,
    winRate: 0,
    maxDrawdown: 0,
    falsePositiveRate: 0,
    hitRate: 0,
  };
  if (trades.length === 0) {
    return empty;
  }
  const returns = trades.map((trade) => {
    if (!Number.isFinite(trade.returnPct)) {
      throw new Error('Backtest trade returnPct must be finite');
    }
    return trade.returnPct;
  });
  const wins = trades.filter((trade) => trade.win).length;
  const avgReturn = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const sorted = [...returns].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const medianReturn =
    sorted.length % 2 === 1
      ? (sorted[middle] as number)
      : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
  const winRate = wins / trades.length;
  let peak = 0;
  let equity = 0;
  let maxDrawdown = 0;
  for (const value of returns) {
    equity += value;
    if (equity > peak) {
      peak = equity;
    }
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }
  return {
    tradeCount: trades.length,
    avgReturn,
    medianReturn,
    winRate,
    maxDrawdown,
    falsePositiveRate: 1 - winRate,
    hitRate: winRate,
  };
}

export interface RankedBacktestInput {
  /** Ascending evaluation times T; each is passed verbatim to `rankAt`. */
  evaluationTimes: readonly number[];
  horizonMs: number;
  toleranceMs?: number;
  /** Caller-owned ranking over past-only data (no future leak by contract). */
  rankAt: (timeMs: number) => readonly BacktestPick[];
  pricesByItem: ReadonlyMap<number, readonly BacktestPricePoint[]>;
}

/**
 * Guide §50 loop: at each T call `rankAt(T)`, then settle every pick at
 * T + horizon and summarize. `rankAt` picks must be entered at their
 * evaluation time — picks from other times throw (fail-closed ordering).
 */
export function runRankedBacktest(input: RankedBacktestInput): RankedBacktestResult {
  const toleranceMs = input.toleranceMs ?? input.horizonMs;
  assertHorizon(input.horizonMs, toleranceMs);
  const all: BacktestPick[] = [];
  for (const timeMs of input.evaluationTimes) {
    if (!Number.isFinite(timeMs)) {
      throw new Error('Backtest evaluationTimes must be finite timestamps');
    }
    const picks = input.rankAt(timeMs);
    for (const pick of picks) {
      assertPick(pick);
      if (pick.entryTime !== timeMs) {
        throw new Error('Backtest rankAt picks must be entered at their evaluation time');
      }
      all.push({ itemId: pick.itemId, entryTime: pick.entryTime, entryPrice: pick.entryPrice });
    }
  }
  const settled = settlePicks(all, input.pricesByItem, input.horizonMs, toleranceMs);
  return { ...settled, summary: summarizeTrades(settled.trades) };
}
