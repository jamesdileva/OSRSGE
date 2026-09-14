# agents.md — Sprint Worklog

Running history of what was built, decided, and verified. Newest sprint first.
Rule: no sprint is merged unless `npm test`, `npm run typecheck`, and
`npm run build` are all green.

## Sprint 14 (slice 2) — Scorer-over-snapshots backtest harness, past-only (2026-09-14)

**Goal:** second backtesting surface (roadmap §16, guide §50): wire the
real scorer over time-sliced snapshots into the slice-1 `rankAt` loop,
past-only by construction, plus the two slice-1 summary correctness fixes
(review #137). Still zero IPC/persistence/UI/scheduler; S15 weight
comparison stays out.

**Did:**
- `core/market/backtest/scorerBacktest.ts` (new, pure):
  `sliceHistoryAt`/`sliceHistoriesAt` (past-only `timestamp <= T` views,
  fresh arrays/maps, strict-throw on non-finite T),
  `snapshotsToPriceSeries` (midpoint projection for settlement, unpriced
  snapshots skipped, ascending sort), `createScorerRankAt` (per T:
  past-only slice → per-item `computeMetrics` with the liquidity universe
  built from the same past-only view → `rankOpportunities` → top-N picks
  entered at verbatim T with the scorer's own `currentPrice`; unknown ids
  fall back to `Item <id>` per S2; frozen-input safe; single config per
  pass so S15 variants run separately).
- `backtester.ts` review-#137 fixes: `summarizeTrades` derives wins from
  `returnPct > 0` (caller `win` flags ignored — inconsistent flags can no
  longer corrupt winRate/FP/hitRate, ties stay losers) and sorts an
  internal (exitTime, entryTime, itemId) copy before the equity loop (the
  documented order now holds for permuted inputs, not just round-trips).
- Tests: `tests/backtest/scorerBacktest.test.ts` — 10 tests (slice
  freshness + invalid-throw, midpoint/skip/sort projection, top-N wiring
  with verbatim-T entry, past-only no-future-leak disconfirm — crash/spike
  futures leave `rankAt(T)` identical to the truncated view, frozen
  purity + fresh picks, topN/NaN guards, inconsistent-flag summary fix,
  permutation-stable drawdown, rank → settle → summarize end-to-end) —
  273 total (263 → 273).

**Decisions:**
- Full-history-in is safe: callers pass stored history including future
  points; the harness slices per T internally, so the past-only contract
  lives in one place instead of every caller.
- `historyMinutes` = T − earliest past point, `stalenessMinutes` = T −
  latest past point, `observationCount` = past length; expected counts stay
  undefined (neutral) — depth signals stay honest without inventing a
  sampling cadence.
- Entry price is the scorer's `currentPrice`, never a caller fill — the
  measured return starts exactly where the ranking saw value.
- Third review nit (itemId 0 vs watchlist ≤0, ascending evaluationTimes
  unenforced) left as-is: documentation-level, non-gating, untouched.

**Verified:**
- `npm test` → 46 files, 273/273 pass (zero network).
- `npm run typecheck` + `npm run build` green.

## Sprint 14 (slice 1) — Pure backtesting core (2026-09-14)

**Goal:** first backtesting surface (roadmap §16, arch §31, guide §§49–50):
pure offline settle + summarize core with zero snapshots/IPC/persistence/UI.

**Did:**
- `core/market/backtest/backtester.ts` (new, pure): `settlePicks` (exit =
  earliest series point at/after entry + horizon within tolerance; missing
  series / no in-tolerance future point → `unsettled` count, never an
  error), `summarizeTrades` (roadmap §16: avg/median return, win rate, max
  drawdown over the additive equity curve floored at 0, false-positive rate
  + hit rate as complements), `runRankedBacktest` (guide §50 loop with
  ranking injected as `rankAt(timeMs)`; picks entered away from their
  evaluation time throw fail-closed). Simple percent returns, losses stay
  negative; strict-throw on invalid; frozen-input safe; no Date.now.
- Tests: `tests/backtest/backtester.test.ts` — 12 tests (settle math, loss
  negativity, unsettled-not-error, tolerance gating + earliest-point,
  unsorted determinism, invalid-throw matrix, frozen purity, summary math +
  complements, drawdown, empty-zeros, driver loop + verbatim-T + ordering
  guard) — 263 total (251 → 263).

**Decisions:**
- Slice-1 stays pure by design: no snapshots, no scorer coupling (ranking
  injected as a callback — slice-2 plugs the real scorer over time-sliced
  snapshots), no IPC/persistence/UI (later slices).
- No-future-leak by construction: core passes only T to `rankAt` and reads
  only T + horizon points for settlement; building the past-only view stays
  the caller's contract.
- Additive (non-compounding) equity for drawdown, documented so a
  compounding variant stays an explicit separate choice.
- Ties count as losses (fail-closed); empty trade lists summarize to zeros.

**Verified:**
- `npm test` → 45 files, 263/263 pass (zero network).
- `npm run typecheck` + `npm run build` green.

## Sprint 13 (slice 2) — Flip-calculator IPC + panel (2026-09-14)

**Goal:** second flip-calculator surface (roadmap §15): stateless
`flip:calculate` IPC + pure `FlipCalculatorPanel` + Dashboard
bridge/pure-fallback, zero market-data fetching/persistence. Close out
review #131 nits.

**Did:**
- `shared/ipc.ts`: `FLIP_CALCULATE` stateless contract (`flips?`
  optional — S7/S8/S10/S11/S12 stale-preload precedent); request carries
  `FlipInput`, response the full `FlipResult` (single round-trip).
- `electron/ipc/flips.handlers.ts` (new): applies pure `calcFlip` with
  `?? {}` defaults so absent request/input fails with the pure validator
  message; async so invalid inputs reject; wired in `main.ts`.
- `preload.ts` + `electronApi.calculateFlipRequest`: bridge-absent/stale
  `typeof calculateFlip !== 'function'` guards throwing `Desktop bridge
  unavailable` for pure fallback.
- `src/components/dashboard/FlipCalculatorPanel.tsx` (new, pure):
  props-driven (`result`/`error`/`onCalculate`), `GE_TAX_RATE` label-only,
  caps flags + unaffordable-zero notice, form-error vs calc-error
  distinct, zero IPC/network/scheduler/persistence.
- `Dashboard.tsx`: owns calculation — bridge path when the preload has
  the flips surface, pure `calcFlip` fallback otherwise; no market-data
  fetching (panel supplies observed prices).
- Tests: `tests/ipc/flips.test.ts` (4) + `tests/ui/flip-calculator-
  panel.test.tsx` (6) — channel, caps+zero semantics, fail-closed matrix
  incl. absent-request, bridge/stale/delegate guards, form guard, caps
  echo, zero notice, bridge vs fallback paths — 251 total (240 → 251).
- Review #131 follow-up (this entry): Dashboard `handleCalculateFlip`
  now mirrors the `typeof calculateFlip !== 'function'` guard (partial-
  stale preload takes pure fallback instead of surfacing bridge error);
  zero-quantity `<p>` notice moved out of `<dl>` (valid HTML); optional
  parses hoisted to locals (single `parseOptionalNumber` call per field).

**Decisions:**
- Stateless `flip:calculate` by design (S11 IDs-only / S12 rules-only
  precedent): no persistence, no scheduler, no market-data fetching —
  callers pass observed prices in, calculated values stay distinct from
  observed data per roadmap §15.
- Main applies the pure calculator; renderer never computes tax itself
  (centralized `GE_TAX_RATE`, never in React).
- New `flips` bridge surface optional: stale preloads without it still
  typecheck; renderer keeps runtime `typeof` guards with pure fallback.

**Verified:**
- `npm test` → 44 files, 251/251 pass (zero network).
- `npm run typecheck` + `npm run build` green.
- Review #131 CLEAR on `ffab278` (agent-b re-verified diff + workspace
  clean); nits non-gating, closed here.

