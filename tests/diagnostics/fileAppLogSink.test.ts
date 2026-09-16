import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLogEvent, formatLogEvent } from '../../core/diagnostics/appLog.js';
import { FileAppLogSink } from '../../storage/log/FileAppLogSink.js';
import { appLogFile } from '../../storage/paths.js';

const T0 = 1_786_000_000_000;

async function makeDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'osrs-applog-'));
}

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function freshSink(opts?: { maxFileBytes?: number }): Promise<{ sink: FileAppLogSink; dir: string }> {
  const dir = await makeDir();
  dirs.push(dir);
  return { sink: new FileAppLogSink(dir, opts), dir };
}

describe('FileAppLogSink (S19 slice-2, offline)', () => {
  it('rejects bad construction fail-closed', () => {
    expect(() => new FileAppLogSink('')).toThrow('baseDir');
    expect(() => new FileAppLogSink('/base', { maxFileBytes: 0 })).toThrow('maxFileBytes');
    expect(() => new FileAppLogSink('/base', { maxFileBytes: 1.5 })).toThrow('maxFileBytes');
  });

  it('appends formatted lines under logs/app.log in order', async () => {
    const { sink, dir } = await freshSink();
    const first = createLogEvent(T0, 'info', 'startup', 'boot');
    const second = createLogEvent(T0 + 1, 'error', 'api-failure', 'timeout', { tries: 2 });
    await sink.append(first);
    await sink.append(second);
    const text = await readFile(appLogFile(dir), 'utf8');
    expect(text).toBe(`${formatLogEvent(first)}\n${formatLogEvent(second)}\n`);
  });

  it('throws on invalid events before touching the filesystem', async () => {
    const { sink, dir } = await freshSink();
    const bogus = { timestampMs: Number.NaN, level: 'info', category: 'startup', message: 'x' } as never;
    await expect(sink.append(bogus)).rejects.toThrow('timestampMs');
    await expect(stat(appLogFile(dir))).rejects.toThrow();
  });

  it('rotates to app.log.1 once the cap would be exceeded', async () => {
    const { sink, dir } = await freshSink({ maxFileBytes: 120 });
    const first = createLogEvent(T0, 'info', 'startup', 'first-line');
    const firstLine = `${formatLogEvent(first)}\n`;
    expect(firstLine.length).toBeLessThanOrEqual(120);
    await sink.append(first);
    const second = createLogEvent(T0 + 1, 'warn', 'scheduler', 'second-line-triggers-rotation');
    await sink.append(second);
    const main = await readFile(appLogFile(dir), 'utf8');
    const rotated = await readFile(`${appLogFile(dir)}.1`, 'utf8');
    expect(rotated).toBe(firstLine);
    expect(main).toBe(`${formatLogEvent(second)}\n`);
  });

  it('keeps at most two generations across repeated rotations', async () => {
    const { sink, dir } = await freshSink({ maxFileBytes: 120 });
    for (let i = 0; i < 4; i += 1) {
      await sink.append(createLogEvent(T0 + i, 'info', 'snapshots', `pull-${i}-fills-the-cap`));
    }
    const main = await readFile(appLogFile(dir), 'utf8');
    const rotated = await readFile(`${appLogFile(dir)}.1`, 'utf8');
    expect(main.split('\n').filter((l) => l.length > 0)).toHaveLength(1);
    expect(rotated.split('\n').filter((l) => l.length > 0)).toHaveLength(1);
  });
});
