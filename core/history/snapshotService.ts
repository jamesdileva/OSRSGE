import type { HistoryRepository } from './HistoryRepository.js';
import type { MarketDataProvider } from '../market/providers/MarketDataProvider.js';
import { normalizeLatest } from '../market/normalization/normalizer.js';

/**
 * Refresh orchestration (guide §17, §42).
 * One refresh = fetch → normalize → persist. Concurrent callers share the
 * single in-flight refresh instead of triggering parallel API pulls.
 * Failures propagate to the caller (stale-data policy arrives with the
 * scheduler in Sprint 10); the lock is always released.
 */

export interface RefreshResult {
  snapshots: number;
  excluded: number;
  timestamp: number;
}

export class SnapshotService {
  private readonly provider: Pick<MarketDataProvider, 'getLatest'>;
  private readonly repository: HistoryRepository;
  private inFlight: Promise<RefreshResult> | null = null;

  constructor(
    provider: Pick<MarketDataProvider, 'getLatest'>,
    repository: HistoryRepository,
  ) {
    this.provider = provider;
    this.repository = repository;
  }

  refresh(): Promise<RefreshResult> {
    if (this.inFlight !== null) {
      return this.inFlight;
    }
    const pending = this.doRefresh();
    this.inFlight = pending;
    const release = (): void => {
      if (this.inFlight === pending) {
        this.inFlight = null;
      }
    };
    pending.then(release, release);
    return pending;
  }

  private async doRefresh(): Promise<RefreshResult> {
    const latest = await this.provider.getLatest();
    const batch = normalizeLatest(latest);
    await this.repository.saveSnapshots(batch.snapshots);
    return {
      snapshots: batch.snapshots.length,
      excluded: batch.excluded,
      timestamp: latest.fetchedAt,
    };
  }
}
