import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { MarketSnapshot } from '../../core/market/normalization/normalizer.js';
import { JsonHistoryRepository } from '../../storage/json/JsonHistoryRepository.js';

const DAY_MS = 24 * 60 * 60 * 1_000;
const NOW = Date.now();
const HOUR = 60 * 60 * 1_000;

function snap(itemId: number, timestamp: number, high = 100): MarketSnapshot {
  return { itemId, timestamp, high, low: high - 10 };
}

async function makeDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'osrs-history-'));
}

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function freshRepo(retentionDays = 36500): Promise<{ repo: JsonHistoryRepository; dir: string }> {
  const dir = await makeDir();
  dirs.push(dir);
  return { repo: new JsonHistoryRepository(dir, { retentionDays }), dir };
}

async function countFiles(dir: string): Promise<number> {
  const out: string[] = [];
  const walk = async (d: string): Promise<void> => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.name.endsWith('.json')) {
        out.push(full);
      }
    }
  };
  try {
    await walk(path.join(dir, 'history'));
  } catch {
    return 0;
  }
  return out.length;
}

describe('JsonHistoryRepository', () => {
  it('round-trips a batch and filters history by item and range', async () => {
    const { repo } = await freshRepo();
    const t1 = NOW - 3 * HOUR;
    const t2 = NOW - 2 * HOUR;
    const t3 = NOW - HOUR;
    await repo.saveSnapshots([snap(7, t1), snap(8, t1)]);
    await repo.saveSnapshots([snap(7, t2, 110), snap(8, t2, 210)]);
    await repo.saveSnapshots([snap(7, t3, 120)]);

    const history = await repo.getItemHistory(7, t1, t2);
    expect(history.map((s) => s.timestamp)).toEqual([t1, t2]);
    expect(history[1]?.high).toBe(110);

    const other = await repo.getItemHistory(8, t1, t3);
    expect(other).toHaveLength(2);
    expect(await repo.getItemHistory(9, t1, t3)).toEqual([]);
  });

  it('returns the newest snapshot per item', async () => {
    const { repo } = await freshRepo();
    await repo.saveSnapshots([snap(7, NOW - 2 * HOUR, 100)]);
    await repo.saveSnapshots([snap(7, NOW - HOUR, 150)]);

    expect(await repo.getLatestSnapshot(7)).toMatchObject({ high: 150 });
    expect(await repo.getLatestSnapshot(999)).toBeNull();
  });

  it('ignores empty batches without creating storage', async () => {
    const { repo, dir } = await freshRepo();

    await repo.saveSnapshots([]);

    expect(await countFiles(dir)).toBe(0);
    expect(await repo.getLatestSnapshot(7)).toBeNull();
  });

  it('skips batches whose timestamp is already stored', async () => {
    const { repo, dir } = await freshRepo();
    const batch = [snap(7, NOW - HOUR)];

    await repo.saveSnapshots(batch);
    await repo.saveSnapshots(batch);

    expect(await countFiles(dir)).toBe(1);
    expect(await repo.getItemHistory(7, 0, NOW)).toHaveLength(1);
  });

  it('prunes batches older than the retention window', async () => {
    const dir = await makeDir();
    dirs.push(dir);
    const repo = new JsonHistoryRepository(dir, { retentionDays: 7 });
    const oldTs = NOW - 30 * DAY_MS;
    const dayDir = path.join(dir, 'history', new Date(oldTs).toISOString().slice(0, 10));
    await mkdir(dayDir, { recursive: true });
    await writeFile(path.join(dayDir, `${oldTs}.json`), JSON.stringify([snap(7, oldTs)]), 'utf8');

    const removed = await repo.prune(NOW - 7 * DAY_MS);

    expect(removed).toBe(1);
    expect(await repo.getLatestSnapshot(7)).toBeNull();
  });

  it('tolerates corrupt batch files instead of failing reads', async () => {
    const dir = await makeDir();
    dirs.push(dir);
    const repo = new JsonHistoryRepository(dir);
    const ts = NOW - HOUR;
    const dayDir = path.join(dir, 'history', new Date(ts).toISOString().slice(0, 10));
    await mkdir(dayDir, { recursive: true });
    await writeFile(path.join(dayDir, `${ts}.json`), 'not json{{{', 'utf8');

    await expect(repo.getItemHistory(7, 0, NOW)).resolves.toEqual([]);
    await expect(repo.getLatestSnapshot(7)).resolves.toBeNull();
  });
});
