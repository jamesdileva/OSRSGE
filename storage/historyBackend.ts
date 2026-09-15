import type { HistoryRepository } from '../core/history/HistoryRepository.js';
import { JsonHistoryRepository } from './json/JsonHistoryRepository.js';
import { historyDbFile } from './paths.js';

/**
 * History-backend selector (S18 slice-2, roadmap §19 MIGRATE verdict).
 * Single place that decides SQLite vs JSON so the live entry points
 * (`scripts/check-market.ts` now, Electron main when the live pipeline
 * lands) never branch on the backend themselves.
 *
 * Load gate: the SQLite module (which statically imports `node:sqlite`)
 * is reached only through a dynamic `import()`. Wherever `node:sqlite`
 * is missing — or the stored DB is corrupt and the constructor throws
 * fail-closed — the import/construction rejects and this falls back to
 * the JSON backend. Analytics never notices: both implement the verbatim
 * `HistoryRepository` interface.
 *
 * Single-writer discipline carries over from `SqliteHistoryRepository`:
 * one repository instance per process; call `closeHistoryRepository`
 * when done (no-op for JSON, releases the file handle for SQLite).
 */

export type HistoryBackendName = 'sqlite' | 'json';

export interface HistoryBackendResult {
  repository: HistoryRepository;
  backend: HistoryBackendName;
}

export interface HistoryBackendDeps {
  /** Defaults to dynamically importing + constructing the SQLite backend. */
  loadSqlite?: (dbFile: string) => Promise<HistoryRepository> | HistoryRepository;
  /** Defaults to constructing the JSON backend on the same baseDir. */
  createJson?: (baseDir: string) => HistoryRepository;
}

async function defaultLoadSqlite(dbFile: string): Promise<HistoryRepository> {
  const mod = await import('./sqlite/SqliteHistoryRepository.js');
  return new mod.SqliteHistoryRepository(dbFile);
}

export async function createHistoryRepository(
  baseDir: string,
  deps: HistoryBackendDeps = {},
): Promise<HistoryBackendResult> {
  const createJson = deps.createJson ?? ((dir: string) => new JsonHistoryRepository(dir));
  const loadSqlite = deps.loadSqlite ?? defaultLoadSqlite;
  try {
    const repository = await loadSqlite(historyDbFile(baseDir));
    return { repository, backend: 'sqlite' };
  } catch {
    // Corrupt DB, missing node:sqlite, read-only dir — JSON stays the
    // always-available fallback (tolerant reads, same interface).
    return { repository: createJson(baseDir), backend: 'json' };
  }
}

/** Release the backend handle when done. Safe to call for either backend. */
export function closeHistoryRepository(repository: HistoryRepository): void {
  const maybeClosable = repository as unknown as { close?: unknown };
  if (typeof maybeClosable.close === 'function') {
    (maybeClosable as unknown as { close: () => void }).close();
  }
}
