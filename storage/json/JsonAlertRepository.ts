import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AlertRepository } from '../../core/alerts/AlertRepository.js';
import { isValidAlertRule, type AlertRule } from '../../core/alerts/alertRules.js';
import { alertsFile } from '../paths.js';

/**
 * JSON alert-rule backend (roadmap Sprint 12 slice-2, part 1).
 * Layout: `<baseDir>/alerts.json`, one whole-list document.
 * Mirrors JsonWatchlistRepository: atomic writes (tmp + rename);
 * tolerant reads (missing/corrupt/non-array → [], invalid records
 * skipped); strict saves (invalid entries throw, previous good document
 * intact).
 *
 * Threshold note (review #118 non-gating nit): negative thresholds are
 * accepted — change24h/spreadPct legitimately span negative, and a
 * threshold of -5 with strict `>` is meaningful. No OS notification
 * surface here: persistence only, delivery stays in-app (roadmap §14).
 */
export class JsonAlertRepository implements AlertRepository {
  private readonly file: string;

  constructor(baseDir: string) {
    this.file = alertsFile(baseDir);
  }

  async load(): Promise<AlertRule[]> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(this.file, 'utf8'));
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) {
      return [];
    }
    // Tolerant read: skip invalid records, strip extra fields to
    // {id,itemId,kind,threshold,enabled,createdAt} parity with saves.
    // Duplicate ids: first-wins (same invariant as the watchlist store;
    // addAlertRule throws on duplicates for fresh writes).
    const seen = new Set<string>();
    const out: AlertRule[] = [];
    for (const record of parsed) {
      if (!isValidAlertRule(record)) {
        continue;
      }
      if (seen.has(record.id)) {
        continue;
      }
      seen.add(record.id);
      out.push({
        id: record.id,
        itemId: record.itemId,
        kind: record.kind,
        threshold: record.threshold,
        enabled: record.enabled,
        createdAt: record.createdAt,
      });
    }
    return out;
  }

  async save(rules: readonly AlertRule[]): Promise<void> {
    for (const rule of rules) {
      if (!isValidAlertRule(rule)) {
        throw new Error(`Invalid alert rule: ${JSON.stringify(rule)}`);
      }
    }
    const snapshot: AlertRule[] = rules.map((rule) => ({
      id: rule.id,
      itemId: rule.itemId,
      kind: rule.kind,
      threshold: rule.threshold,
      enabled: rule.enabled,
      createdAt: rule.createdAt,
    }));
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(`${this.file}.tmp`, JSON.stringify(snapshot), 'utf8');
    await rename(`${this.file}.tmp`, this.file);
  }
}
