import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_LOG_ENTRIES, type AppLogEvent } from '../../core/diagnostics/appLog.js';
import { createAppLogger } from '../../electron/services/appLogger.js';
import { appLogFile } from '../../storage/paths.js';

const T0 = 1_786_000_000_000;

function stubNow(start: number = T0): () => number {
  let t = start;
  return () => t++;
}

async function makeDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'osrs-applogger-'));
}

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe('createAppLogger (S19 slice-2, offline)', () => {
  it('rejects bad maxEntries fail-closed', () => {
    expect(() => createAppLogger({ maxEntries: 0 })).toThrow('maxEntries');
    expect(() => createAppLogger({ maxEntries: 1.5 })).toThrow('maxEntries');
  });

  it('buffers memory-only entries with ring cap and summary', async () => {
    const logger = createAppLogger({ now: stubNow(), maxEntries: 2 });
    await logger.log('info', 'startup', 'boot');
    await logger.log('error', 'api-failure', 'timeout');
    await logger.log('info', 'snapshots', 'saved 3');
    const recent = logger.getRecent();
    expect(recent.map((e) => e.message)).toEqual(['timeout', 'saved 3']);
    const summary = logger.getSummary();
    expect(summary.total).toBe(2);
    expect(summary.byLevel.error).toBe(1);
    expect(summary.lastError?.message).toBe('timeout');
    expect(logger.getRecent()).not.toBe(recent); // fresh array per call
  });

  it('throws on invalid log inputs with the buffer unchanged', async () => {
    const logger = createAppLogger({ now: stubNow() });
    await logger.log('info', 'startup', 'ok');
    await expect(logger.log('info', 'startup', '   ')).rejects.toThrow('message');
    await expect(logger.log('debug' as never, 'startup', 'x')).rejects.toThrow('level');
    expect(logger.getRecent()).toHaveLength(1);
  });

  it('persists through the file sink when baseDir is set', async () => {
    const dir = await makeDir();
    dirs.push(dir);
    const logger = createAppLogger({ baseDir: dir, now: stubNow() });
    await logger.log('info', 'startup', 'boot');
    const text = await readFile(appLogFile(dir), 'utf8');
    expect(text).toContain('INFO startup: boot');
    expect(logger.getSummary().total).toBe(1);
  });

  it('records sink failures as memory-only storage errors without throwing', async () => {
    const failing = {
      append: async (_event: AppLogEvent): Promise<void> => {
        throw new Error('disk full');
      },
    };
    const logger = createAppLogger({ sink: failing, now: stubNow() });
    const event = await logger.log('info', 'api-refresh', 'pull');
    expect(event.message).toBe('pull'); // original event returned
    const recent = logger.getRecent();
    expect(recent).toHaveLength(2);
    expect(recent[1]?.level).toBe('error');
    expect(recent[1]?.category).toBe('storage');
    expect(recent[1]?.message).toContain('disk full');
    expect(logger.getSummary().byCategory['storage']).toBe(1);
  });

  it('uses the default 500-entry ring', async () => {
    const logger = createAppLogger({ now: stubNow() });
    for (let i = 0; i < MAX_LOG_ENTRIES + 1; i += 1) {
      await logger.log('info', 'scheduler', `tick-${i}`);
    }
    const recent = logger.getRecent();
    expect(recent).toHaveLength(MAX_LOG_ENTRIES);
    expect(recent[0]?.message).toBe('tick-1');
  });
});
