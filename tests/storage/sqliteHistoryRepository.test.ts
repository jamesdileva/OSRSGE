import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type { MarketSnapshot } from '../../core/market/normalization/normalizer.js';
import { JsonHistoryRepository } from '../../storage/json/JsonHistoryRepository.js';
import { SqliteHistoryRepository } from '../../storage/sqlite/SqliteHistoryRepository.js';
import { historyDbFile } from '../../storage/paths.js';

const DAY_MS = 24 * 60 * 60 * 1_000;
const NOW = Date.now();
const HOUR = 60 * 60 * 1_000;

function snap(itemId: number, timestamp: number, high = 100): MarketSnapshot {
  return { itemId, timestamp, high, low: high - 10 };
}

async function makeDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'osrs-sqlite-history-'));
}

const dirs: string[] = [];
const repos: SqliteHistoryRepository[] = [];
afterEach(async () => {
  while (repos.length > 0) {
    repos.pop()?.close();
  }
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function freshRepo(retentionDays = 36500): Promise<{ repo: SqliteHistoryRepository; dir: string }> {
  const dir = await makeDir();
  dirs.push(dir);
  const repo = new SqliteHistoryRepository(historyDbFile(dir), { retentionDays });
  repos.push(repo);
  return { repo, dir };
}

describe('SqliteHistoryRepository', () => {
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

    // Empty save touches no batches: reads stay null/empty.
    expect(await repo.getLatestSnapshot(7)).toBeNull();
    expect(historyDbFile(dir)).toContain('history.db');
  });

  it('skips batches whose timestamp is already stored', async () => {
    const { repo } = await freshRepo();
    const batch = [snap(7, NOW - HOUR)];

    await repo.saveSnapshots(batch);
    await repo.saveSnapshots(batch);

    expect(await repo.getItemHistory(7, 0, NOW)).toHaveLength(1);
  });

  it('prunes batches older than the retention window', async () => {
    // Default retention keeps the old batch on save; an explicit 7-day
    // cutoff then removes exactly one batch (JSON prune parity).
    const { repo } = await freshRepo();
    const oldTs = NOW - 30 * DAY_MS;
    await repo.saveSnapshots([snap(7, oldTs)]);

    const removed = await repo.prune(NOW - 7 * DAY_MS);

    expect(removed).toBe(1);
    expect(await repo.getLatestSnapshot(7)).toBeNull();
  });

  it('round-trips optional fields through NULL without inventing values', async () => {
    const { repo } = await freshRepo();
    const ts = NOW - HOUR;
    const partial: MarketSnapshot = { itemId: 7, timestamp: ts, high: 500 };
    await repo.saveSnapshots([partial]);

    expect(await repo.getLatestSnapshot(7)).toEqual(partial);
  });

  it('matches the JSON backend on the same batches (parity)', async () => {
    const dir = await makeDir();
    dirs.push(dir);
    const json = new JsonHistoryRepository(path.join(dir, 'json'), { retentionDays: 36500 });
    const { repo: sqlite } = await freshRepo();
    const t1 = NOW - 3 * HOUR;
    const t2 = NOW - 2 * HOUR;
    const batches = [
      [snap(7, t1), snap(8, t1)],
      [snap(7, t2, 110), snap(8, t2, 210)],
    ];
    for (const batch of batches) {
      await json.saveSnapshots(batch);
      await sqlite.saveSnapshots(batch);
    }

    for (const itemId of [7, 8, 9]) {
      expect(await sqlite.getItemHistory(itemId, 0, NOW)).toEqual(
        await json.getItemHistory(itemId, 0, NOW),
      );
      expect(await sqlite.getLatestSnapshot(itemId)).toEqual(
        await json.getLatestSnapshot(itemId),
      );
    }
  });

  it('creates the composite (itemId, timestamp) index', async () => {
    const { repo, dir } = await freshRepo();
    await repo.saveSnapshots([snap(7, NOW - HOUR)]);
    repo.close();
    repos.splice(repos.indexOf(repo), 1);

    const probe = new DatabaseSync(historyDbFile(dir));
    try {
      const indexes = probe
        .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index';")
        .all() as unknown as { name: string; sql: string | null }[];
      const composite = indexes.find((i) => i.name === 'idx_snapshots_item_time');
      expect(composite).toBeDefined();
      expect(composite?.sql ?? '').toContain('itemId');
      expect(composite?.sql ?? '').toContain('timestamp');
    } finally {
      probe.close();
    }
  });

  it('throws fail-closed on a corrupt database file', async () => {
    const dir = await makeDir();
    dirs.push(dir);
    const dbFile = historyDbFile(dir);
    await writeFile(dbFile, 'not sqlite{{{', 'utf8');

    expect(() => new SqliteHistoryRepository(dbFile)).toThrow();
  });

  it('refuses use after close (single-writer handle discipline)', async () => {
    const { repo } = await freshRepo();
    await repo.saveSnapshots([snap(7, NOW - HOUR)]);
    repo.close();
    repos.splice(repos.indexOf(repo), 1);

    await expect(repo.getLatestSnapshot(7)).rejects.toThrow('closed');
    await expect(repo.saveSnapshots([snap(7, NOW)])).rejects.toThrow('closed');
  });
});