**Commits:** `ffab278` slice-2 IPC + panel; this entry + #131 nits.

## Sprint 13 (slice 1) — Pure flip calculator (2026-09-14)

**Goal:** first flip-calculator surface (roadmap §15): pure
buy/sell/quantity → gross/tax/net/ROI/capital-efficiency math with
buy-limit + available-capital caps, zero IPC/persistence/UI.

**Did:**
- `core/market/flips/flipCalculator.ts` (new, pure): `GE_TAX_RATE`
  (explicit 1% of sell per unit, matching the scorer's assumed bite and
  guide §57 — centralized here, never in React) + `calcFlip(input)` →
  `FlipResult` (unit gross/tax/net, totals over effective units, capital
  required, ROI + capital-efficiency per guide §55, optional
  profit-per-hour from the explicit `flipsPerHour` assumption).
  Effective quantity = min(requested, buyLimit, floor(capital/buy)) with
  `cappedByLimit`/`cappedByCapital` flags; unaffordable (capital < one
  unit) is a valid zero result, not an error; losses stay negative (no
  zero floor). Strict-throw on invalid (non-finite/non-positive prices,
  non-integer/non-positive quantity/limit, negative capital, bad rate);
  frozen-input safe.
- Tests: `tests/flips/flipCalculator.test.ts` — 9 tests (basic math +
  tax explicitness, loss negativity, limit cap, capital cap, unaffordable
  zero, combined caps, per-hour estimate, invalid-throw matrix,
  frozen-input purity) — 240 total (231 → 240).

**Decisions:**
- Slice-1 stays pure by design: no IPC/persistence/UI (later slices), no
  market-data fetching (callers pass observed prices in — calculated
  values stay clearly distinct from observed data per roadmap §15).
- Tax on the sell side (GE semantics); scorer uses the same 1% assumption
  off its own price basis — consistent bite, documented in code.
- ROI and capital-efficiency are the same ratio (net/capital) by the
  guide §55 definition; both fields kept so the roadmap's calculate list
  maps 1:1.
- `profitPerHour` is a caller-supplied execution assumption, never a
  market-depth claim (guide §56).

**Verified:**
- `npm test` → 42 files, 240/240 pass (zero network).
- `npm run typecheck` + `npm run build` green.

## Sprint 12 — In-app alerts: pure rules + evaluator, JSON persistence, IPC, panel (2026-09-13) — view-time only; scheduler-trigger + OS-notify deferred

