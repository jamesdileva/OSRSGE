import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BENCH_ITEMS_PER_PULL,
  BENCH_PULLS_PER_WEEK,
  evaluateStorageVerdict,
  makeBenchSnapshot,
  summarizeLatencies,
} from '../../core/history/storageBench.js';
import { JsonHistoryRepository } from '../../storage/json/JsonHistoryRepository.js';

const DAY_MS = 24 * 60 * 60 * 1_000;
const PULL_MS = 5 * 60 * 1_000;

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe('storageBench helpers', () => {
  it('emits full-shape normalized snapshots at live universe scale', () => {
    expect(BENCH_ITEMS_PER_PULL).toBe(4534);
    expect(BENCH_PULLS_PER_WEEK).toBe(2016);

    const snap = makeBenchSnapshot(4151, 1_784_000_000_000, 3);
    expect(snap).toMatchObject({ itemId: 4151, timestamp: 1_784_000_000_000 });
    // Full normalized shape — high/low sides, trade times, volume.
    expect(typeof snap.high).toBe('number');
    expect(typeof snap.low).toBe('number');
    expect(typeof snap.highTime).toBe('number');
    expect(typeof snap.lowTime).toBe('number');
    expect(typeof snap.volume).toBe('number');
    expect((snap.high as number) > (snap.low as number)).toBe(true);
  });

  it('summarizes latencies with mean/p95/min/max and rejects bad input', () => {
    const summary = summarizeLatencies([10, 20, 30]);
    expect(summary).toMatchObject({ count: 3, mean: 20, p95: 30, min: 10, max: 30 });

    // Nearest-rank p95 over 20 samples picks the max (ceil(0.95*20) = 19 -> index 18 of 20? rank 19).
    const twenty = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(summarizeLatencies(twenty).p95).toBe(19);

    expect(() => summarizeLatencies([])).toThrow();
    expect(() => summarizeLatencies([1, Number.NaN])).toThrow();
  });

  it('verdict skips unless a gate trips, naming each tripped gate', () => {
    expect(evaluateStorageVerdict(100, 100, 100)).toEqual({ migrate: false, reasons: [] });

    const overBytes = evaluateStorageVerdict(2_000_000_000, 100, 100);
    expect(overBytes.migrate).toBe(true);
    expect(overBytes.reasons).toHaveLength(1);

    const slow = evaluateStorageVerdict(100, 1_500, 600);
    expect(slow.migrate).toBe(true);
    expect(slow.reasons).toHaveLength(2);
  });

  it('small simulated week round-trips through the prod-prune repository path', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'osrs-bench-'));
    dirs.push(dir);
    const pulls = 4;
    const newest = Math.floor(Date.now() / PULL_MS) * PULL_MS;
    const oldest = newest - (pulls - 1) * PULL_MS;
    for (let p = 0; p < pulls; p += 1) {
      const timestamp = oldest + p * PULL_MS;
      const batch = [makeBenchSnapshot(4151, timestamp, p), makeBenchSnapshot(1, timestamp, p)];
      const dayDir = path.join(dir, 'history', new Date(timestamp).toISOString().slice(0, 10));
      await mkdir(dayDir, { recursive: true });
      await writeFile(path.join(dayDir, `${timestamp}.json`), JSON.stringify(batch), 'utf8');
    }

    const repo = new JsonHistoryRepository(dir);
    expect(await repo.prune(Date.now() - 7 * DAY_MS)).toBe(0);

    const history = await repo.getItemHistory(4151, oldest, newest);
    expect(history).toHaveLength(pulls);
    expect(await repo.getLatestSnapshot(4151)).toMatchObject({ timestamp: newest });
  });
});
