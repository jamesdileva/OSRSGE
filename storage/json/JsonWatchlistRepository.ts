import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { WatchlistRepository } from '../../core/watchlist/WatchlistRepository.js';
import { isValidWatchlistEntry, type WatchlistEntry } from '../../core/watchlist/watchlist.js';
import { watchlistFile } from '../paths.js';

/**
 * JSON watchlist backend (roadmap Sprint 11 slice-1).
 * Layout: `<baseDir>/watchlist.json`, one whole-list document.
 * Writes are atomic (tmp + rename, mirroring JsonHistoryRepository);
 * reads are tolerant — missing/corrupt/non-array files load as empty
 * and invalid records are skipped. Saves are strict: invalid entries
 * throw rather than persist garbage.
 */
export class JsonWatchlistRepository implements WatchlistRepository {
  private readonly file: string;

  constructor(baseDir: string) {
    this.file = watchlistFile(baseDir);
  }

  async load(): Promise<WatchlistEntry[]> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(this.file, 'utf8'));
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) {
      return [];
    }
    // Tolerant read with store-invariant enforcement: skip invalid records,
    // strip extra fields to {itemId, addedAt} parity with strict saves, and
    // dedupe repeat ids first-watch-wins (same invariant as addToWatchlist).
    const seen = new Set<number>();
    const out: WatchlistEntry[] = [];
    for (const record of parsed) {
      if (!isValidWatchlistEntry(record)) {
        continue;
      }
      if (seen.has(record.itemId)) {
        continue;
      }
      seen.add(record.itemId);
      out.push({ itemId: record.itemId, addedAt: record.addedAt });
    }
    return out;
  }

  async save(entries: readonly WatchlistEntry[]): Promise<void> {
    for (const entry of entries) {
      if (!isValidWatchlistEntry(entry)) {
        throw new Error(`Invalid watchlist entry: ${JSON.stringify(entry)}`);
      }
    }
    const snapshot: WatchlistEntry[] = entries.map((entry) => ({ itemId: entry.itemId, addedAt: entry.addedAt }));
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(`${this.file}.tmp`, JSON.stringify(snapshot), 'utf8');
    await rename(`${this.file}.tmp`, this.file);
  }
}