**Goal:** alerts surface (roadmap §14): pure alert-rule contract +
evaluator + local persistence + main-owned IPC + props-driven panel +
Dashboard renderer-side evaluation, still zero scheduler/OS-notify.

**Did:**
- Slice-1 — pure rules + evaluator (`e81c783`): new
  `core/alerts/alertRules.ts` — alert-rule contract (rule id, add/remove/
  setEnabled pure helpers) + `evaluateAlerts` over `Opportunity[]`
  returning fired events; invalid stored rules skip fail-closed; frozen-
  input safe. Tests: `tests/alerts/alertRules.test.ts`.
- Slice-2 part 1 — JSON repository (`b15b2b7`): new
  `core/alerts/AlertRepository.ts` (`load`/`save` interface — callers
  never touch JSON directly so a roadmap §17 SQLite swap stays backend-
  only) + `storage/json/JsonAlertRepository.ts` (whole-list document,
  atomic tmp+rename writes mirroring `JsonHistoryRepository`/`JsonWatch-
  listRepository`, tolerant reads, strict saves) + `alertsFile(baseDir)`
  in `storage/paths.ts`. Tests:
  `tests/alerts/alertRepository.test.ts`.
- Slice-2 part 2 — alerts IPC (`9b9fa36`): `ALERTS_GET/ADD/REMOVE/
  SET_ENABLED` channels + request/response types in `shared/ipc.ts`
  (responses return the full updated rule list — single round-trip, no
  re-fetch); `electron/ipc/alerts.handlers.ts` (main owns load → pure
  add/remove/setEnabled → save; clock injectable via `now` dep, defaults
  to Date.now); `preload.ts` + `electronApi.ts` + `main.ts` wiring.
  Tests: `tests/ipc/alerts.test.ts` — 221 total.
- Slice-2 part 3 — panel + Dashboard (`bd45cc8`): new pure
  `src/components/dashboard/AlertsPanel.tsx` (props-driven rules table +
  fired-events list + add-form, empty states, zero IPC/scheduler/network/
  OS-notify); `Dashboard.tsx` owns fetching + add/remove/toggle
  persistence and evaluates renderer-side via `evaluateAlerts` over the
  UNFILTERED effective opportunities (S11 unfiltered-watchlist
  precedent) with `Date.now()` as `triggeredAt` only. Tests:
  `tests/ui/alerts-panel.test.tsx` (7) + no-save fail-closed tests —
  231 total.
- Review #120 nits closed in part 3: ADD handler now
  `((request ?? {}).draft ?? {})` so absent request/draft reaches pure
  validation and throws `Invalid rule id` instead of TypeError (+ test
  asserting the clean message and no-save); REMOVE/SET_ENABLED already
  `?.`/`?? {}` safe. Review #122 CLEAR on `bd45cc8` (agent-b re-verified
  231/231 locally, 41 files).

**Decisions:**
- Rules-only over IPC by design (S11 IDs-only precedent): evaluation
  happens renderer-side at view time, never persisted or transferred.
- Main owns persistence; renderer never touches files (roadmap §17
  SQLite swap stays backend-only).
- New `alerts` bridge surface optional (S7/S8/S10/S11 precedent): stale
  preloads without it still typecheck; renderer keeps runtime `typeof`
  guards; bridge-absent mutations use pure helpers in try/catch
  surfacing `alertsError` fail-closed.
- Panel `Date.now` id stamping accepted as UI-local draft id; main owns
  `createdAt` via injected clock; same-ms double-submit duplicate-id
  collision fails closed in pure `addAlertRule` (surfaced error, no
  corrupt state) — collision-proof ids noted as non-gating future nit.
- Slice stays in-app by design: no scheduler triggers, no OS
  notifications, scorer/risk/confidence untouched.

**Verified:**
- `npm test` → 41 files, 231/231 pass (zero network).
- `npm run typecheck` + `npm run build` + `npm run build:electron` green.

## Sprint 11 (slice 2) — Watchlist view + IPC + UI (2026-09-13)

**Goal:** second watchlist surface (roadmap §13): pure view deriving
price/change/spread/risk at view time + main-owned IPC persistence +
props-driven panel + Dashboard integration, still zero scheduler/alerts/
charts.

**Did:**
- Part 1 — pure view + store hardening (`efeea6e`): new
  `core/watchlist/watchlistView.ts` — `buildWatchlistView(entries,
  opportunities)` returns one `WatchlistViewRow` per entry in store
  insertion order (first-watch-wins) with matching `Opportunity` attached
  or `opportunity: null` for unknown/stale ids (graceful placeholder,
  never a crash); duplicate entry ids dedupe first-wins; frozen-input
  safe (fresh row objects). `watchlist.ts` + `JsonWatchlistRepository`
  hardening alongside.
- Part 2a — watchlist IPC (`6e7800c`): `WATCHLIST_GET/ADD/REMOVE` channels
  + `WatchlistGetResponse/AddRequest/RemoveRequest`/`OsrsApiWatchlist` in
  `shared/ipc.ts` (responses return the full updated entry list — single
  round-trip, no re-fetch); `electron/ipc/watchlist.handlers.ts` (main
  owns load → pure add/remove → save; clock injectable via `now` dep,
  defaults to Date.now; GET returns per-entry copies so in-process
  callers cannot alias); `preload.ts` + `electronApi.ts`
  (`getWatchlist`/`addWatchedItem`/`removeWatchedItem`) + `main.ts`
  wiring with the JSON repository.
