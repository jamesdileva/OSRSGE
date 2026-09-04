import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { HistoryRepository } from '../../core/history/HistoryRepository.js';
import type { MarketSnapshot } from '../../core/market/normalization/normalizer.js';
import { historyDir } from '../paths.js';

/**
 * JSON history backend (roadmap Sprint 4).
 * Layout: `<baseDir>/history/<YYYY-MM-DD>/<epochMs>.json`, one file per pull.
 * Writes are atomic (tmp + rename); already-stored batch timestamps are
 * skipped; unreadable files are tolerated; batches older than the retention
 * window are pruned on save.
 */

export interface JsonHistoryOptions {
  /** Days of history to keep. Default 7. */
  retentionDays?: number;
}

const DAY_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_RETENTION_DAYS = 7;

function dayLabel(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function isSnapshot(value: unknown): value is MarketSnapshot {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.itemId === 'number' &&
    Number.isInteger(record.itemId) &&
    typeof record.timestamp === 'number' &&
    Number.isFinite(record.timestamp)
  );
}

export class JsonHistoryRepository implements HistoryRepository {
  private readonly root: string;
  private readonly retentionDays: number;

  constructor(baseDir: string, opts: JsonHistoryOptions = {}) {
    this.root = historyDir(baseDir);
    this.retentionDays = opts.retentionDays ?? DEFAULT_RETENTION_DAYS;
  }

  async saveSnapshots(snapshots: MarketSnapshot[]): Promise<void> {
    if (snapshots.length === 0) {
      return;
    }
    const timestamp = snapshots[0]?.timestamp ?? 0;
    const dir = path.join(this.root, dayLabel(timestamp));
    const file = path.join(dir, `${timestamp}.json`);
    try {
      await readFile(file, 'utf8');
      return; // Batch already stored — skip duplicates (architecture §21).
    } catch {
      // Not stored yet; fall through to write.
    }
    await mkdir(dir, { recursive: true });
    await writeFile(`${file}.tmp`, JSON.stringify(snapshots), 'utf8');
    await rename(`${file}.tmp`, file);
    await this.prune(Date.now() - this.retentionDays * DAY_MS);
  }

  async getItemHistory(itemId: number, from: number, to: number): Promise<MarketSnapshot[]> {
    const result: MarketSnapshot[] = [];
    for (const file of await this.filesInRange(from, to)) {
      for (const snapshot of await this.readBatch(file)) {
        if (
          snapshot.itemId === itemId &&
          snapshot.timestamp >= from &&
          snapshot.timestamp <= to
        ) {
          result.push(snapshot);
        }
      }
    }
    result.sort((a, b) => a.timestamp - b.timestamp);
    return result;
  }

  async getLatestSnapshot(itemId: number): Promise<MarketSnapshot | null> {
    const days = await this.listDays();
    days.sort().reverse();
    for (const day of days) {
      const files = await this.listBatchFiles(path.join(this.root, day));
      files.sort().reverse();
      for (const file of files) {
        for (const snapshot of await this.readBatch(file)) {
          if (snapshot.itemId === itemId) {
            return snapshot;
          }
        }
      }
    }
    return null;
  }

  /** Delete batch files older than `beforeMs`. Returns the removed count. */
  async prune(beforeMs: number): Promise<number> {
    let removed = 0;
    for (const day of await this.listDays()) {
      const dir = path.join(this.root, day);
      for (const file of await this.listBatchFiles(dir)) {
        const timestamp = Number(path.basename(file, '.json'));
        if (Number.isFinite(timestamp) && timestamp < beforeMs) {
          await rm(file, { force: true });
          removed += 1;
        }
      }
    }
    return removed;
  }

  private async filesInRange(from: number, to: number): Promise<string[]> {
    const files: string[] = [];
    for (const day of await this.listDays()) {
      const dayStart = Date.parse(`${day}T00:00:00.000Z`);
      if (!Number.isFinite(dayStart) || dayStart > to || dayStart + DAY_MS <= from) {
        continue;
      }
      for (const file of await this.listBatchFiles(path.join(this.root, day))) {
        const timestamp = Number(path.basename(file, '.json'));
        if (Number.isFinite(timestamp) && timestamp >= from && timestamp <= to) {
          files.push(file);
        }
      }
    }
    files.sort();
    return files;
  }

  private async listDays(): Promise<string[]> {
    try {
      const entries = await readdir(this.root, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }
  }

  private async listBatchFiles(dir: string): Promise<string[]> {
    try {
      const entries = await readdir(dir);
      return entries
        .filter((name) => name.endsWith('.json') && !name.endsWith('.tmp'))
        .map((name) => path.join(dir, name));
    } catch {
      return [];
    }
  }

  private async readBatch(file: string): Promise<MarketSnapshot[]> {
    try {
      const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter(isSnapshot);
    } catch {
      return [];
    }
  }
}
