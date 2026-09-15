import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { HistoryRepository } from '../../core/history/HistoryRepository.js';
import type { MarketSnapshot } from '../../core/market/normalization/normalizer.js';

/**
 * SQLite history backend (S18 slice-1, roadmap §19 MIGRATE verdict).
 * Implements the verbatim `HistoryRepository` interface so analytics never
 * notices the swap — same contract as `JsonHistoryRepository`, different
 * engine: one `snapshots` table + one `batches` table instead of one JSON
 * file per pull.
 *
 * Driver: `node:sqlite` stdlib only (host node v24.14.1 verified
 * `esm-import-ok`; Electron 44 ships node v24.19 — same major, no native
 * dep, `better-sqlite3` deliberately NOT added: one driver max, zero new
 * deps). The Electron load gate runs at wiring time (slice-2): if
 * `import('node:sqlite')` ever rejects inside Electron, main keeps the JSON
 * backend — this module is never imported by main yet (JSON default, no
 * wiring in this slice).
 *
 * Parity with `JsonHistoryRepository` (deliberate, tested):
 * - empty batch is a no-op (no storage touched);
 * - batch timestamp already stored → skip (dedupe);
 * - successful save prunes batches older than the retention window;
 * - `getItemHistory` returns oldest-first within [from, to];
 * - `getLatestSnapshot` returns the newest row or null.
 *
 * Intentional divergence: corrupt-DB throws fail-closed (SQLite cannot
 * "skip" a corrupt page the way JSON skips a corrupt file — surfacing the
 * error beats silently serving partial history).
 *
 * Concurrency: single `DatabaseSync` connection, WAL mode, single writer.
 * `SnapshotService` already serializes refreshes; do not open two writers
 * on the same file (one repo instance per process). Call `close()` when
 * done (tests, scripts) to release the file handle.
 */

export interface SqliteHistoryOptions {
  /** Days of history to keep. Default 7 (matches JSON backend). */
  retentionDays?: number;
}

const DAY_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_RETENTION_DAYS = 7;

interface SnapshotRow {
  itemId: number;
  timestamp: number;
  high: number | null;
  low: number | null;
  highTime: number | null;
  lowTime: number | null;
  volume: number | null;
}

function toSnapshot(row: SnapshotRow): MarketSnapshot {
  const snapshot: MarketSnapshot = {
    itemId: row.itemId,
    timestamp: row.timestamp,
  };
  if (row.high !== null) {
    snapshot.high = row.high;
  }
  if (row.low !== null) {
    snapshot.low = row.low;
  }
  if (row.highTime !== null) {
    snapshot.highTime = row.highTime;
  }
  if (row.lowTime !== null) {
    snapshot.lowTime = row.lowTime;
  }
  if (row.volume !== null) {
    snapshot.volume = row.volume;
  }
  return snapshot;
}

export class SqliteHistoryRepository implements HistoryRepository {
  private readonly db: DatabaseSync;
  private readonly retentionDays: number;
  private closed = false;

