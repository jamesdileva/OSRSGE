# agents.md — Sprint Worklog

Running history of what was built, decided, and verified. Newest sprint first.
Rule: no sprint is merged unless `npm test`, `npm run typecheck`, and
`npm run build` are all green.

## Sprint 6 (slice 2) — Scorer, risk, confidence + scenarios A/B/C (2026-09-13)

**Goal:** first legitimate ranking math on top of the slice-1 contracts
(review #16 gate was CLEAR).

**Did:**
- `core/market/ranking/scorer.ts`: pure deterministic scorer —
  `momentumScore` (50+5× weighted-avg change, 1h:1/6h:2/24h:3),
  `spreadScore` (pct×20), `profitabilityScore` ((pct−1% tax)×25),
  `volatilityOpportunityScore` (Gaussian peak 2% σ2%),
  liquidity/consistency passthrough; `scoreComponents`, `computeBaseScore`
  (throws on invalid weights), `estimatedProfitPerUnit` (spread − 1% tax),
  `defaultRankingConfig` (100GP/any-activity/6h), `isCandidate` filter,
  `rankOpportunities` (filter → score → risk×confidence → sort → rank).
- `core/market/ranking/risk.ts`: `classifyRisk` (5 warning signals,
  thin history forces HIGH) + `riskMultiplier` (1.0/0.9/0.7, throws unknown).
- `core/market/ranking/confidence.ts`: `computeConfidence`
  (coverage×observations×agreement×freshness, 0–1) + `confidenceMultiplier`
  (0.70+conf×0.30) + `freshnessFactor` (fresh <2h, 0 at 48h).
- `weights.ts`: content-aware versions (`0.1-<preset>-m..l..s..p..c..v..`,
  unknown preset throws) + `Object.freeze` on every preset and the record;
  `isValidWeights` accepts `Readonly` shares.
- `types.ts`: added `RankableCandidate` filter-input contract.
- Tests: 18 new (85 total) — risk (5), confidence (4), scorer components (4)
  + roadmap scenarios A (high score, LOW/MED), B (HIGH, final<0.6×base),
  C (strong, LOW), A-outranks-B head-to-head, CHEAP_FLIPS filter-vs-weight
  (sub-100GP junk never surfaces).

**Decisions:**
- Missing metric inputs score 0 (no evidence = no opportunity); confidence
  only penalizes known weakness (unknown factors neutral) to avoid
  double-punishing hourly-bucket items with legitimately absent 1h windows.
- Profitability nets an assumed 1% GE-tax bite; multipliers/versions are
  starting values for backtest tuning, not optima.
- Cheapness stays a filter: `isCandidate` drops <minPrice before scoring,
  so CHEAP_FLIPS weights can lean spread/profit without surfacing junk.

**Verified:**
- `npm test` → 21 files, 85/85 pass (zero network).
- `npm run typecheck` → clean. `npm run build` → clean.

**Commit:** `Sprint 6 (slice 2): scorer, risk, confidence, and ranking scenarios`

## Sprint 6 (slice 1) — Ranking weights, presets, opportunity contract (2026-09-12)

**Goal:** start ranking (roadmap scoring) with contracts + weights only —
no scorer math yet (deferred to slice 2 per review #14 gate).

**Did:**
- `core/market/ranking/types.ts`: pure contracts — `RankingWeights`,
  `RankingConfig` (minPrice 100 GP default, minVolume, minHistoryMinutes),
  `ComponentScores` (six 0–100 components), `Opportunity` UI contract
  (rank/item/currentPrice/changes/spread/components/estimatedProfit/
  risk/confidence 0–1/baseScore/finalScore), `RiskLevel`, 5 preset names.
- `core/market/ranking/weights.ts`: `DEFAULT_WEIGHTS` baseline
  (Momentum 30 / Liquidity 20 / Spread 20 / Profitability 15 /
  Consistency 10 / Volatility 5) + 5 presets (BALANCED/CONSERVATIVE/
  AGGRESSIVE/CHEAP_FLIPS/HIGH_PROFIT, all summing to 1.0);
  `isValidWeights` (finite, [0,1], sum≈1), `resolveWeights` (defensive copy),
  `rankingVersionForPreset` → `0.1-<preset>` placeholder (content-aware
  version + Readonly freeze deferred to slice 2).
- Tests: `tests/ranking/weights.test.ts` — 5 tests (baseline, all-presets
  valid, copy-on-resolve, invalid-share rejection, unknown-preset throw).

**Decisions:**
- Slice-1 is contracts-only by design: scorer.ts/risk.ts/confidence.ts
  stay absent until the pushed base + docs land (review #14).
- Cheapness stays a filter, not a weight — CHEAP_FLIPS leans into
  spread + profitability instead (guide §54).
- Guide-deviation noted in code: `Opportunity` carries all six component
  scores plus raw spread gp/percent (guide §31 sketch omits spread from
  metrics but §32 breakdown needs it).

**Verified:**
- `npm test`, `npm run typecheck`, `npm run build` green at commit time.
- Pushed `dbf52eb` to `origin/main` (was ahead-1; now in sync) — unblocks
  slice-2 scorer/risk/confidence + scenarios A/B/C.

**Commit:** `Sprint 6 (slice 1): ranking weights, presets, and opportunity contract`

## Sprint 5 — Analytics Engine (2026-09-07)

**Goal:** turn snapshots into useful metrics (roadmap §7).

**Did:**
- Provider: `getFiveMinute(timestamp?)` + `getHourly(timestamp?)` returning
  `AveragesSnapshot` (single bulk request per call; shared private fetcher).
  Bulk `/1h` shape verified live: `{data: {"2": {avgHighPrice,
  highPriceVolume, avgLowPrice, lowPriceVolume}}, timestamp}` (~290KB/pull).
- `normalizeAverages`: bucket averages → `MarketSnapshot` with `volume` =
  high+low trade counts (0 kept — meaningful), timestamp = bucket start ms.
- `core/market/analytics/`: pure `snapshotPrice` (midpoint + fallback) +
  `findClosestSnapshot` (tolerance alignment); `priceChanges` (1h/6h/24h,
  tolerances 15m/1h/3h); `spread` (high−low over midpoint, verified Wiki
  semantics: high = instant-buy/ask, low = instant-sell/bid); `volatility`
  (population stddev of simple returns, trailing 24h, min 4 points);
  `liquidity` (trailing-24h volume-sum percentile vs universe);
  `trendConsistency` (sign agreement weighted 1h:1/6h:2/24h:3, needs ≥2
  windows); `computeMetrics` orchestrator → `ItemMetrics` (scoring fields
  left for Sprint 6).
- `scripts/check-analytics.ts` + `npm run check:analytics`: backfills 24
  hourly buckets, prints real metrics for #4151 + universe liquidity.
- Tests: 24 new (62 total) — every metric unit-tested on synthetic data
  per roadmap, plus averages parse/URL-timestamp/malformed fixtures.

**Decisions:**
- Per scoping answers: midpoint+fallback price series; 24-request backfill
  demo; time-based 24h volatility window; 24h volume-sum liquidity percentile.
- `1h=n/a` on hourly buckets is correct behavior, not a bug: bucket-start
  points sit ~30+ min from the rolling 1h target, outside the 15-min
  tolerance — the guard working as designed.
- `getLatestSnapshot`-style single-item reads unchanged; liquidity universe
  is caller-assembled (no repository change).

**Verified:**
- `npm test` → 17 files, 62/62 pass (zero network).
- `npm run typecheck` → clean. `npm run build` → clean. `npm run lint` → clean.
- `npm run check:analytics` (live): 24/24 buckets, 4168-item universe,
  whip price 806507.5, 6h +0.16%, 24h −1.47%, spread 12149gp (1.51%),
  volatility 0.0068, liquidity 70.0/100, trend 60.0/100.

**Commit:** `Sprint 5: Analytics engine`

## Sprint 4 — Local Historical Storage (2026-09-04)

**Goal:** accumulate useful data — close and reopen without losing history
(roadmap §6).

**Did:**
- `core/history/HistoryRepository.ts`: guide §15 interface verbatim
  (`saveSnapshots`/`getItemHistory`/`getLatestSnapshot`).
- `storage/json/JsonHistoryRepository.ts`: `<baseDir>/history/<YYYY-MM-DD>/
  <epochMs>.json`, one file per pull. Atomic writes (tmp + rename),
  timestamp-exists dedupe skip, corrupt files tolerated, 7-day retention
  prune on save (constructor-configurable).
- `core/history/snapshotService.ts`: fetch → normalize → persist with a
  refresh lock — concurrent callers share one in-flight promise (guide §42),
  lock always released, failures propagate.
- `storage/paths.ts`: `defaultBaseDir()` mirroring Electron `userData`
  conventions (APPDATA / Application Support / XDG) + `historyDir()`.
  All node APIs via explicit `node:` imports — no tsconfig change needed.
- `scripts/check-market.ts`: persists each live pull and prints the previous
  run's #4151 snapshot — the close/reopen proof.
- Tests: 11 new (38 total) — round-trip + item/range filtering, newest-wins,
  empty-save no-op, dedupe skip, retention prune, corrupt tolerance,
  refresh counts/persistence, single-flight lock, lock release on failure,
  path conventions. Temp-dir backed, zero network.

**Decisions:**
- Timestamped batch files (not per-item files): matches architecture §20's
  daily grouping, one write per pull, trivial range scans for MVP volumes.
  ~140MB/day at full pull size → documents the Sprint 17 SQLite trigger.
- Retention default 7 days; "already stored" (not deep-compare) dedupe.
- `getLatestSnapshot` scans newest-first and returns on first hit.

**Verified:**
- `npm test` → 10 files, 38/38 pass (zero network).
- `npm run typecheck` → clean. `npm run build` → clean. `npm run lint` → clean.
- `npm run check:market` twice: run 1 `previous #4151: none (first run)`,
  run 2 `previous #4151: high=805569 @ 2026-09-04T01:29:44Z` — persistence
  across processes proven.
- Fixed during verification: tests caught a real bug — day dir must be
  created before writing the tmp file; also fixed three wrong-depth
  `../` imports (tsc caught what vite silently resolved).

**Commit:** `Sprint 4: Local historical storage`

## Sprint 3 — Normalization (2026-09-04)

**Goal:** cut the cord — nothing past this layer sees Wiki shapes, `null`s,
or untrusted numbers (roadmap §5).

**Did:**
- `core/market/normalization/normalizer.ts`: pure `normalizeEntry` +
  `normalizeLatest` producing the architecture §11 `MarketSnapshot`
  (`itemId/timestamp/high?/low?/highTime?/lowTime?/volume?`).
- Rules: provider `null` → `undefined`; non-positive/non-finite price side →
  `undefined`, record excluded (counted) only if both sides missing; invalid
  `highTime`/`lowTime` (≤0 or beyond fetch time + 5min skew) dropped while
  valid times are kept independently of their price side; `timestamp` =
  provider `fetchedAt`; unknown IDs pass through (snapshots stay ID-keyed,
  names resolve at view-model time); `volume` stays `undefined` for `/latest`.
- `scripts/check-market.ts`: now also prints normalized kept/excluded counts.
- Tests: 9 new (27 total) — valid, high-only, low-only, zero/negative sides,
  both-missing exclusion, bad-time tolerance, unknown-ID passthrough,
  invalidRecords carry-over, malformed-envelope rejection at provider boundary.

**Decisions:**
- Per scoping answers: partial snapshots kept (side → `undefined`), time
  fields judged independently of prices, exclusion only when both sides missing.
- `invalidRecords` from the provider seed the normalizer `excluded` count —
  one continuous rejection tally from HTTP to model.

**Verified:**
- `npm test` → 7 files, 27/27 pass (zero network).
- `npm run typecheck` → clean. `npm run build` → clean. `npm run lint` → clean.
- `npm run check:market` (live): `Normalized: 4534 snapshots kept,
  0 excluded` — full real-world pull normalizes losslessly.
- Fixed during verification: two test expectations wrongly assumed a valid
  `highTime` is dropped with its price side — code correctly keeps them
  independent.

**Commit:** `Sprint 3: Latest-price normalization`

## Sprint 2 — Market Data Provider (2026-09-04)

**Goal:** retrieve real OSRS GE data through a validated, provider-independent
layer (roadmap §4).

**Did:**
- `shared/constants.ts`: v2 base URL, descriptive `User-Agent` (Wiki policy),
  timeout/retry policy constants.
- `core/market/providers/httpClient.ts`: sole HTTP layer — 10s timeout via
  `AbortSignal`, 1 retry on timeout/network-error/5xx/429 (never other 4xx),
  typed `HttpError(status, retryable)`, injectable `fetch` for tests.
- `core/market/providers/schemas.ts`: zod v2-API schemas (`unknown` →
  validated; `z.infer` raw types). Loose envelopes + per-entry `safeParse`
  so one bad record can never fail a whole refresh.
- `core/market/providers/MarketDataProvider.ts`: minimal interface —
  `getLatest()` + `getMapping()` with `invalidRecords` counts.
- `core/market/providers/WikiPriceProvider.ts`: answers only "what did the
  API say?" Single bulk request per call, no per-item loops.
- `core/items/itemMetadata.ts`: `ItemMetadataStore` — lazy in-memory
  catalogue (`getItem`/`getAllItems`/`getItemName` with `Item N` fallback,
  `refresh()`), one `/mapping` fetch per process lifetime.
- `scripts/check-market.ts` + `npm run check:market` live verification script
  (manual tool, not a test — suite stays offline-pure).
- Tests: 11 new (18 total) — UA header, 500-retry, 404-no-retry,
  network-error recovery/retry-exhaustion, latest nulls/zeroes/invalid-count,
  mapping limits/tolerance, malformed envelope, metadata caching/fallback/refresh.

**Decisions:**
- Built against **v2 API** (`/api/v2/osrs`) — guides assumed v1 shapes.
  Verified live: `/latest` nullable high/low; `/mapping` carries buy limits;
  **trade volumes are real** (`high/lowPriceVolume` on timeseries buckets) —
  resolves architecture §9; bulk history via `/5m`+`/1h` deferred to Sprint 5.
- zod for validation (guide §12); `core`+`shared`+`scripts` typechecked via
  `tsconfig.app.json` (DOM lib covers fetch/AbortSignal/console; no node APIs).
- Deviation from plan: added `vite-node` devDependency — vitest 5 no longer
  ships the bin, so `check:market` needs it.
- Fixed during verification: test import depth (`../../` not `../../../`);
  misplaced `bogus` fixture key (was outside `data`, undercounting invalids).

**Verified:**
- `npm test` → 6 files, 18/18 pass (zero network).
- `npm run typecheck` → clean. `npm run build` → clean. `npm run lint` → clean.
- `npm run check:market` (live): `Items received: 4534`, fresh timestamp,
  `API status: OK (invalid records skipped: 0)`, whip #4151 high=810554
  low=790549, `Metadata: 4662 items; #4151 = Abyssal whip`.

**Commit:** `Sprint 2: Wiki price provider + item metadata`

## Sprint 1 — Electron + React Foundation (2026-09-04)

**Goal:** secure desktop shell — Electron opens, React renders, typed IPC round-trips.

**Did:**
- Scaffolded Vite react-ts baseline (React 19, Vite 8, TS 6 strict, oxlint kept).
- Renamed `architecture(2).md` → `architecture.md`,
  `implementation-guide(2).md` → `implementation-guide.md`.
- Added `package.json` scripts: `dev`, `dev:electron`, `build`, `build:electron`,
  `test`, `typecheck`, `lint`; `electron-builder.yml` stub; `README.md`.
- Electron main process: `electron/main.ts` (lifecycle, dev-URL vs packaged-dist
  loading, DevTools in dev only), `electron/window.ts` (secure-flags factory),
  `electron/preload.ts` (exposes only `window.osrsApi`), `electron/ipc/app.handlers.ts`
  (single `app:getVersion` channel), `electron/services/application.ts` +
  `scheduler.ts` (stubs marking Sprint 10 territory).
- Shared contract: `shared/ipc.ts` (channel constants + `OsrsApi` types).
- React shell: `AppLayout`/`Sidebar`/`Header`, `Dashboard` placeholder with
  idle/loading/success/error states (guide §35), `services/electronApi.ts` as the
  sole bridge accessor, `types/window.d.ts`, theme styles. Renderer works in plain
  browser dev mode with an explicit "bridge unavailable" notice.
- Tests (Vitest + jsdom + RTL, 7 total): IPC channel contract + handler wiring,
  BrowserWindow security flags, App render / IPC success / bridge-absent / IPC-error.

**Decisions:**
- npm (per user choice); Electron Latest stable → installed v44.1.1.
- `window.osrsApi` typed **optional**: honest about dual browser/Electron dev mode.
- Electron TS compiled via `tsconfig.electron.json` (nodenext, emits to
  `dist-electron/`); renderer via `tsconfig.app.json` (bundler, noEmit).
- Fixed during verification: RTL has no auto-cleanup without Vitest globals
  (added explicit `cleanup()`), removed sync `setState` in effect (oxlint).

**Verified:**
- `npm test` → 3 files, 7/7 pass.
- `npm run typecheck` → clean. `npm run build` → clean (22 modules, dist/ + dist-electron/).
- `npm run lint` → clean.
- Live Electron run #1 (no dev server): window opened, stayed alive 45s; only
  error was expected `ERR_CONNECTION_REFUSED` for the dev URL.
- Live Electron run #2 (against `vite preview` of the production build): window
  opened, loaded renderer with **zero console errors**, stayed alive until killed.
- Pending on a dev machine with a display: eyeball `npm run dev:electron`
  (DevTools open, version line shows `0.1.0`).

**Commit:** `Sprint 1: Electron + React foundation with secure IPC v0`
