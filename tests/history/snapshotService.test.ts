import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SnapshotService } from '../../core/history/snapshotService.js';
import type { MarketDataProvider } from '../../core/market/providers/MarketDataProvider.js';
import { JsonHistoryRepository } from '../../storage/json/JsonHistoryRepository.js';

const FETCHED_AT = 1_788_483_735_882;

const LATEST = {
  entries: {
    4151: { high: 100, highTime: 1788483777, low: 90, lowTime: 1788483014 },
    2: { high: null, highTime: null, low: null, lowTime: null },
  },
  fetchedAt: FETCHED_AT,
  invalidRecords: 2,
};

type LatestStub = Pick<MarketDataProvider, 'getLatest'>;

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function setup(
  latest: unknown = LATEST,
): Promise<{ service: SnapshotService; getLatest: ReturnType<typeof vi.fn>; repo: JsonHistoryRepository }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'osrs-service-'));
  dirs.push(dir);
  const repo = new JsonHistoryRepository(dir, { retentionDays: 36500 });
  const getLatest = vi.fn().mockResolvedValue(latest);
  const provider: LatestStub = { getLatest };
  return { service: new SnapshotService(provider, repo), getLatest, repo };
}

describe('SnapshotService', () => {
  it('refreshes provider → normalizer → repository and reports counts', async () => {
    const { service, repo } = await setup();

    const result = await service.refresh();

    expect(result).toEqual({ snapshots: 1, excluded: 3, timestamp: FETCHED_AT });
    expect(await repo.getLatestSnapshot(4151)).toMatchObject({ high: 100, timestamp: FETCHED_AT });
  });

  it('shares one in-flight refresh between concurrent callers', async () => {
    const { service, getLatest } = await setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    getLatest.mockImplementation(() => gate.then(() => LATEST));

    const first = service.refresh();
    const second = service.refresh();
    release();
    const [a, b] = await Promise.all([first, second]);

    expect(getLatest).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('releases the lock after a failure so the next refresh retries', async () => {
    const { service, getLatest } = await setup();
    getLatest.mockRejectedValueOnce(new Error('API down'));

    await expect(service.refresh()).rejects.toThrow('API down');
    const result = await service.refresh();

    expect(getLatest).toHaveBeenCalledTimes(2);
    expect(result.snapshots).toBe(1);
  });
});
