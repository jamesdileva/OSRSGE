import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonAlertRepository } from '../../storage/json/JsonAlertRepository.js';
import type { AlertRule } from '../../core/alerts/alertRules.js';

const T0 = 1_700_000_000_000;

function rule(id: string, overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id,
    itemId: 4151,
    kind: 'finalScore',
    threshold: 80,
    enabled: true,
    createdAt: T0,
    ...overrides,
  };
}

async function makeDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'osrs-alerts-'));
}

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function freshRepo(): Promise<{ repo: JsonAlertRepository; dir: string }> {
  const dir = await makeDir();
  dirs.push(dir);
  return { repo: new JsonAlertRepository(dir), dir };
}

describe('JsonAlertRepository (S12 slice-2 part 1, offline-pure)', () => {
  it('loads [] when nothing is stored', async () => {
    const { repo } = await freshRepo();
    await expect(repo.load()).resolves.toEqual([]);
  });

  it('round-trips rules in insertion order and overwrites on save', async () => {
    const { repo } = await freshRepo();
    await repo.save([rule('whip-score'), rule('rune-change', { itemId: null, kind: 'change24h', threshold: 5 })]);
    await expect(repo.load()).resolves.toEqual([
      rule('whip-score'),
      rule('rune-change', { itemId: null, kind: 'change24h', threshold: 5 }),
    ]);
    await repo.save([rule('rune-change', { itemId: null, kind: 'change24h', threshold: 5 })]);
    await expect(repo.load()).resolves.toEqual([
      rule('rune-change', { itemId: null, kind: 'change24h', threshold: 5 }),
    ]);
  });

  it('tolerates corrupt, non-array, and invalid-record files (first-wins on dup ids)', async () => {
    const { repo, dir } = await freshRepo();
    await writeFile(path.join(dir, 'alerts.json'), '{not json', 'utf8');
    await expect(repo.load()).resolves.toEqual([]);
    await writeFile(path.join(dir, 'alerts.json'), '{"id":"r1"}', 'utf8');
    await expect(repo.load()).resolves.toEqual([]);
    await writeFile(
      path.join(dir, 'alerts.json'),
      JSON.stringify([
        rule('r1'),
        { id: '', itemId: 4151, kind: 'finalScore', threshold: 80, enabled: true, createdAt: T0 },
        { id: 'r2', itemId: -2, kind: 'finalScore', threshold: 80, enabled: true, createdAt: T0 },
        { id: 'r1', itemId: 560, kind: 'spreadPct', threshold: 10, enabled: true, createdAt: T0 + 1 },
        'junk',
        null,
      ]),
      'utf8',
    );
    // Duplicate r1 keeps the first occurrence; invalid records skipped.
    await expect(repo.load()).resolves.toEqual([rule('r1')]);
  });

  it('strips extra fields and accepts negative thresholds (review #118 clarification)', async () => {
    const { repo, dir } = await freshRepo();
    await writeFile(
      path.join(dir, 'alerts.json'),
      JSON.stringify([
        { ...rule('neg', { kind: 'change24h', threshold: -5 }), extra: 'drop-me' },
      ]),
      'utf8',
    );
    await expect(repo.load()).resolves.toEqual([rule('neg', { kind: 'change24h', threshold: -5 })]);
  });

  it('leaves no .tmp file behind and refuses to persist invalid rules', async () => {
    const { repo, dir } = await freshRepo();
    await repo.save([rule('r1')]);
    expect(await readdir(dir)).not.toContain('alerts.json.tmp');
    await expect(
      repo.save([{ ...rule('bad'), threshold: Number.NaN }]),
    ).rejects.toThrow();
    // Failed save leaves the previous good document intact.
    await expect(repo.load()).resolves.toEqual([rule('r1')]);
  });
});