  constructor(dbFile: string, opts: SqliteHistoryOptions = {}) {
    this.retentionDays = opts.retentionDays ?? DEFAULT_RETENTION_DAYS;
    mkdirSync(path.dirname(dbFile), { recursive: true });
    const db = new DatabaseSync(dbFile);
    try {
      // Throws "file is not a database" on corrupt files — fail-closed by
      // design (see module doc). Runs before any read/write.
      db.exec('PRAGMA journal_mode = WAL;');
      db.exec(
        `CREATE TABLE IF NOT EXISTS batches (
          timestamp INTEGER PRIMARY KEY
        );`,
      );
      db.exec(
        `CREATE TABLE IF NOT EXISTS snapshots (
          itemId INTEGER NOT NULL,
          timestamp INTEGER NOT NULL,
          high REAL,
          low REAL,
          highTime INTEGER,
          lowTime INTEGER,
          volume REAL,
          PRIMARY KEY (itemId, timestamp)
        );`,
      );
      // Composite (itemId, timestamp) index: covers the per-item range scan
      // and the newest-first lookup. The PRIMARY KEY already orders by it;
      // the explicit index names the gate dependency for review #182.
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_snapshots_item_time
          ON snapshots (itemId, timestamp);`,
      );
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp
          ON snapshots (timestamp);`,
      );
    } catch (err) {
      try {
        db.close();
      } catch {
        // Best-effort handle release; surface the original failure.
      }
      throw err;
    }
    this.db = db;
  }

  async saveSnapshots(snapshots: MarketSnapshot[]): Promise<void> {
    this.assertOpen();
    if (snapshots.length === 0) {
      return;
    }
    const timestamp = snapshots[0]?.timestamp ?? 0;
    const already = this.db
      .prepare('SELECT 1 FROM batches WHERE timestamp = ? LIMIT 1;')
      .get(timestamp);
    if (already !== undefined) {
      return; // Batch already stored — skip duplicates (JSON parity).
    }
    this.db.exec('BEGIN;');
    try {
      this.db.prepare('INSERT INTO batches (timestamp) VALUES (?);').run(timestamp);
      const insert = this.db.prepare(
        `INSERT OR IGNORE INTO snapshots
          (itemId, timestamp, high, low, highTime, lowTime, volume)
          VALUES (?, ?, ?, ?, ?, ?, ?);`,
      );
      for (const s of snapshots) {
        insert.run(
          s.itemId,
          s.timestamp,
          s.high ?? null,
          s.low ?? null,
          s.highTime ?? null,
          s.lowTime ?? null,
          s.volume ?? null,
        );
      }
      this.db.exec('COMMIT;');
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {
        // Rollback of a failed batch is best-effort; the original error
        // is the one callers must see.
      }
      throw err;
    }
    await this.prune(Date.now() - this.retentionDays * DAY_MS);
  }

  async getItemHistory(itemId: number, from: number, to: number): Promise<MarketSnapshot[]> {
    this.assertOpen();
    const rows = this.db
      .prepare(
        `SELECT itemId, timestamp, high, low, highTime, lowTime, volume
          FROM snapshots
          WHERE itemId = ? AND timestamp >= ? AND timestamp <= ?
          ORDER BY timestamp ASC;`,
      )
      .all(itemId, from, to) as unknown as SnapshotRow[];
    return rows.map(toSnapshot);
  }

  async getLatestSnapshot(itemId: number): Promise<MarketSnapshot | null> {
    this.assertOpen();
    const row = this.db
      .prepare(
        `SELECT itemId, timestamp, high, low, highTime, lowTime, volume
          FROM snapshots
          WHERE itemId = ?
          ORDER BY timestamp DESC
          LIMIT 1;`,
      )
      .get(itemId) as unknown as SnapshotRow | undefined;
    return row === undefined ? null : toSnapshot(row);
  }

  /**
   * Delete batches older than `beforeMs`. Returns the removed batch count
   * (mirrors `JsonHistoryRepository.prune`, which counts removed files).
   */
  async prune(beforeMs: number): Promise<number> {
    this.assertOpen();
    const stale = this.db
      .prepare('SELECT timestamp FROM batches WHERE timestamp < ?;')
      .all(beforeMs) as unknown as { timestamp: number }[];
    this.db.exec('BEGIN;');
    try {
      const deleteSnapshots = this.db.prepare('DELETE FROM snapshots WHERE timestamp < ?;');
      deleteSnapshots.run(beforeMs);
      const deleteBatches = this.db.prepare('DELETE FROM batches WHERE timestamp < ?;');
      deleteBatches.run(beforeMs);
      this.db.exec('COMMIT;');
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {
        // Best-effort; surface the original failure.
      }
      throw err;
    }
    return stale.length;
  }

  /** Release the file handle. The instance must not be used afterwards. */
  close(): void {
    if (!this.closed) {
      this.closed = true;
      this.db.close();
    }
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('SqliteHistoryRepository is closed');
    }
  }
}
