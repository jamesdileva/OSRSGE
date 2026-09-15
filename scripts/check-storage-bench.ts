/**
 * S17 storage-bottleneck bench (roadmap §19, review #178).
 * Run with `npm run check:storage-bench` (full week) or
 * `npm run check:storage-bench -- --quick` (smoke: 12 pulls).
 * Manual measurement tool, NOT a test (tests stay fast/offline, guide §46).
 *
 * Method (per review #178 gates):
 * 1. Realistic bytes: every synthetic pull uses the full normalized
 *    snapshot shape (itemId/timestamp/high/low/highTime/lowTime/volume)
 *    at 4534 items/pull via `makeBenchSnapshot`.
 * 2. Retention honesty: the simulated week ends at now so all 2016 pulls
 *    sit inside the prod 7-day window; a prod-configured
 *    JsonHistoryRepository prune (default retentionDays) runs and the
 *    reported file-count/total reflects post-prune reality.
 * 3. Latency rigor: getItemHistory 7d-range + getLatestSnapshot over the
 *    full simulated week, temp-dir only, zero network/timers, >=20 repeats,
 *    reporting mean/p95 + min/max + env note.
 * 4. Verdict: SKIP unless 7d total > 1 GiB OR history p95 > 1000ms OR
 *    latest p95 > 500ms. No schema/migration/dep/interface change.
 */
