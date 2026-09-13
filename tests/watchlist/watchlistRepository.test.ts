import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonWatchlistRepository } from '../../storage/json/JsonWatchlistRepository.js';

const T0 = 1_700_000_000_000;

async function makeDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'osrs-watchlist-'));
}

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function freshRepo(): Promise<{ repo: JsonWatchlistRepository; dir: string }> {
  const dir = await makeDir();
  dirs.push(dir);
  return { repo: new JsonWatchlistRepository(dir), dir };
}

describe('JsonWatchlistRepository', () => {
  it('loads [] when nothing is stored', async () => {
    const { repo } = await freshRepo();
    await expect(repo.load()).resolves.toEqual([]);
  });

  it('round-trips entries in insertion order and overwrites on save', async () => {
    const { repo } = await freshRepo();
    await repo.save([
      { itemId: 4151, addedAt: T0 },
      { itemId: 560, addedAt: T0 + 1 },
    ]);
    await expect(repo.load()).resolves.toEqual([
      { itemId: 4151, addedAt: T0 },
      { itemId: 560, addedAt: T0 + 1 },
    ]);
    await repo.save([{ itemId: 560, addedAt: T0 + 1 }]);
    await expect(repo.load()).resolves.toEqual([{ itemId: 560, addedAt: T0 + 1 }]);
  });

  it('tolerates corrupt, non-array, and invalid-record files', async () => {
    const { repo, dir } = await freshRepo();
    await writeFile(path.join(dir, 'watchlist.json'), '{not json', 'utf8');
    await expect(repo.load()).resolves.toEqual([]);
    await writeFile(path.join(dir, 'watchlist.json'), '{"itemId":4151}', 'utf8');
    await expect(repo.load()).resolves.toEqual([]);
    await writeFile(
      path.join(dir, 'watchlist.json'),
      JSON.stringify([
        { itemId: 4151, addedAt: T0 },
        { itemId: -2, addedAt: T0 },
        { itemId: 560 },
        'junk',
        null,
      ]),
      'utf8',
    );
    await expect(repo.load()).resolves.toEqual([{ itemId: 4151, addedAt: T0 }]);
  });

  it('leaves no .tmp file behind and refuses to persist invalid entries', async () => {
    const { repo, dir } = await freshRepo();
    await repo.save([{ itemId: 4151, addedAt: T0 }]);
    expect(await readdir(dir)).not.toContain('watchlist.json.tmp');
    await expect(repo.save([{ itemId: -2, addedAt: T0 }])).rejects.toThrow();
    // Failed save leaves the previous good document intact.
    await expect(repo.load()).resolves.toEqual([{ itemId: 4151, addedAt: T0 }]);
  });
});