- Part 2b — panel + Dashboard (`bb257ee`): new pure
  `src/components/dashboard/WatchlistPanel.tsx` (props-driven rows,
  Item/Price/24h/Risk/Score + Remove action, empty-state placeholder,
  unknown-id graceful row, keyboard-selectable, zero IPC/scheduler/
  network); `Dashboard.tsx` owns fetching + add/remove persistence and
  passes derived rows via `buildWatchlistView`; view dedupe first-wins +
  GET-copy alias fix in this part.
- Tests: `tests/watchlist/watchlistView.test.ts` +
  `tests/ipc/watchlist.test.ts` + `tests/ui/watchlist-panel.test.tsx`
  — 196 total (175 → 196, +21).

**Decisions:**
- IDs-only over IPC by design (slice-1 rule carried): price/change/
  spread/risk are derived at view time, never persisted or transferred.
- Main owns persistence; renderer never touches files (roadmap §17
  SQLite swap stays backend-only).
- `watchlist` bridge surface optional (not required like `market` in
  S7): stale preloads without it still typecheck; renderer keeps
  runtime `typeof` guards (S7/S8/S10 precedent).
- Review #108 CLEAR on `bb257ee` (no rework).

**Verified:**
- `npm test` → 37 files, 196/196 pass (zero network).
- `npm run typecheck` + `npm run build` green.

## Sprint 11 (slice 1) — Pure watchlist store + JSON persistence (2026-09-13)

