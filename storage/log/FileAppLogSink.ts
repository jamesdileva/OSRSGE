import { Buffer } from 'node:buffer';
import { appendFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { formatLogEvent, type AppLogEvent } from '../../core/diagnostics/appLog.js';
import { appLogFile } from '../paths.js';

/**
 * Sprint 19 slice-2: append-only application-log file sink (guide §44).
 * Layout: `<baseDir>/logs/app.log`, one `formatLogEvent` line per event.
 * Single-writer discipline (main process only, S18 SQLite precedent):
 * no locking, no concurrent writers.
 *
 * Formatting truth stays in the pure core — the sink calls
 * `formatLogEvent`, so invalid events throw fail-closed BEFORE any
 * directory is created or byte is written.
 *
 * Rotation: when the pending line would push the file past
 * `maxFileBytes`, the current file moves to `app.log.1` (overwriting the
 * previous generation) and the line starts a fresh `app.log`. Two
 * generations max by design — this log answers "why didn't the rankings
 * update?", it is not an audit trail.
 *
 * What this module does NOT do (review #190 boundary):
 * - No history-backend touch: no repository or selector import.
 * - No in-memory ring: `electron/services/appLogger.ts` owns the buffer.
 * - No reads: summaries come from the memory buffer, never by parsing.
 */

export interface FileAppLogSinkOptions {
  /** Rotation cap in bytes. Default 512 KiB. Must be a positive integer. */
  maxFileBytes?: number;
}

/** Default rotation cap: 512 KiB per generation, 1 MiB total. */
export const DEFAULT_MAX_LOG_FILE_BYTES = 512 * 1024;

export class FileAppLogSink {
  private readonly file: string;
  private readonly maxFileBytes: number;

  constructor(baseDir: string, opts: FileAppLogSinkOptions = {}) {
    if (typeof baseDir !== 'string' || baseDir.length === 0) {
      throw new Error(`Invalid log baseDir: ${String(baseDir)}`);
    }
    const maxFileBytes = opts.maxFileBytes ?? DEFAULT_MAX_LOG_FILE_BYTES;
    if (!Number.isInteger(maxFileBytes) || maxFileBytes <= 0) {
      throw new Error(`Invalid maxFileBytes: ${String(maxFileBytes)}`);
    }
    this.file = appLogFile(baseDir);
    this.maxFileBytes = maxFileBytes;
  }

  async append(event: AppLogEvent): Promise<void> {
    // Fail-closed first: an invalid event throws before any fs touch.
    const line = formatLogEvent(event);
    await mkdir(path.dirname(this.file), { recursive: true });
    let size = 0;
    try {
      size = (await stat(this.file)).size;
    } catch {
      size = 0; // Missing file — starts fresh below.
    }
    const pending = Buffer.byteLength(line, 'utf8') + 1; // + trailing newline
    if (size > 0 && size + pending > this.maxFileBytes) {
      await rm(`${this.file}.1`, { force: true });
      try {
        await rename(this.file, `${this.file}.1`);
      } catch {
        // Source vanished between stat and rename — fall through and
        // append; the next append re-evaluates rotation.
      }
    }
    await appendFile(this.file, `${line}\n`, 'utf8');
  }
}