import { mkdtemp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { cpus, totalmem } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { JsonHistoryRepository } from '../storage/json/JsonHistoryRepository.ts';
import {
  BENCH_ITEMS_PER_PULL,
  BENCH_PULL_INTERVAL_MS,
  BENCH_PULLS_PER_WEEK,
  evaluateStorageVerdict,
  makeBenchSnapshot,
  summarizeLatencies,
} from '../core/history/storageBench.ts';

const QUICK_PULLS = 12;
const REPEATS = 20;
const PROBE_ITEM_ID = 4151;
const DAY_MS = 24 * 60 * 60 * 1_000;

const quick = process.argv.includes('--quick');
const pullCount = quick ? QUICK_PULLS : BENCH_PULLS_PER_WEEK;

const nowMs = Date.now();
const newest = Math.floor(nowMs / BENCH_PULL_INTERVAL_MS) * BENCH_PULL_INTERVAL_MS;
const oldest = newest - (pullCount - 1) * BENCH_PULL_INTERVAL_MS;

const baseDir = await mkdtemp(path.join(tmpdir(), 'osrs-storage-bench-'));
try {
  // Write synthetic week directly in repository layout (one JSON batch per
  // pull). Per-batch saveSnapshots would pay an O(tree) prune scan per pull;
  // the prod prune runs once below, which is the behavior under test.
  const dayDirs = new Map<string, string>();
  let firstFileBytes = 0;
  const writeStart = performance.now();
  for (let p = 0; p < pullCount; p += 1) {
    const timestamp = oldest + p * BENCH_PULL_INTERVAL_MS;
    const batch = new Array(BENCH_ITEMS_PER_PULL);
    for (let itemId = 1; itemId <= BENCH_ITEMS_PER_PULL; itemId += 1) {
      batch[itemId - 1] = makeBenchSnapshot(itemId, timestamp, p);
    }
    const day = new Date(timestamp).toISOString().slice(0, 10);
    let dir = dayDirs.get(day);
    if (dir === undefined) {
      dir = path.join(baseDir, 'history', day);
      await mkdir(dir, { recursive: true });
      dayDirs.set(day, dir);
    }
    const json = JSON.stringify(batch);
    if (p === 0) {
      firstFileBytes = Buffer.byteLength(json, 'utf8');
    }
    await writeFile(path.join(dir, `${timestamp}.json`), json, 'utf8');
  }
  const writeMs = performance.now() - writeStart;

  // Retention honesty: prod-configured prune over the simulated tree.
  const repo = new JsonHistoryRepository(baseDir);
  const pruned = await repo.prune(Date.now() - 7 * DAY_MS);

  // File-count + total bytes post-prune.
  let fileCount = 0;
  let totalBytes = 0;
  const historyRoot = path.join(baseDir, 'history');
  for (const day of await readdir(historyRoot)) {
    const dir = path.join(historyRoot, day);
    for (const name of await readdir(dir)) {
      if (!name.endsWith('.json')) {
        continue;
      }
      fileCount += 1;
      totalBytes += (await stat(path.join(dir, name))).size;
    }
  }

  // Latency rigor: full-range history + latest, >=20 repeats each.
  const historySamples: number[] = [];
  for (let r = 0; r < REPEATS; r += 1) {
    const start = performance.now();
    const history = await repo.getItemHistory(PROBE_ITEM_ID, oldest, newest);
    historySamples.push(performance.now() - start);
    if (r === 0 && history.length !== pullCount) {
      throw new Error(`Expected ${pullCount} points for item ${PROBE_ITEM_ID}, got ${history.length}`);
    }
  }
  const latestSamples: number[] = [];
  for (let r = 0; r < REPEATS; r += 1) {
    const start = performance.now();
    const latest = await repo.getLatestSnapshot(PROBE_ITEM_ID);
    latestSamples.push(performance.now() - start);
    if (r === 0 && (latest === null || latest.timestamp !== newest)) {
      throw new Error('Latest snapshot mismatch on probe item');
    }
  }
  const historyStats = summarizeLatencies(historySamples);
  const latestStats = summarizeLatencies(latestSamples);
  const verdict = evaluateStorageVerdict(totalBytes, historyStats.p95, latestStats.p95);

  const fmt = (s: typeof historyStats): string =>
    `n=${s.count} mean=${s.mean.toFixed(1)}ms p95=${s.p95.toFixed(1)}ms min=${s.min.toFixed(1)}ms max=${s.max.toFixed(1)}ms`;

  console.log(`Mode: ${quick ? `quick (${pullCount} pulls, smoke only — no verdict)` : `full (${pullCount} pulls = 7d x 288/day @ 5min)`}`);
  console.log(`Bytes/snapshot assumption: full normalized shape (itemId/timestamp/high/low/highTime/lowTime/volume) at ${BENCH_ITEMS_PER_PULL} items/pull; first file ${firstFileBytes} bytes (~${(firstFileBytes / BENCH_ITEMS_PER_PULL).toFixed(1)} bytes/snapshot)`);
  console.log(`Write: ${pullCount} files in ${writeMs.toFixed(0)}ms (setup only, not gated)`);
  console.log(`Retention: prod 7-day prune removed ${pruned} files; post-prune files=${fileCount} total=${totalBytes} bytes (${(totalBytes / 1_073_741_824).toFixed(3)} GiB)`);
  console.log(`getItemHistory 7d #${PROBE_ITEM_ID}: ${fmt(historyStats)}`);
  console.log(`getLatestSnapshot #${PROBE_ITEM_ID}: ${fmt(latestStats)}`);
  console.log(`Env: node ${process.version} ${process.platform}/${process.arch} ${cpus()[0]?.model ?? 'unknown-cpu'} ${(totalmem() / 1_073_741_824).toFixed(1)}GiB RAM`);
  if (quick) {
    console.log('Verdict: n/a (quick smoke — run full bench for the gate verdict)');
  } else {
    console.log(
      verdict.migrate
        ? `Verdict: MIGRATE (${verdict.reasons.join('; ')})`
        : `Verdict: SKIP SQLite migration (${totalBytes} bytes <= 1GiB, history p95 ${historyStats.p95.toFixed(1)}ms <= 1000ms, latest p95 ${latestStats.p95.toFixed(1)}ms <= 500ms)`,
    );
  }
} finally {
  await rm(baseDir, { recursive: true, force: true });
}
