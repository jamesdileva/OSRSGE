import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { HistoryRepository } from '../../core/history/HistoryRepository.js';
import { JsonHistoryRepository } from '../../storage/json/JsonHistoryRepository.js';
import {
  closeHistoryRepository,
  createHistoryRepository,
} from '../../storage/historyBackend.js';

async function makeDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'osrs-history-backend-'));
}

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

function stubRepository(): HistoryRepository {
  return {
    saveSnapshots: async () => {},
    getItemHistory: async () => [],
    getLatestSnapshot: async () => null,
  };
}

describe('historyBackend selector (S18 slice-2, offline-pure)', () => {
  it('uses SQLite when the loader resolves', async () => {
    const dir = await makeDir();
    dirs.push(dir);
    const sqlite = stubRepository();

    const result = await createHistoryRepository(dir, {
      loadSqlite: () => sqlite,
    });

    expect(result.backend).toBe('sqlite');
    expect(result.repository).toBe(sqlite);
  });

  it('falls back to JSON when the loader rejects (node:sqlite missing)', async () => {
    const dir = await makeDir();
    dirs.push(dir);

    const result = await createHistoryRepository(dir, {
      loadSqlite: () => Promise.reject(new Error('no node:sqlite here')),
    });

    expect(result.backend).toBe('json');
    expect(result.repository).toBeInstanceOf(JsonHistoryRepository);
    expect(await result.repository.getLatestSnapshot(4151)).toBeNull();
  });

  it('falls back to JSON when SQLite construction throws (corrupt DB)', async () => {
    const dir = await makeDir();
    dirs.push(dir);

    const result = await createHistoryRepository(dir, {
      loadSqlite: () => {
        throw new Error('file is not a database');
      },
    });

    expect(result.backend).toBe('json');
    expect(result.repository).toBeInstanceOf(JsonHistoryRepository);
  });

  it('close helper releases closable backends and ignores JSON', async () => {
    const dir = await makeDir();
    dirs.push(dir);
    let closed = 0;
    const closable = { ...stubRepository(), close: () => { closed += 1; } };

    closeHistoryRepository(closable);
    expect(closed).toBe(1);

    // JSON repositories have no close handle — must not throw.
    const json = new JsonHistoryRepository(dir);
    expect(() => closeHistoryRepository(json)).not.toThrow();
  });
});
