import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createAppLogger,
  getAppLogger,
  initAppLogger,
  resetAppLogger,
  setAppLogger,
} from '../../electron/services/appLogger.js';
import { createLoggingRefresh } from '../../electron/services/scheduler.js';
import { appLogFile } from '../../storage/paths.js';

const T0 = 1_786_000_000_000;

function stubNow(start: number = T0): () => number {
  let t = start;
  return () => t++;
}

const dirs: string[] = [];
afterEach(async () => {
  resetAppLogger();
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe('S19 slice-3a retained logger + scheduler refresh logging (offline)', () => {
  it('retains the module-level logger past init for pipeline callers', async () => {
    expect(getAppLogger()).toBeNull();
    const logger = initAppLogger({ now: stubNow() });
    expect(getAppLogger()).toBe(logger);
    await logger.log('info', 'startup', 'boot');
    // A pipeline caller reading the retained instance sees the same ring.
    expect(getAppLogger()?.getRecent().map((e) => e.message)).toEqual(['boot']);
    setAppLogger(null);
    expect(getAppLogger()).toBeNull();
  });

  it('set/reset swap the retained instance (tests, main restart)', () => {
    const a = createAppLogger({ now: stubNow() });
    const b = createAppLogger({ now: stubNow() });
    setAppLogger(a);
    expect(getAppLogger()).toBe(a);
    setAppLogger(b);
    expect(getAppLogger()).toBe(b);
    resetAppLogger();
    expect(getAppLogger()).toBeNull();
  });

  it('logs scheduler success into the retained memory ring', async () => {
    const logger = initAppLogger({ now: stubNow() });
    let innerCalls = 0;
    const refresh = createLoggingRefresh(logger, async () => {
      innerCalls += 1;
    });
    await refresh();
    expect(innerCalls).toBe(1);
    const recent = logger.getRecent();
    expect(recent).toHaveLength(1);
    expect(recent[0]?.level).toBe('info');
    expect(recent[0]?.category).toBe('scheduler');
    expect(recent[0]?.message).toBe('refresh succeeded');
  });

  it('logs scheduler failure as error/scheduler and rethrows (backoff preserved)', async () => {
    const logger = initAppLogger({ now: stubNow() });
    const refresh = createLoggingRefresh(logger, async () => {
      throw new Error('net down');
    });
    await expect(refresh()).rejects.toThrow('net down');
    const recent = logger.getRecent();
    expect(recent).toHaveLength(1);
    expect(recent[0]?.level).toBe('error');
    expect(recent[0]?.category).toBe('scheduler');
    expect(recent[0]?.message).toContain('net down');
  });

  it('is a pass-through with a null logger (bridge-absent safe)', async () => {
    let innerCalls = 0;
    await createLoggingRefresh(null, async () => {
      innerCalls += 1;
    })();
    expect(innerCalls).toBe(1);
    await expect(
      createLoggingRefresh(undefined, async () => {
        throw new Error('boom');
      })(),
    ).rejects.toThrow('boom');
  });

  it('cheapest disconfirm: refresh event lands in both memory ring and app.log', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'osrs-applog-retain-'));
    dirs.push(dir);
    const logger = initAppLogger({ baseDir: dir, now: stubNow() });
    await logger.log('info', 'startup', 'boot');
    await createLoggingRefresh(logger)();
    // Slice-3b: stub refresh (no inner pipeline) says so explicitly
    // (review #195 nit 1) — success-without-evidence must not read as real.
    expect(logger.getRecent().map((e) => e.message)).toEqual(['boot', 'refresh succeeded (stub, no pipeline)']);
    const text = await readFile(appLogFile(dir), 'utf8');
    expect(text).toContain('INFO startup: boot');
    expect(text).toContain('INFO scheduler: refresh succeeded (stub, no pipeline)');
  });
});