**Goal:** first watchlist surface (roadmap §13, mail #99): pure store
contract + local persistence (add/remove/price/change/spread/risk inputs
carried as IDs only), zero UI/charts/alerts/scheduler.

**Did:**
- `core/watchlist/watchlist.ts` (new, pure): `WatchlistEntry`
  (itemId/addedAt) + `isValidWatchlistEntry` guard +
  `createWatchlist`/`addToWatchlist`/`removeFromWatchlist`/`isWatched`/
  `watchlistIds`. Re-add is a no-op preserving original addedAt+position
  (first-watch wins); all mutating ops return fresh arrays, never mutate
  inputs (frozen-input safe); `nowMs` explicit (no Date.now, matching the
  S10 scheduler convention); garbage ids (≤0/non-integer/NaN) and
  non-finite timestamps throw.
- `core/watchlist/WatchlistRepository.ts` (new): `load`/`save`
  interface — callers never touch JSON directly so the roadmap §17
  `watchlist` SQLite table can replace the backend untouched.
- `storage/paths.ts`: `watchlistFile(baseDir)` (`<baseDir>/watchlist.json`).
- `storage/json/JsonWatchlistRepository.ts` (new): whole-list document,
  atomic tmp+rename writes (mirroring `JsonHistoryRepository`), tolerant
  reads (missing/corrupt/non-array → [], invalid records skipped),
  strict saves (invalid entries throw, previous good document intact).
- Tests: `tests/watchlist/watchlist.test.ts` (8: empty/seed copy, append,
  re-add preserves addedAt+position, remove + unknown-id fresh array,
  membership, invalid rejection, frozen-input purity, no-alias copies) +
  `tests/watchlist/watchlistRepository.test.ts` (4: load-missing [],
  round-trip order + overwrite, corrupt/non-array/invalid tolerance,
  no-.tmp-leftover + failed save preserves good doc) — 175 total.

**Decisions:**
- Slice-1 stores IDs only by design: price/change/spread/risk are derived
  at view time from `Opportunity[]`/snapshots (slice-2), never persisted.
- No size cap: the roadmap sets none, so none is invented.
- Strict-write/tolerant-read split mirrors the S2/S3
  provider/normalizer boundary.

**Verified:**
- `npm test` → 34 files, 175/175 pass (zero network).
- `npm run typecheck` + `npm run build` + `npm run build:electron` green.

## Sprint 10 (slice 2) — Scheduler runtime: timers + single-flight + manual refresh + notify (2026-09-13)

**Goal:** second auto-refresh surface (roadmap §12, guide §§41–43): timer
runtime on the slice-1 pure core + manual-refresh trigger + renderer
notify channel, still stub-only data (mail #94 scope).

**Did:**
- `electron/services/scheduler.ts`: `startScheduler(config?, deps?)` now
  builds a real runtime (singleton, `stopScheduler()` stops it):
  due-gated `setTimeout` loop (`msUntilNextRun` delay; quiet ticks just
  reschedule), single-flight lock reusing the S4 `SnapshotService`
  pattern (concurrent ticks + manual triggers share one in-flight
  refresh), `handle.refreshNow()` manual trigger bypassing the due
  check, `notify(update)` after every refresh; default refresh is a
  no-op success (stub-only data, D#163 — live pipeline plugs in as the
  `refresh` dep). Clock/timers injectable (`now/schedule/cancel`) so
  tests use fakes, zero real timers; public timer handle is opaque
  `unknown` (DOM-number vs Node-Timeout interop).
- Nits fixed: `assertNowMs` in `isRefreshDue`/`msUntilNextRun`/
  `markRefreshSuccess`/`markRefreshFailure` (non-finite throws —
  disconfirmed `markRefreshFailure(NaN)`); `resolveMaxBackoff`
  documented — cap never sleeps less than one interval (explicit
  maxBackoff clamps UP to interval; interval > 1h lifts the default).
- Jitter decision: NO jitter — single desktop client, no
  thundering-herd; jitter would blur the 1x/2x/4x backoff math for zero
  availability gain (documented in code).
- IPC notify + manual trigger (zero UI creep): `MARKET_REFRESH_NOW`
  (invoke → one refresh, resolves schedule snapshot) +
  `MARKET_REFRESH_UPDATED` (push after every refresh, schedule state
  only — no market data); `MarketRefreshUpdate` in `shared/ipc.ts`;
  preload exposes `triggerRefreshNow`/`onRefreshUpdated` (unsubscribe
  via `removeListener`); `electronApi.ts` adds `triggerManualRefresh`/
  `subscribeToRefreshUpdates` with bridge-absent + stale-preload guards
  (new bridge methods optional in the type for the same stale-preload
  reason); `main.ts` wires `notify → webContents.send` + registers the
  manual-trigger handler. Dashboard untouched (no status-line UI yet).
- Tests: `tests/scheduler/schedulerRuntime.test.ts` — 8 tests (NaN-nowMs
  ×4 helpers, >1h ceiling lift + clamp-up, due/quiet tick + success
  reschedule + notify, failure streak + 1x/2x backoff + notify, single
  flight, manual-bypass + stop-cancel, channel names, renderer
  bridge/stale/delegate guards) — 162 total.

**Decisions:**
- Slice-2 stays stub-only by design: no live provider/scorer/history
  pipeline, no Dashboard status-line UI, S9 presets remain live-scorer
  carry.
- New bridge methods optional (not required like `market` in S7): old
  preloads without them still typecheck; runtime `typeof` guards stay.
- Opaque-`unknown` timer handles with wrapped defaults after the first
  typecheck caught the DOM-number vs Node-Timeout split.

**Verified:**
- `npm test` → 32 files, 162/162 pass (zero network/timers).
- `npm run typecheck` + `npm run build` + `npm run build:electron` green
  (`lint` shows only the pre-existing Dashboard set-state warning).

## Sprint 10 (slice 1) — Pure scheduler timing core (2026-09-13)

**Goal:** first auto-refresh surface (roadmap §12, guide §§41–43): pure
schedule state + due checks + exponential backoff with zero timers/IPC/UI.

**Did:**
- `electron/services/scheduler.ts`: pure timing core beside the still-no-op
  `startScheduler`/`stopScheduler` lifecycle stubs (timers + manual-refresh
  integration + renderer notification stay slice-2). `SchedulerConfig/State`,
  `DEFAULT_REFRESH_INTERVAL_MS` (5 min, roadmap UI example),
  `MIN_REFRESH_INTERVAL_MS` (60 s rate-safety floor, guide §43),
  `DEFAULT_MAX_BACKOFF_MS` (1 h ceiling); `createSchedulerState` (first run
  one interval out; throws on non-finite/non-positive interval or time,
  clamps sub-minute to the floor), `isRefreshDue` (inclusive),
  `msUntilNextRun` (0 when due), `markRefreshSuccess` (clears streak, next
  run one interval out), `markRefreshFailure` (interval×2^(n−1) capped at
  maxBackoff). All helpers take `nowMs` explicitly (no Date.now) and never
  mutate inputs (frozen-input safe).
- `tests/scheduler/scheduler.test.ts` — 8 tests (first-run offset, floor
  clamp, invalid rejection, due boundary ±1 ms, success reset, 1x/2x/4x
  backoff, cap ceiling, frozen-input purity) — 154 total.

**Decisions:**
- Slice-1 stays pure by design: no setInterval/timeout (slice-2), no IPC
  refresh channel, no UI status line, no live refresh path (stub-only data).
- S9 preset-selector UI deferred until the live scorer pipeline: stub
  `baseScore` values are hand-set (10/90/50) with identical components, so a
  client-side recompute from components would be dishonest and would
  destroy the stub ordering every existing dashboard test asserts.
- Backoff shape: first retry waits one normal interval, then doubles —
  gentler than fail-fast ×2, still exponential; sub-minute config clamps
  (degrades to floor) while garbage (≤0/NaN/Infinity) throws.

**Verified:**
- `npm test` → 31 files, 154/154 pass (zero network/timers).
- `npm run typecheck` + `npm run build` + `npm run build:electron` green.

## Sprint 9 (slice 2) — Filter presets/UI + Infinity-null IPC (2026-09-13)

**Goal:** second filtering surface (roadmap §11): IPC-safe filter round-trip
(`Infinity`↔`null`), stub post-rank filtering, and instant client-side filter
UI with zero scheduler/network.

**Did:**
- `core/market/ranking/filters.ts`: `OpportunityFiltersWire` (wire form —
  `maxPrice: null` means unbounded) + pure `encodeFiltersForIpc`
  (Infinity→null) / `decodeFiltersFromIpc` (null→Infinity) with defensive
  `allowedRisks` copies; scorer/risk/confidence/`isCandidate` untouched.
- `shared/ipc.ts`: `MarketTop10Request.filters?: OpportunityFiltersWire` —
  main applies it as a post-rank view filter; renderer also applies the
  domain form instantly client-side (no refetch, no scheduler).
- `electron/ipc/marketStub.ts`: `getStubTop10Response` decodes wire filters
  via the shared codec and applies `applyFilters` before the limit slice
  (limit caps the filtered view); `itemsAnalyzed` stays the unfiltered
  fixture size — still never touches live provider/scorer/history/scheduler.
- `src/components/dashboard/FilterBar.tsx` (new, pure): props-driven
  membership/min/max-price/risk/min-liquidity/min-score controls; empty
  max-price = unbounded (Infinity, wire null); every edit calls `onChange`
  synchronously (instant, zero IPC/scheduler/network).
- `src/pages/Dashboard.tsx`: `filters` state + `applyFilters` before the
  view-model (filtered view ranked 1..k for display; pure-layer gaps
  preserved underneath); initial live fetch sends the pass-everything
  baseline in wire form (`DEFAULT_FILTERS`, `maxPrice: null`) once to prove
  the null-safe round-trip; effect deps exclude `filters` so edits never
  refetch; FilterBar rendered on idle/success.
- Tests: `tests/ranking/filterWire.test.ts` (7: encode Infinity→null,
  decode null→Infinity, DEFAULT round-trip through JSON, stub risk/price
  filtering, limit-caps-view, handler forwards filters) +
  `tests/ui/filters-view.test.tsx` (5: default unfiltered, membership
  instant zero-IPC, risk instant + empty-allowlist pass-all, min/max-price
  instant + clear-means-unbounded, live wire baseline once + no refetch);
  scoped the S7 `dashboard-top10` HIGH/LOW asserts to the table (FilterBar
  also renders those labels) — 146 total.

**Decisions:**
- Slice-2 does wire + stub + instant view only: no preset-weight changes,
  no scheduler (S10), no live pipeline, scorer/risk/confidence untouched.
- Pre/post-rank split documented in code: `isCandidate` stays the pre-rank
  gate; `applyFilters` is the post-rank view; the Dashboard filters the
  live/props snapshot client-side then re-ranks 1..k for display.
- `itemsAnalyzed` intentionally unfiltered so the summary distinguishes
  universe from view.

**Verified:**
- `npm test` → 30 files, 146/146 pass (zero network).
- `npm run typecheck` + `npm run build` + `npm run build:electron` green
  (`dist-electron/core/market/ranking/filters.js` emitted — the stub's
  runtime codec import resolves).

## Sprint 9 (slice 1) — Pure opportunity filters (2026-09-13)

**Goal:** first filtering surface (roadmap §11): pure post-rank
`Opportunity[]` view filters with zero IPC/scheduler/UI/network.

**Did:**
- `core/market/ranking/filters.ts` (new, pure): `OpportunityFilters`
  (membership/minPrice/maxPrice/allowedRisks/minLiquidity/minScore/
  category) + `DEFAULT_FILTERS` pass-everything baseline +
  `matchesFilters` predicate + `applyFilters` (fresh array, same refs,
  original ranks preserved with gaps, never mutates input).
- `tests/ranking/filters.test.ts` — 9 tests (empty-filters purity,
  membership split, inclusive price range, risk allowlist incl. empty
  pass-all, liquidity=components.liquidity disconfirming case,
  score=finalScore disconfirming case baseScore 95 vs finalScore 40,
  category no-op, gaps [1,3], DEFAULT_FILTERS baseline).
- Review #64 CLEAR: agent-b verified all 4 APPROVED #60 conditions
  independently (liquidity=components.liquidity, score=finalScore,
  category documented no-op with zero `category` outside filters.ts,
  isCandidate pre-gate untouched + post-rank gaps) — e3a21c9 APPROVED.

**Decisions:**
- Slice-1 stays pure by design: no IPC/scheduler/UI (slice-2), no
  presets change, scorer/risk/confidence untouched (isCandidate remains
  the pre-rank gate; applyFilters is the post-rank view filter).
- Fail-closed thresholds (`!(x >= t)` excludes NaN), empty
  `allowedRisks` = pass-all, `DEFAULT_FILTERS.maxPrice = Infinity`
  (slice-2 UI serializes to null over IPC) — review #64 non-gating nits.

**Verified:**
- `npm test` → 28 files, 134/134 pass (zero network).
- `npm run typecheck` + `npm run build` green (workspace clean).

**Commits:** `e3a21c9` filters + tests (this worklog close-out follows).

## Sprint 8 (slice 2) — Stub-first history IPC + pure PriceChart (2026-09-13)

**Goal:** second explainability surface (roadmap §10, guide §32): price
history for the selected item behind a stub `market:getHistory` feed, pure
SVG `PriceChart` reusing the selection state; review #54 APPROVE conditions.

**Did:**
- `shared/ipc.ts`: `MARKET_GET_HISTORY` + explicit `HistoryWindow`
  (`'24h'|'7d`) + `MarketHistoryRequest/Response` reusing the Sprint 3
  `MarketSnapshot` point shape (no parallel history types);
  `OsrsApiMarket.fetchHistory` added.
- `electron/ipc/marketStub.ts` + `market.handlers.ts` (wired in `main.ts`,
  exposed in `preload.ts`): deterministic stub points (24h=12, 7d=14,
  oldest-first, gentle uptrend) — never touches live provider/history/
  scheduler; handler deps keep `getHistory` optional so slice-1 callers work.
- `src/services/electronApi.ts`: `fetchItemHistory` — throws when bridge
  absent or stale preload (`market == null`) so the Dashboard falls back.
- `src/components/dashboard/PriceChart.tsx` (new, pure): SVG polyline,
  midpoint price series, empty state on <2 points; zero IPC/chart.js/network.
- `Dashboard.tsx`: history effect with cancelled-flag + captured-id stale
  guard; error precedence `errorProp ?? historyError ?? top10Error ??
  bridgeError`; 24h chart section under details with loading/error/
  bridge-absent states; selection fix — internal id only written when
  uncontrolled so controlled-clear cannot resurrect stale ids.
- `TopOpportunityTable.tsx`: keyboard rows (`tabIndex` + Enter/Space).
- Tests: strengthened D#200 (asserts rendered ×riskMult/×confMult text +
  displayed base×mults≈final); new `price-history.test.tsx` (12 tests:
  contract, stub shape/order, handler forwarding, bridge-absent + stale
  throws, pure chart, chart-after-click, rapid-reselect stale guard,
  history-error + errorProp precedence, controlled-clear, keyboard);
  fixed `dashboard-top10-live` mocks for required `fetchHistory`.

**Decisions:**
- Stub-first by design (D#163): proves history wiring before the live
  pipeline; no S9 filters/presets, no S10 scheduler, scorer/risk/conf untouched.
- Fixed 24h window in slice-2 (window union typed for later 7d toggle).

**Verified:**
- `npm test` → 27 files, 124/124 pass (zero network).
- `npm run typecheck` + `npm run build` green (workspace clean).

## Sprint 8 (slice 1) — Pure ItemDetailsPanel + score breakdown (2026-09-13)

**Goal:** first explainability surface (roadmap §10, guide §32): props-driven
item details + Base→Final breakdown, zero IPC/chart/history (D#200 scope
guardrail, task #8).

**Did:**
- `src/components/dashboard/ItemDetailsPanel.tsx` (new, pure): name/id/price,
  1h/6h/24h, spread gp+pct, liquidity/volatility component scores, estimated
  profit, risk text+arrow with ×riskMult, confidence % with ×confMult,
  six-component + Base/Final breakdown table; multipliers imported from
  `risk.ts`/`confidence.ts` (never reimplemented); null → "Select an item"
  empty state.
- `TopOpportunityTable.tsx`: selected-row `aria-selected` + `selected` class;
  S8 placeholder paragraph removed (details now live in Dashboard).
- `Dashboard.tsx`: internal selection state (controlled via `selectedItemId`
  prop, uncontrolled otherwise so the live stub path works with no props);
  `onSelectItem` always notified; renders "Item details" + panel below the
  table on idle/success with non-empty Top-10 (both props and live paths).
- Tests: `tests/ui/item-details.test.tsx` — 6 tests (empty state, fields,
  all-six+Base/Final rows, base×riskMult×confMult==final disconfirming
  check, row-click select + controlled-id paths), 112 total.

**Decisions:**
- Slice-1 stays pure by design: no `market:getItemHistory`, no chart.js
  (slice-2), no filters/presets (S9), no scheduler (S10), stub-only live
  data (D#163).
- Carry nits: bridgeStatus version/top10 race; profit rho 0.9819 watch S14.

**Verified:**
- `npm test` → 26 files, 112/112 pass (zero network).
- `npm run typecheck` + `npm run build` green (workspace clean).

## Sprint 7 (slice 2) — Live dashboard IPC wiring, stub feed (2026-09-13)

**Goal:** prove the main → preload → renderer Top-10 round-trip
(roadmap §9 live path) behind a stub feed — no provider/scorer/history/
scheduler yet (D#163 scope guardrail, task #7 with agent-b).

**Did:**
- `shared/ipc.ts`: `MarketTop10Request/Response` + `OsrsApiMarket`
  contracts; `market` required since the stub landed (agent-b 7317cfa,
  review #43 follow-up f1caed2) — renderer keeps a runtime
  `market == null` old-preload guard so stale preloads still fall back
  to the props path.
- `electron/ipc/marketStub.ts` + `market.handlers.ts` (wired in
  `main.ts`, exposed in `preload.ts`): fixed unsorted 3-item fixture
  (`STUB_RANKING_VERSION='0.2-BALANCED-stub'`), `limit`-aware slice —
  never touches live provider/scorer/history/scheduler.
- `src/services/electronApi.ts`: `fetchTop10` — throws when bridge
  absent (browser dev mode falls back to props); `market == null`
  guard kept for stale preloads.
- `src/pages/Dashboard.tsx`: live path fetches stub Top-10 when bridge
  available and no `statusProp`; error precedence
  `errorProp ?? top10Error ?? bridgeError` with Top-10 detail in the
  main error paragraph (review #43); props path unaffected (effect
  early-returns on `statusProp`); renderer sorts via the shared
  slice-1 view-model.
- Tests: `dashboard-top10-live.test.tsx` (renderer live/sort/fallback/
  error-detail) + `tests/ipc/market.test.ts` (stub contract) —
  10 new, 106 total.

**Decisions:**
- Stub-first by design: proves IPC wiring before the live pipeline;
  live ranking arrives in later sprints.
- Renderer-side sort keeps single sort ownership in
  `buildDashboardViewModel` (stub deliberately unsorted).
- Known nit (non-gating, review #45): version-fetch and top10-fetch
  share one bridgeStatus, so a version-fail + top10-success race
  resolves nondeterministically; both-fail is safely error either way.

**Verified:**
- `npm test` → 25 files, 106/106 pass (zero network).
- `npm run typecheck` + `npm run build` green (workspace clean).
- Review #44 CLEAR on code; review #45 close-out (push + this worklog).

**Commits:** `56a4df5` renderer live path, `7317cfa` main/preload stub,
`f1caed2` review #43 follow-up (market required + error detail).

## Sprint 7 (slice 1) — Pure dashboard Top-10 + summary (2026-09-13)

**Goal:** first visible ranking surface (roadmap §9): props-driven Top-10
table + market summary with zero network/IPC/scheduler.

**Did:**
- `dashboardViewModel.ts`: pure `buildDashboardViewModel` — sorts snapshot
  by finalScore desc, slices 10, copy-on-rank (fresh objects, never mutates
  caller props per review #37).
- `TopOpportunityTable.tsx`: `#/Item/Price/1h/6h/24h/Spread/Liquidity/
  Risk/Score` columns, risk as text+arrow (not color-only), empty state
  offline-pure; `selectedItemId` placeholder notes Sprint 8 details.
- `MarketSummary.tsx`: items analyzed / opportunities found / last update.
- `Dashboard.tsx`: props-driven (`statusProp ?? bridgeStatus`), IPC
  bridgeStatus wired into status so bridge failures surface as error
  (review #37); S8 placeholder for details.
- Tests: `dashboard-top10.test.tsx` — 5 tests (sort/slice/rank, purity
  across calls, sorted render + risk text, empty states).

**Decisions:**
- Slice-1 stays pure by design: no IPC/scheduler (S10), no filters/presets
  (S9), no charts/details (S8) — live wiring is slice-2 with agent-b.
- Copy-on-rank enforced: `[...]/slice` alone still shares refs, so map to
  `{...o, rank}` keeps the builder side-effect free.

**Verified:**
- `npm test` → 23 files, 96/96 pass (zero network).
- `npm run typecheck` + `npm run build` green (workspace clean).

**Commits:** `d36ac84` slice-1 view-model + table, `a4b5b0c` review #37
fixes (both on `origin/main`).

## Sprint 6 (slice 3) — Spread/profit orthogonalization (0.2) + live 0.2 ablation re-run (2026-09-13)

**Goal:** resolve the spread double-count risk before Sprint 7: make spread
and profitability independent signals, then re-run the live BALANCED Top-10
ablation on formula 0.2 (review #29 gate).

**Did:**
- `scorer.ts`: profitability is now absolute-scale and orthogonal to spread —
  net = spreadGp − 1% tax, then 25×log10(1+net/100) (cheap high-pct/low-gp
  vs expensive low-pct/high-gp diverge; net ≤ 0 or missing → 0). Spread stays
  relative (spreadPct×20). Shares unchanged (retune-free).
- `weights.ts`: `RANKING_FORMULA_VERSION='0.2'` + content-aware
  `rankingVersionForPreset` (`0.2-<preset>-m..l..s..p..c..v..`) with
  manual-bump rule (review #27: bump on any scorer formula change).
- `ablation.ts` + `scripts/check-ablation.ts` (`npm run check:ablation`):
  BALANCED baseline vs spread=0 renorm vs profitability=0 renorm —
  Top-10 overlap + Spearman rho over the shared universe (offline helpers
  unit-tested; script is a live manual tool, not a test).
- Tests: divergence test (cheap high-pct vs pricey low-pct diverge on
  profitability while spread pct agrees) + explicit cheapPct/priceyPct
  assert per review #27; ablation helper tests (renorm, rho=1/−1, swap).
- Review #27 fixes (9e0f2b7): explicit spread-independence assert shape +
  formula version constant accepted as minimal (human-discipline
  enforcement noted, no further churn).

**Decisions:**
- Retune-free: total margin weight unchanged, now split across two
  independent signals; no weight tuning before ablation numbers (review #29).
- No-spread/no-profit rho + Top-10 overlap is the single experiment that
  disconfirms both the double-count and the log-compression weight-shift risk.

**Verified:**
- `npm test`, `npm run typecheck`, `npm run build` green (workspace clean).
- Live `npm run check:ablation` on 0.2 (2026-09-13): 24/24 buckets,
  universe 4178 items, candidates 3414 —
  baseline-vs-no-spread overlap 5/10 rho=0.8981,
  baseline-vs-no-profit overlap 8/10 rho=0.9819 —
  verdict INDEPENDENT SIGNAL (neither ablation hits overlap≥9 AND rho>0.95).
- Note: no-profit rho 0.9819 is high but overlap 8/10 misses the second
  leg, so the gate criterion still passes; watch profit-weight in backtests.

**Commits:** `048e1d9` ablation tooling, `d874371` slice-3 orthogonalization,
`9e0f2b7` review #27 fixes (all pushed to `origin/main` this cycle).

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
