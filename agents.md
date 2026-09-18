# agents.md — Sprint Worklog

Running history of what was built, decided, and verified. Newest sprint first.
Rule: no sprint is merged unless `npm test`, `npm run typecheck`, and
`npm run build` are all green.

## Sprint 21 (#50a) — Metadata hardening, display-only strictness (2026-09-18)

**Goal:** close #260 hardening half of #50 per review #268 split
(hardening first, fast-retry separate as #50b): trim examine, dedupe
the inline meta type, strict serve-path validation, panel display
guards, explicit value 0-vs-null. Zero new bulk pull, fail-open
neutrals, no filter/ranking input change.

**Did:**
- `electron/services/mappingCache.ts`: `metas` maps now typed as
  `CachedItemMetadata` (imported, no inline duplicate — drift closed);
  `examine` trims on store (`'  x  '`→`'x'`, whitespace-only→`''`)
  matching the trim-on-store name precedent; value `>= 0` bound
  documented explicit (0 kept, null stays the miss neutral).
- `electron/services/rankEntries.ts`: serve path validates per field
  over a `Partial<CachedItemMetadata>` view — `members === true` else
  `false`, buyLimit integer>0 else `null`, examine string→trimmed else
  `''`, value integer>=0 else `null`. Partial/custom-resolver shapes
  degrade per field, never throw, never fetch.
- `src/components/dashboard/ItemDetailsPanel.tsx`: buyLimit renders
  only on integer-number (`toLocaleString`, else `—` — non-number can
  no longer display); examine renders trimmed non-empty or `—`
  (whitespace-only no longer renders blank). Value 0 keeps `'0 gp'`
  via `formatGp`, distinct from null `—`.
- Tests +5 (423 → 428): store trim (padded/whitespace-only), value-0
  kept vs null-miss, partial-shape strict serve, panel whitespace→dash
  + 0-gp, panel non-number buyLimit→dash in
  `tests/market/mappingCache.test.ts` + `tests/ui/item-details.test.tsx`.

**Decisions:**
- Split #50 per agent-b WARNING #268: hardening (#50a, this slice)
  ships alone; fast-retry stays #50b (main warm + rewarm timing, no
  retry storm) — different blast radii, no bundling.
- Trim at store + serve + render (defense in depth): cache holds
  canonical text, custom resolvers bypassing the cache still degrade
  honestly at serve/render.
- Display-only again: no filter/ranking input reads the touched
  fields; served==observed by inheritance (shared builder).

**Verified:**
- `npm test` → 64 files, 428/428 pass.
- `npm run typecheck` + `npm run build` green.

**Carried nits (non-gating):**
- #50b fast-retry still open (startup-warm failure waits a full interval).
- Wall-clock perf guard, split-brain/Electron-proof gates still open.
- Members `undefined`→F2P stays the documented neutral; buyLimit
  locale-string stays display-only.

## Sprint 21 (#48) — ItemDetailsPanel surfacing, display-only cached metadata (2026-09-18)

**Goal:** close #48/#49: renderer surfaces the already-cached
members/buyLimit/examine/value in ItemDetailsPanel, display-only with
zero new bulk pull, fail-open neutrals, no filter/ranking input change.

**Did:**
- `src/components/dashboard/ItemDetailsPanel.tsx`: 4 display-only rows
  over `opportunity.item` (already served by the pipeline via the
  mappingCache 288-gated snapshot) — Membership (`Members`/`Free-to-play`),
  Buy limit (`toLocaleString` or `—` on null), Examine (text or `—` on
  `''`), Value (`formatGp` or `—` on null). Pure props-driven, no IPC/
  fetch/write, never throws on miss.
- `electron/services/rankEntries.ts`: doc updated — renderer now surfaces
  the served metadata (was "follow-up"); math untouched.
- Tests +2 (421 → 423): present-metadata surfacing (Members/70/examine/
  `120,001 gp`) + miss fail-open neutrals (F2P + ≥3 `—`) in
  `tests/ui/item-details.test.tsx`.

**Decisions:**
- Display-only by design: panel reads `opportunity.item` only — served==
  observed by inheritance (no new resolver thread, no pipeline change).
- Fail-open neutrals by design: miss/invalid renders `Free-to-play`/`—`,
  never an error state; no filter/ranking input reads the new rows.
- Membership wording `Members`/`Free-to-play` matches the FilterBar
  vocabulary (`members`/`f2p`/`all`).

**Verified:**
- `npm test` → 64 files, 423/423 pass.
- `npm run typecheck` + `npm run build` green.

**Carried nits (non-gating):**
- Startup-warm failure still waits a full interval (no fast-retry).
- Wall-clock perf guard, split-brain/Electron-proof gates still open.
- Review #260 nits still open (CachedItemMetadata required-fields
  strictness, inline meta-type drift, examine untrimmed, value 0-vs-null).

## Sprint 21 (examine/value follow-up) — Cached examine/value over the 288 gate (2026-09-18)

**Goal:** close the carried `examine/value stay empty/null` nit from the
#47 enrichment slice: serve real `examine`/`value` from the already-cached
`/mapping` map with zero new bulk pull, fail-open neutrals, display-only
(no filter/ranking input change).

**Did:**
- `electron/services/mappingCache.ts`: same atomic snapshot now stores
  `{name, members, buyLimit, examine, value}` per id (blank-name skip
  preserved); invalid `examine` (non-string) degrades per-entry to `''`,
  invalid `value` (non-integer/<0) to `null`, without dropping the name;
  no fetch-path change (startup warm + 288 count gate untouched).
- `electron/services/rankEntries.ts`: `CachedItemMetadata` gains
  `examine: string` + `value: number | null`; `buildRankEntries` serves
  `meta?.examine ?? ''` / `meta?.value ?? null` — miss/`undefined` keeps
  the pre-enrichment neutrals. No filter/ranking input reads them.
- Tests +4 (417 → 421): cached examine/value load, per-entry invalid
  degrade (bad examine→`''`, bad value→`null`, name kept), miss-shape
  neutrals, served-payload passthrough in `itemNames.test.ts`.

**Decisions:**
- No new bulk pull by design: examine/value ride the existing snapshot +
  288 gate; staleness bound (~24 h healthy, extending under outage) now
  covers the full metadata row — display-only staleness, never a
  pipeline failure.
- Fail-open neutrals by design: mapping miss/outage keeps refresh +
  ranking green; renderer does not surface examine/value yet
  (ItemDetailsPanel follow-up), so this slice changes the served payload
  only.
- Fast-retry stays separate (carried); mappingCache/itemNames + full
  suite green per gate (4).

**Verified:**
- `npm test` → 64 files, 421/421 pass.
- `npm run typecheck` + `npm run build` green.

**Carried nits (non-gating):**
- Startup-warm failure still waits a full interval (no fast-retry).
- Renderer never reads examine/value/members — ItemDetailsPanel
  surfacing is the follow-up slice.
- Wall-clock perf guard, split-brain/Electron-proof gates still open.

## Sprint 21 (enrichment #47) — Cached members/buyLimit over the 288 gate (2026-09-18)

**Goal:** close gated build slice (#248/#249/#250): serve real members/
buyLimit from the already-cached `/mapping` map with zero new bulk pull,
fail-open neutral defaults, explicit payload + filter docs.

**Did:**
- `electron/services/mappingCache.ts`: same atomic snapshot now stores
  `{name, members, buyLimit}` per id (blank-name skip preserved);
  `resolveMetadata` sync lookup over the cached map only; invalid
  members/buyLimit degrade per-entry to neutral (`false`/`null`) without
  dropping the name; no fetch-path change (startup warm + 288 count gate
  untouched).
- `electron/services/rankEntries.ts`: new `CachedItemMetadata` +
  `ItemMetadataResolver` seam; `buildRankEntries` optional 4th param —
  miss/`undefined` keeps pre-enrichment `members: false, buyLimit: null`.
- `electron/services/liveMarket.ts` + `refreshPipeline.ts` + `main.ts`:
  optional-appended `resolveMetadata` threading; main passes
  `mappingNames.resolveMetadata` into both served Top-10 and observed
  `rankSnapshots` so served==observed on metadata too.
- Tests +6 (411 → 417): cached load, fail-open miss shape, invalid
  per-entry degrade, explicit served-payload change + counts equality
  (price-only candidacy), membership-meaningful-only-with-metadata
  (neutral `members`→empty / `f2p`→all preserved on miss), handler
  forwarding in `itemNames.test.ts`.

**Decisions:**
- No new bulk pull by design: metadata rides the existing snapshot +
  288 gate; staleness bound (~24 h healthy, extending under outage)
  now covers metadata — stale members flag is documented filter-input
  staleness (display-only), never a pipeline failure.
- Fail-open neutral defaults by design: mapping miss/outage keeps
  refresh + ranking green; membership filter meaningful only when
  present — explicit doc, no silent shift.
- Fast-retry stays separate (carried); itemNames/mappingCache + full
  suite green per gate (6).

**Verified:**
- `npm test` → 64 files, 417/417 pass.
- `npm run typecheck` + `npm run build` green.

**Carried nits (non-gating):**
- Startup-warm failure still waits a full interval (no fast-retry).
- Examine/value stay empty/null (members/buyLimit scope only).

## Sprint 21 (re-warm slice) — Header fix + count-gated periodic re-warm (2026-09-17)

**Goal:** close mail #244 scope: fix the stale `Never throws` header nit
and decide + implement the periodic re-warm (scheduler hook vs
refresh-count gate) under the carried constraint (no per-refresh bulk
`/mapping` pull).

**Did:**
- `electron/services/mappingCache.ts`: header now states the error split
  explicitly — `loadFromMapping` THROWS `TypeError` fail-closed (mutating
  nothing) vs `refreshMappingNameCache` NEVER REJECTS (`false` keeping
  previous names). New `MAPPING_REWARM_INTERVAL_REFRESHES = 288` (~24 h
  at the 5-min interval) + pure `shouldRewarmMappingNames` (fail-closed
  `false` on bad counter/interval) + `createMappingRewarmTracker`
  (`rewarmIfDue` per successful refresh: `skipped` with zero fetch until
  due, one best-effort pull when due, counter reset on *attempt* so a
  sustained outage costs ≤1 fetch/interval; never rejects).
- `electron/main.ts`: module `mappingRewarm` tracker; pipeline `onBatch`
  (success-only signal) runs `rewarmIfDue` in the background (`void`,
  never throws into refresh) — `ok` logs `info/api-refresh` with the
  cached count, `failed` logs `warn/api-refresh` keeping previous names,
  `skipped` stays silent.
- Tests: `tests/market/mappingCache.test.ts` +3 (9 total): predicate
  matrix (bound + fail-closed inputs), hot-path proof (7 refreshes @
  interval 3 → exactly 2 `getMapping` calls, `skipped` elsewhere),
  failure proof (failed re-warm keeps names + size, gate resets so no
  retry storm) — 411 total (408 → 411).

**Decisions:**
- Count-gate picked, scheduler time-hook rejected: a time hook drifts
  under backoff/sleep (timers delay while successes accumulate) and
  needs clock injection for zero benefit; the gate's own idle drift (no
  successes → no re-warm) is benign — with no fresh price data the
  served view is equally stale, so name staleness never observably
  exceeds data staleness.
- Reset-on-attempt (not on-success): bounds outage fetch cost to the
  same 1-per-interval as healthy operation; recovery waits at most one
  more interval — acceptable for display-only names.
- Staleness bound: ~24 h in healthy operation, extending under outage
  by design (fail-open keeps previous, honest `Item <id>` fallback at
  worst).

**Verified:**
- `npm test` → 64 files, 411/411 pass.
- `npm run typecheck` + `npm run build` green.

**Carried nits (non-gating):**
- Members/buyLimit still neutral defaults; blank/unknown ids still
  `Item <id>` fallback.
- Main wiring proven by tracker unit tests + pattern test, not main.ts
  resolver identity.
- Startup-warm failure waits a full interval for the first re-warm (no
  fast-retry); names stay honest-fallback meanwhile.

## Sprint 21 (slice 3) — Atomic mapping swap + trim-on-store (2026-09-17)

**Goal:** close the review #239 load-bearing bug (atomic-swap violation):
`loadFromMapping` cleared before validating, so a malformed-but-resolving
`/mapping` wiped good names — contradicting the fail-open claim. Fix with
temp-map-then-swap + trim-on-store + fail-closed malformed.

**Did:**
- `electron/services/mappingCache.ts`: `loadFromMapping` now validates
  (`!snapshot || !Array.isArray(items)` → `TypeError`) and builds a temp
  `Map` first, swapping (`clear` + copy) only after a clean iteration —
  no clear-on-failure path remains. Stores `name.trim()` so the cache is
  consistent with the rankEntries trim-at-use. `refreshMappingNameCache`
  unchanged in shape (try/catch → `false` keeping previous) — now actually
  atomic because the throw happens before any mutation.
- Tests: `tests/market/mappingCache.test.ts` +2 (6 total): malformed
  fail-closed matrix (`null`, `{items:{}}`, `{}` via refresh → `false` +
  names + size kept; direct `loadFromMapping` throws `TypeError` without
  wiping) + trim-on-store (`'  Abyssal whip  '` → `'Abyssal whip'`) —
  408 total (406 → 408).

**Decisions:**
- Fail-closed malformed by design: a resolving-but-bad `/mapping` shape
  returns `false` and keeps previous names (possibly empty → honest
  `Item <id>` fallback) — mapping outages/bad payloads never wipe the
  cache into a worse state.
- Trim-on-store (not just trim-at-use): the cache holds canonical names;
  rankEntries trim stays as a second guard.
- Periodic re-warm stays deferred: startup-warm-only staleness carried —
  scheduler hook vs refresh-count gate is the next slice's decision, still
  no per-refresh bulk pull.

**Verified:**
- `npm test` → 408/408 pass.
- `npm run typecheck` + `npm run build` green.

**Carried nits (non-gating):**
- Cache warms once at startup; no periodic re-warm on later refreshes
  (next slice decision).
- Members/buyLimit still neutral defaults; blank/unknown ids still
  `Item <id>` fallback.
- Main wiring proven only by pattern test, not main.ts resolver identity.

## Sprint 21 (slice 2) — Async /mapping name-cache wiring in main (2026-09-17)

**Goal:** close the slice-1 carried nit (main passed no resolver):
warm one bulk `/mapping` name cache at startup and feed its sync
resolver into both served Top-10 and observed pipeline counts, so live
Top-10 serves real names once cached and `Item <id>` honestly before/
on failure. Name-only; members/buyLimit stay neutral defaults.

**Did:**
- `electron/services/mappingCache.ts` (new):
  `createMappingNameCache` (plain `Map<id, name>` + sync `resolveName` +
  `loadFromMapping` skipping non-integer/blank entries) +
  `refreshMappingNameCache` (one bulk `getMapping` pull, `true` on
  success, `false` fail-open keeping previous names, never rejects).
- `electron/main.ts`: module `mappingNames` cache; `createLiveTop10Handler`
  now `(liveStore, Date.now, mappingNames.resolveName)`; pipeline gets
  `rankSnapshots: (snaps, ts) => scoreBatchSnapshots(snaps, ts, resolver)`
  so served==observed on names (no `PipelineRefreshDeps` interface
  change); shared `priceProvider` instance; background `void` warm with
  `startup` log (`mapping names: N cached` vs fallback notice, never
  blocks window/scheduler/refresh).
- Tests: `tests/market/mappingCache.test.ts` (new, 4 tests: empty→fallback,
  blank-skip load, fail-open refresh preserving good names, served==observed
  wiring pattern) — 406 total (402 → 406).

**Decisions:**
- Startup-warm-only by design: no per-refresh `/mapping` pull (extra bulk
  fetch latency stays out of the 5-min refresh path); staleness (new items
  renamed) is a documented non-gating nit — periodic re-warm is follow-up.
- Fail-open mapping by design: names are display-only (counts are
  name-independent, proven in slice-1), so a mapping outage must never
  turn success into failure — fallback stays honest.
- Name-only again: buyLimit/members enrichment deferred so filters keep
  current semantics until real metadata is wired as a separate slice.

**Verified:**
- `npm test` → 64 files, 406/406 pass.
- `npm run typecheck` + `npm run build` green.

**Carried nits (non-gating):**
- Cache warms once at startup; no periodic re-warm on later refreshes.
- Members/buyLimit still neutral defaults; blank/unknown ids still
  `Item <id>` fallback.

## Sprint 21 (slice 1) — Sync name-injection seam for real item names (2026-09-17)

**Goal:** smallest honest step toward retiring the `Item <id>` fallback:
a sync `ItemNameResolver` seam so cached `/mapping` names can flow into
both observed counts and served Top-10 with zero fetch in the
pipeline/serve path. Async mapping population stays the next slice.

**Did:**
- `electron/services/rankEntries.ts`: `buildRankEntries` gains optional
  `resolveName?: ItemNameResolver` — non-empty trimmed resolver result
  wins, otherwise the honest `Item <id>` fallback (per-id, so unknown
  ids still render honestly). Members/buyLimit untouched (still neutral
  defaults).
- `electron/services/refreshPipeline.ts` + `liveMarket.ts`:
  `scoreBatchSnapshots` / `rankBatchToTop10` / `createLiveTop10Handler`
  forward the optional resolver (all params optional-appended, existing
  2-arg callers unaffected); served/observed still share the one builder
  so they can never drift.
- Tests: `tests/market/itemNames.test.ts` (new, 4 tests: default
  fallback, cached-names both paths + counts name-independent,
  unknown/empty per-id fallback + frozen safety, handler forwarding) —
  402 total (398 → 402).

**Decisions:**
- Sync injection by design: the pipeline/serve path stays sync and
  fetch-free (S17/S20 perf precedent); the async `/mapping` cache load
  (ItemMetadataStore) is populated elsewhere in the next slice.
- Name-only in this slice: members/buyLimit enrichment stays out so
  filters keep current semantics until real metadata is wired.

**Verified:**
- `npm test` → 63 files, 402/402 pass.
- `npm run typecheck` + `npm run build` green.

**Carried nits (non-gating):**
- Main still passes no resolver (live Top-10 serves `Item <id>` until
  the mapping-cache slice lands).
- Members/buyLimit still neutral defaults; `Item <id>` fallback stands
  without cached names.

## Sprint 20 (slice 5) — Log-viewer carried-nit fixes (2026-09-17)

**Goal:** close the three slice-4 carried nits from review #225 with no
behavior change beyond honesty: duplicate-key collisions, stale-plus-error
retention, and all-or-nothing `Promise.all`. Manual-refresh-only retained.

**Did:**
- `LogViewerPanel.tsx`: list key gains an index suffix
  (`` `${timestampMs}-${category}-${message}-${index}` ``) — duplicate
  refresh lines in the same ms no longer trip the React duplicate-key
  warning; no data loss, keys stay stable per snapshot.
- `Dashboard.tsx` `handleRefreshLogs`: `Promise.all` → `Promise.allSettled`
  — a good side is preserved while a failed side clears to `null`
  (never stale-plus-error); combined error message joins both rejection
  reasons; manual `Refresh logs` button only, no auto-poll/subscribe.
- Tests: `tests/ui/log-viewer-panel.test.tsx` extended — 398 total
  (395 → 398): dup-key silence, stale-clear on bridge-read failure,
  partial-preserve (good side kept alongside joined error).

**Decisions:**
- Fail-clears-to-null by design: a failed read shows error, not
  last-good masquerading as current; a partial good side is still
  displayed honestly alongside the joined error.
- Manual-refresh-only by design (unchanged): scheduler/backoff failures
  surface only on user Refresh; auto-subscribe stays roadmap follow-up.

**Verified:**
- `npm test` → 62 files, 398/398 pass.
- `npm run typecheck` + `npm run build` + `npm run build:electron` green.
- Review #231 CLEAR on `912ce70` (agent-b independently re-ran
  398/398 + typecheck + build:electron).

**Carried nits (non-gating):**
- Partial error+data display is honest but keep the intent documented.
- `Item <id>` fallback still stands (no metadata fetch in pipeline/serve).
- Perf wall-clock guard, `captured` interleave under direct concurrent
  refresh (benign under double single-flight), split-brain/
  Electron-proof gates still open.

## Sprint 20 (slice 4) — Read-only renderer log viewer (2026-09-17)

**Goal:** close the S19 slice-3b "read path proven, no viewer" gap with
the minimal honest surface per #221/D#1102: manual-refresh-only
read-only viewer over the S19 log IPC, zero auto-poll/scheduler-notify.
Top-10/history pipeline untouched.

**Did:**
- `src/components/dashboard/LogViewerPanel.tsx` (new, pure):
  props-driven (`events`/`summary`/`error`/`onRefresh`), verbatim
  `formatLogEvent` lines newest-first (`[...events].reverse()`, no input
  mutation), summary (`total`, by-level, last error/event) + empty states
  (`No logs loaded yet`, `No log events yet`), zero IPC/scheduler/
  persistence/network.
- `src/pages/Dashboard.tsx`: `logEvents`/`logSummary`/`logError` state +
  `handleRefreshLogs` via `fetchLogRecent({ limit: MAX_LOG_ENTRIES })` +
  `fetchLogSummary`; bridge-absent/stale falls back to
  `summarizeLog([])` empty reads (never throws, S19/flip/quality
  precedent); fail-closed error surfacing; `Application log` section on
  idle/success with a manual `Refresh logs` button only.
- Cleanup `44a9bf5` (same push train, also unlogged): shared
  `rankEntries` helper removing the `buildLiveEntries`/
  `scoreBatchSnapshots` verbatim duplication (slice-3 carried nit),
  `refreshPipeline.ts` header + `market.handlers.ts` doc-drift fix,
  `marketStub.ts` marked deprecated, stronger delegation test — 388
  total at that commit.
- Tests: `tests/ui/log-viewer-panel.test.tsx` (new, 7 tests: pure
  notice+refresh, summary+newest-first verbatim, error fail-closed,
  bridge delegate with limit 500, absent fallback, stale fallback,
  reject fail-closed) — 395 total (388 → 395).

**Decisions:**
- Manual-refresh-only by design (#221 gate): no mount auto-read, no
  scheduler-notify subscription — scheduler/backoff failures surface
  only when the user presses Refresh logs; auto-subscribe stays a
  roadmap follow-up.
- Dashboard owns reading, panel stays pure: the viewer never fetches,
  writes, clears, or diagnoses — it renders observed ring contents only.

**Verified:**
- `npm test` → 62 files, 395/395 pass.
- `npm run typecheck` + `npm run build` + `npm run build:electron` green.
- Review #225 code CLEAR on `7582905` (agent-b independently re-ran
  395/395; process gaps were docs + push + board, closed by this entry).

**Carried nits (non-gating, review #225):**
- List key `${timestampMs}-${category}-${message}` collides on duplicate
  refresh lines in the same ms (React duplicate-key warning, not data
  loss) — use index suffix or the full formatted line.
- Bridge-read failure retains stale `logEvents`/`logSummary` alongside
  `logError` (catch only sets error) — clear to empty or document
  stale-plus-error intent.
- `Promise.all` all-or-nothing: one side failing discards the other's
  good read. Acceptable minimal, noted.
- `Item <id>` fallback still stands (no metadata fetch in pipeline/serve).

## Sprint 20 (slice 3) — Live Top-10/history IPC over the S20 pipeline (2026-09-17)

**Goal:** retire the S7/S8 stub fixtures so the renderer serves what the
S20 pipeline actually persisted: live Top-10 from the last good batch
(in-memory, zero repo reads) + live history from the stored backend.
Close the slice-2 "observed, never served" divergence honestly.

**Did:**
- `electron/services/liveMarket.ts` (new): `createLiveMarketStore` /
  `rankBatchToTop10` / `createLiveTop10Handler` /
  `createLiveHistoryHandler` + `LIVE_RANKING_VERSION`
  (`rankingVersionForPreset('BALANCED')`, never `0.2-BALANCED-stub`).
  Top-10 ranks the stored batch with the verbatim S6/S14 math —
  single-point `computeMetrics` at the batch timestamp + BALANCED
  `rankOpportunities` + `Item <id>` fallback + `historyMinutes`
  undefined (same math as the slice-2 observed counts). Zero repository
  reads (S17 full-week scan stays out of the serve path). Wire filters
  decoded + applied before the limit slice (S9 precedent);
  `itemsAnalyzed` stays the unfiltered universe; `computedAt` is the
  batch timestamp. Empty store serves an honest empty live payload
  (never the stub). History maps `24h`/`7d` to a `[to-window, to]`
  `getItemHistory` range, fail-closed on bad itemId/window (async
  reject, flips/quality precedent).
- `electron/services/refreshPipeline.ts`: optional `onBatch` publish of
  the just-persisted batch (after persist + scorer success; throwing
  callback swallowed so publishing never turns success into failure;
  failure paths never publish — last-good retained). Review #206
  prototype nit fixed via explicit delegation
  (`getItemHistory`/`getLatestSnapshot` forward, no `{...spread}`).
- `electron/main.ts`: stub retired. Module-scoped `liveStore` published
  by the pipeline's `onBatch` (defensive copy); `getTop10` serves it;
  `getHistory` resolves the module `historyRepository` lazily per
  request (fail-closed `History backend not ready` before the selector
  assigns), delegating to the live history handler over SQLite-or-JSON.
- Tests: `tests/market/liveMarket.test.ts` (new, 9 tests: honest-empty,
  live version + 100 GP price floor, wire-filters-before-limit,
  frozen-input purity, window→range mapping, bad-input reject,
  publish + last-good-on-failure, throwing-onBatch swallowed,
  prototype-delegation) — 387 total (378 → 387).

**Decisions:**
- Serve from memory, not from a re-read: the pipeline already holds the
  normalized batch, so Top-10 needs zero extra pulls/reads; history
  stays a thin single-item range (the 8 s full-week cost never enters
  either path).
- Last-good serving by design: a failed refresh keeps the previous batch
  (scheduler backoff still stamps the streak via the unchanged
  `api-failure` + rethrow path).
- Stub retired honestly: empty-before-first-refresh is empty-live, not a
  fixture; the version tag change makes the swap visible to callers.

**Verified:**
- `npm test` → 61 files, 387/387 pass.
- `npm run typecheck` + `npm run build` + `npm run build:electron` green.
- Review #216 CLEAR on `1a9f75a` + `00176cc` (agent-b independently
  re-verified 387/387 + typecheck + build:electron, served==observed).

**Carried nits (non-gating, review #216):**
- Doc drift: `refreshPipeline.ts` header L37-40 still says IPC fixtures
  stay stub; `market.handlers.ts` L10/16 comments still say stub-feed —
  now false after slice-3.
- `marketStub.ts` now dead in prod but still imported by old tests
  (filterWire, market, refreshPipeline, price-history). Mark deprecated
  or remove to avoid two truths.
- `buildLiveEntries` duplicates `scoreBatchSnapshots` verbatim; extract
  shared helper to prevent served/observed drift.
- `onBatch` shallow-copies array only (`[...snapshots]`); objects still
  aliased. Fine while the pipeline owns the batch, note it.
- Prototype-delegation test is weak: it calls the original repo directly
  rather than proving the capturing wrapper forwards. Code is correct;
  test does not disconfirm the #206 failure mode.
- Slice-2 perf-test wall-clock + concurrent-`captured` notes still open
  (benign under the double single-flight).
- Renderer log-viewer UI still queued (read path proven, S19 slice-3b).
- `Item <id>` fallback still stands (no metadata fetch in pipeline/serve).

## Sprint 20 (slice 2) — Scorer counts in the api-refresh log (2026-09-16)

**Goal:** answer "why didn't the rankings update?" with evidence in the
refresh log itself: log-only `rankingCandidates` / `ranked` counts
(observed, never served) alongside the S20 slice-1 snapshot/excluded
counts. Still no Top-10/history IPC change, no log-viewer UI.

**Did:**
- `electron/services/refreshPipeline.ts`: after persist, single O(N)
  in-memory pass over the normalized batch — `computeMetrics`
  single-point at batch timestamp + `rankOpportunities` BALANCED +
  `Item <id>` fallback + `historyMinutes` undefined (S6/S14 reuse
  verbatim). Success `info/api-refresh` message + details carry
  `rankingCandidates` / `ranked` suffixed `(observed)`; zero repo reads
  (counts captured via `saveSnapshots` wrapper, no extra pulls).
  Scorer throw → `error/api-failure` + rethrow (persist preserved,
  backoff intact); logging never throws into the pipeline either path.
- Tests: `tests/diagnostics/refreshPipeline.test.ts` extended — 378
  total (372 → 378): counts in message + details, Top-10/history IPC
  fixtures asserted stub-untouched, scorer-throw → api-failure +
  rethrow, scheduler adjacency, full-universe 4534-item sub-2s perf
  guard.

**Decisions:**
- Log-only by design: counts are named `rankingCandidates`/`ranked`
  (never served) and suffixed `(observed)` — the stub divergence stays
  explicit in the doc boundary until the live Top-10 slice lands.
- Reuse, not reinvent: single-point metrics + BALANCED rank keeps the
  counts on the same math the future live ranking will serve; only the
  100 GP price floor filters (undefined volume/history gates skip per
  `isCandidate`), matching the thin-evidence claim.

**Verified:**
- `npm test` → 60 files, 378/378 pass.
- `npm run typecheck` + `npm run build` + `npm run build:electron` green.
- Review #206 CLEAR on `6d4f200` (mail #207, agent-b independently
  re-verified 378/378 + typecheck + build, 2 files only, no IPC/main/
  scheduler change).

**Carried nits (non-gating, review #206):**
- `{...deps.repository}` spread loses prototype methods at runtime
  (both backends are classes). Harmless today — only `saveSnapshots`
  is called, close uses the original — explicit delegation would
  future-proof against a service change.
- Shared `captured` can interleave under direct concurrent refresh use;
  benign under the double single-flight, no action.
- Perf test uses wall-clock `Date.now` with a generous bound; scale
  guard, not a benchmark.
- Slice-1 nits still open + renderer log-viewer UI still queued behind
  the live Top-10/history IPC slice.

## Sprint 20 (slice 1) — Live pipeline refresh through the retained logger (2026-09-16)

**Goal:** replace the honest `(stub, no pipeline)` refresh with the real
fetch → normalize → persist path, observed by the S19 retained logger, so
the ring answers "why didn't the rankings update?" with evidence. Still
no scorer/ranking counts, no Top-10/history IPC change, no log-viewer UI.

**Did:**
- `electron/services/refreshPipeline.ts` (new): `createPipelineRefresh`
  — one refresh = `SnapshotService.refresh()` (provider + repository
  used verbatim, no interface change) with the main-owned logger as
  observer. Success logs `info/api-refresh` carrying real snapshot /
  excluded counts (message + details); failure logs `error/api-failure`
  with the failure message and rethrows so scheduler backoff still
  stamps the streak. Lazy logger supplier resolved per refresh;
  throwing supplier degrades to null; logging never throws into the
  pipeline on either path (never turns success into failure, never
  masks the original error).
- `electron/main.ts`: scheduler refresh is now
  `createLoggingRefresh(() => getAppLogger(), createPipelineRefresh(...))`
  over `createHistoryRepository` (SQLite when available, JSON fallback)
  with per-refresh `() => getAppLogger()` resolution on both layers;
  startup backend log kept on the S19 `void` + `.catch` idiom;
  `before-quit` releases the backend via `closeHistoryRepository`
  without blocking shutdown.
- Tests: `tests/diagnostics/refreshPipeline.test.ts` (new, 7 tests:
  success count log, failure error log + rethrow, null pass-through,
  throwing-logger both paths, throwing-supplier degrade, composition
  with `createLoggingRefresh` proving api-failure + scheduler
  adjacency) — 372 total (365 → 372).

**Decisions:**
- Pipeline composes under the S19 logging bridge rather than replacing
  it: the refresh log carries the counts, the adjacent `scheduler`
  event carries the outcome — no layer reformats the other's event.
- Failure rethrows by design (S19 backoff contract intact); only the
  logging itself is swallowed, never the pipeline error.
- Double single-flight (`SnapshotService` inFlight under scheduler
  inFlight) accepted as defense-in-depth, no action.

**Verified:**
- `npm test` → 60 files, 372/372 pass.
- `npm run typecheck` + `npm run build` + `npm run build:electron` green.
- Review #202 CLEAR on `a8ec1d3` (agent-b independently re-verified
  372/372 + typecheck + build, pure core untouched, scope honored).

**Carried nits (non-gating, review #202):**
- `before-quit` comment claims close failures are "already visible via
  the refresh log" — a `close()` throw would not appear there;
  harmless since swallowed by design.
- Live history now accumulates while Top-10/history IPC fixtures stay
  stub — renderer diverges from stored history until the scorer slice;
  honestly documented in code (`refreshPipeline.ts` boundary note),
  scorer-over-history ranking counts are the load-bearing next slice.
- Renderer log-viewer UI still queued behind the scorer slice (read
  path already proven).

## Sprint 19 (slice 3) — Retained logger + scheduler logging + read-only log IPC (2026-09-16)

**Goal:** close the review #193 carried nit (callback-local logger
discarded after startup) and expose the main-owned memory ring
read-only to the renderer. Still no history-backend touch, no UI
viewer, no diagnosis engine.

**Did:**
- Slice-3a (`4d91eef`) — `electron/services/appLogger.ts`:
  `getAppLogger`/`setAppLogger`/`initAppLogger`/`resetAppLogger`
  module-level retention so pipeline callers log into the same ring +
  file sink past launch. `electron/services/scheduler.ts`:
  `createLoggingRefresh` bridge — success logs `info/scheduler`,
  failure logs `error/scheduler` + rethrows (backoff unchanged); null
  logger pass-through; throwing log never masks the refresh outcome.
  `electron/main.ts`: `initAppLogger` at launch, stub refresh runs
  through the bridge (cheapest pipeline-caller disconfirm, no UI).
- Slice-3b (`2514c93`) — `shared/ipc.ts`: `LOG_GET_RECENT` /
  `LOG_GET_SUMMARY` + `LogRecentRequest/Response`/`LogSummaryResponse`
  reusing pure `AppLogEvent`/`LogSummary` verbatim; `OsrsApi.logs`
  optional (stale-preload precedent). `electron/ipc/logs.handlers.ts`
  (new): read-only recent (newest-N slice, invalid limit fail-closed)
  + summary from the memory ring, never file parsing; null logger
  returns empty reads, never throws; lazy `getLogger` supplier so a
  swapped instance never leaves a stale capture. `preload.ts` +
  `electronApi.fetchLogRecent/fetchLogSummary` with bridge-absent/stale
  `typeof` guards throwing `Desktop bridge unavailable`. Main wires
  `registerLogsHandlers` with `() => getAppLogger()`.
- Review #195 nits closed in 3b: stub success reads
  `refresh succeeded (stub, no pipeline)` vs real `refresh succeeded`
  with inner; lazy supplier in both main registration and
  `createLoggingRefresh` (throwing supplier degrades to null,
  per-request resolution); startup log carries `.catch` (no unhandled
  rejection).
- Tests: `tests/diagnostics/schedulerLogging.test.ts` (new, 3a) +
  `tests/ipc/logs.test.ts` (new, 3b) — 365 total (349 → 365).

**Decisions:**
- Retention is main-owned and module-level (S18 single-writer
  precedent); tests reset via `resetAppLogger`/`setAppLogger`, main
  never clears.
- Read-only IPC by design: no writes/clearing/diagnosis; renderer log
  viewer stays a future slice.
- Stub honesty: the success message names the stub while no real
  pipeline exists, so the log answers "why didn't the rankings
  update?" without masquerading.
- Summaries come from the memory buffer, never by parsing `app.log`.

**Verified:**
- `npm test` → 59 files, 365/365 pass.
- `npm run typecheck` + `npm run build` + `npm run build:electron` green.
- Review #199 CLEAR on `2514c93` (agent-b independently re-verified
  365/365 + typecheck + build, pure core untouched, scope honored).

**Carried nits (non-gating, review #199):**
- String limit `"5"` throws `Invalid log limit` rather than coercing
  (fail-closed, consistent with slice-1 strictness).
- `getSummary` handler ignores stray request args (correct, no params).
- Renderer log-viewer UI still deferred (read path only, as scoped).
- Slice-1/2 nits still open + S18 slice-1 nits + split-brain/
  Electron-proof gates.

## Sprint 19 (slices 1–2) — Application logging: pure core + file sink + main-owned logger (2026-09-16)

**Goal:** guide §44 logging so "Why didn't the rankings update?" is
answerable from one place: startup, API refresh, API failures, snapshot
count, ranking count, storage failures, scheduler events. No
history-backend touch, no IPC/UI yet (later slice), no diagnosis engine.

**Did:**
- Slice-1 (`303326d`) — `core/diagnostics/appLog.ts` (new, pure):
  `LogLevel`/`LogCategory` covering the seven guide §44 categories 1:1,
  `MAX_LOG_ENTRIES` (500, newest-wins ring) + `MAX_MESSAGE_CHARS` (500) +
  `MAX_DETAILS_CHARS` (2000) budgets, `createLogEvent`/`appendLogEvent`/
  `summarizeLog` (counts by level/category + last error + last event) +
  `formatLogEvent` single-line truth. Explicit `timestampMs`, frozen-input
  safe, fresh outputs. No fs/Electron/IPC/scheduler/UI/network/Date.now.
- Slice-2 (`17458fe`) — `storage/log/FileAppLogSink.ts` (new):
  append-only `<baseDir>/logs/app.log`, one `formatLogEvent` line per
  event, fail-closed BEFORE any fs touch (invalid events throw before
  mkdir), 512 KiB rotation to `app.log.1` (2 generations max — recent
  failure answer, not audit trail), single-writer discipline (main only,
  S18 SQLite precedent). `storage/paths.ts`: `logDir`/`appLogFile`.
  `electron/services/appLogger.ts` (new): main-owned ring + sink with
  `now` dep (S10/S11 precedent); sink failures become memory-only
  `storage` error events, never re-sent (no recursion, never throws —
  logging must not crash the pipeline it observes). `electron/main.ts`:
  startup `app started v…` log wired at launch.
- Tests: `tests/diagnostics/appLog.test.ts` +
  `tests/diagnostics/fileAppLogSink.test.ts` +
  `tests/diagnostics/appLogger.test.ts` + `paths` additions — 349 total
  (327 → 349).

**Decisions:**
- Formatting truth lives in the pure core; the sink calls
  `formatLogEvent` and never formats itself.
- Two log generations max by design; summaries come from the memory
  buffer, never by parsing the file.
- Sink failures stay memory-only (memory truth preserved); the failure
  event itself is a guide §44 `storage` category.
- No IPC/UI in these slices — renderer exposure waits for a later slice;
  no history-backend touch (no repository/selector imports anywhere).

**Verified:**
- `npm test` → 57 files, 349/349 pass.
- `npm run typecheck` + `npm run build` + `npm run build:electron` green.
- Review #193 CLEAR on `17458fe` (mail #194, agent-b independently
  re-verified 349/349 + typecheck + build, pure core untouched,
  no history-backend touch, scope honored).

**Carried nits (non-gating, review #193):**
- Logger instance is callback-local so the memory buffer is discarded
  after startup — slice-3 should retain module-level access when
  pipeline callers arrive.
- `void` floating log promise could unhandled-reject on invalid clock
  (trivial with valid literals).
- Concurrent `log()` stat-then-append can overshoot the cap (acceptable
  under documented single-writer); first-line-larger-than-cap writes
  oversized without rotation (trivial at 512 KiB vs ~100 B lines).
- Slice-1 nits still open (unfrozen `LOG_*` consts, unbounded in-memory
  details until format) + S18 slice-1 nits + split-brain/Electron-proof
  gates.

## Sprint 18 — SQLite history backend, MIGRATE verdict answered (2026-09-15)

**Goal:** answer the Sprint 17 MIGRATE verdict (roadmap §19): SQLite
`HistoryRepository` behind the verbatim interface so analytics never
notices the swap. JSON stays the always-available fallback; no
interface/schema change beyond the new backend.

**Did:**
- Slice-1 (`b4dce6e`) — `storage/sqlite/SqliteHistoryRepository.ts`
  (new): `node:sqlite` stdlib only (host node v24.14.1, Electron 44
  node v24.19 — same major, zero new deps, `better-sqlite3`
  deliberately NOT added). One `snapshots` + one `batches` table, WAL
  mode, single-writer discipline (one instance per process, `close()`
  releases the handle). Parity with `JsonHistoryRepository` — empty
  batch no-op, timestamp-exists dedupe skip, 7-day prune on save,
  oldest-first `getItemHistory`, newest-row `getLatestSnapshot`.
  Intentional divergence: corrupt DB throws fail-closed (SQLite cannot
  skip a corrupt page the way JSON skips a corrupt file).
  `storage/paths.ts`: `historyDbFile(baseDir)`. No wiring in this
  slice (JSON default, module never imported by main yet).
- Slice-2 (`f05c017`) — `storage/historyBackend.ts` (new):
  `createHistoryRepository` selector so live entry points never branch
  on the backend themselves. Dynamic-`import()` SQLite load gate:
  missing `node:sqlite` or a corrupt-DB constructor throw falls back
  to JSON (same interface, tolerant reads). `closeHistoryRepository`
  helper (no-op for JSON). `scripts/check-market.ts` wired through
  the selector + `History backend: <sqlite|json>` log. Main not
  instantiated yet (no live consumer — avoids a dead handle).
- Tests: `tests/storage/sqliteHistoryRepository.test.ts` (10:
  round-trip + range, newest-wins, empty no-op, dedupe skip, prune,
  NULL-optional round-trip, JSON parity on same batches, composite
  index exists, corrupt throws, use-after-close refused) +
  `tests/storage/historyBackend.test.ts` (4: sqlite-when-resolves,
  fallback on missing module, fallback on corrupt construction, close
  helper) — 327 total (313 → 323 → 327).

**Decisions:**
- One driver max: `node:sqlite` stdlib, no native dep.
- Fail-closed corrupt DB (surfacing beats silently serving partial
  history); fail-open backend selection (JSON fallback keeps the app
  alive wherever SQLite is missing).
- Repository interfaces untouched — analytics never notices the swap.

**Verified:**
- `npm test` → 54 files, 327/327 pass.
- `npm run typecheck` + `npm run build` + `npm run build:electron` green.
- Awaiting agent-b review of `f05c017`.

## Sprint 17 (bench) — Storage-bottleneck measurement, MIGRATE verdict (2026-09-15)

**Goal:** cheapest disconfirm for roadmap §19 (review #178): measure the
JSON history backend at full-week scale before any SQLite migration. No
schema/migration/dep/interface change — measurement only.

**Did:**
- `core/history/storageBench.ts` (new, pure): `makeBenchSnapshot`
  (deterministic full normalized shape —
  itemId/timestamp/high/low/highTime/lowTime/volume, never minimal
  fixtures), `summarizeLatencies` (nearest-rank mean/p95/min/max,
  fail-closed on empty/NaN), `evaluateStorageVerdict` (SKIP unless 7d
  total > 1 GiB OR history p95 > 1000 ms OR latest p95 > 500 ms).
- `scripts/check-storage-bench.ts` (new, manual tool + `npm run
  check:storage-bench`, `--quick` smoke): builds the full simulated week
  (2016 pulls = 7d × 288/day @ 5 min, 4534 items/pull) in a temp dir,
  runs prod-configured 7-day prune, then ≥20 repeats each of
  `getItemHistory` 7d-range + `getLatestSnapshot`. Zero network/timers;
  temp dir removed afterwards.
- Tests: `tests/storage/storageBench.test.ts` — 4 tests (full-shape
  snapshot, stats + rejection, verdict matrix, small-week repo
  round-trip through the prod-prune path) — 313 total (309 → 313).

**Raw numbers (full bench, `npm run check:storage-bench`):**
- Bytes/snapshot assumption: full normalized shape at 4534 items/pull;
  first file 550071 bytes (~121.3 bytes/snapshot).
- Post-prune: 2016 files, 1109016748 bytes (1.033 GiB); prod 7-day prune
  removed 0 (whole simulated week inside the retention window — file
  count reflects prune-on-save reality, not unbounded growth).
- `getItemHistory` 7d #4151: n=20 mean=8235.2 ms p95=9458.9 ms
  min=5644.8 ms max=10899.0 ms.
- `getLatestSnapshot` #4151: n=20 mean=3.2 ms p95=4.1 ms min=2.6 ms
  max=6.9 ms (newest-first early exit — week-size independent).
- Env: node v24.14.1 win32/x64, AMD Ryzen 5 5500, 15.9 GiB RAM
  (machine-dependent; rerun on target hardware before release tuning).

**Verdict: MIGRATE** — 7-day total 1109016748 bytes > 1 GiB AND history
p95 9458.9 ms > 1000 ms (latest p95 4.1 ms passes). The full-week
single-item scan parses ~1.1 GiB of JSON per call (~8 s mean); the
newest-only read stays trivial. SQLite migration (roadmap §19 tables)
is warranted; repository interfaces stay untouched so analytics never
notices the swap.

**Verified:**
- `npm test` → 52 files, 313/313 pass (bench script itself is manual,
  never part of the suite).
- `npm run typecheck` + `npm run build` green.
- Full bench measured, not extrapolated; `--quick` (12 pulls) smoke
  green for CI-speed sanity.

## Sprint 16 (slice 2) — Stateless quality IPC + pure DataQualityPanel (2026-09-14)

**Goal:** second trust surface (roadmap §18): stateless `quality:assess`
IPC + pure `DataQualityPanel` + Dashboard bridge/pure-fallback, zero
market-data fetching/persistence/scheduler. Close out review #170.

**Did:**
- `core/market/quality/qualityAssessment.ts` (new, pure): `assessDataQuality`
  orchestrator — single truth over the slice-1 primitives so the handler,
  the renderer fallback, and the panel never re-combine primitives in three
  places. Latest timestamp = max snapshot timestamp; empty batch is fully
  stale at `nowMs` (no observations = no freshness evidence);
  `missingItems` empty when universe unchecked; `duplicateBatch` null with
  no candidate/store context, fail-closed throw on partial duplicate
  context; `health` null with no counters, fail-closed throw on partial
  counters. Explicit `nowMs`, frozen-input safe, fresh outputs.
- `shared/ipc.ts`: `QUALITY_ASSESS` stateless contract (`input` wraps the
  pure `QualityAssessmentInput` — snapshots + explicit `nowMs` + optional
  universe/store/counter context; response carries the pure
  `QualityAssessment` verbatim); `OsrsApiQuality` optional surface.
- `electron/ipc/quality.handlers.ts` (new): applies pure `assessDataQuality`
  with `?? {}` defaults so absent request/input fails with the pure
  validator message; async so invalid inputs reject; wired in `main.ts`.
- `preload.ts` + `electronApi.assessQualityRequest`: bridge-absent/stale
  `typeof assessQuality !== 'function'` guards with pure fallback.
- `src/components/dashboard/DataQualityPanel.tsx` (new, pure):
  props-driven (`assessment`/`error`/`onAssess`), assessed-trust display
  only (freshness % + stale/fresh, staleness s-ago, missing sides/items,
  impossible count, duplicate new/already-stored/not-checked, health
  status + reason / not-checked), zero IPC/network/scheduler/persistence.
- `Dashboard.tsx`: owns assessment — bridge path when the preload has the
  quality surface, pure `assessDataQuality` fallback otherwise; input is
  the `historyPoints` batch already held (no fetch).
- Tests: `tests/quality/qualityAssessment.test.ts` +
  `tests/ipc/quality.test.ts` + `tests/ui/data-quality-panel.test.tsx` —
  16 tests (fresh/stale/duplicate/DOWN verdicts, fail-closed matrix incl.
  absent-request + partial duplicate/counter context, bridge
  absent/stale/delegate guards, panel verdict + bridge/fallback paths) —
  309 total (293 → 309).

**Decisions:**
- Stateless `quality:assess` by design (S13 `flip:calculate` precedent): no
  persistence, no scheduler, no market-data fetching — callers pass the
  observed batch in, assessed trust stays distinct from observed data.
- Main applies the pure orchestrator; renderer never recombines
  slice-1 primitives itself (single-truth orchestrator shared both sides).
- New `quality` bridge surface optional: stale preloads without it still
  typecheck; renderer keeps runtime `typeof` guards with pure fallback.

**Verified:**
- `npm test` → 51 files, 309/309 pass (zero network).
- `npm run typecheck` + `npm run build` green.
- Review #170 CLEAR on `aadb53b` (agent-b re-verified git clean, 309/309,
  typecheck+build green); nits non-gating, carried below.

**Carried nits (non-gating, review #170):**
- Dashboard assesses the single-item `historyPoints` batch, so
  duplicate/health read `not checked` until a full-batch context is wired.
- Empty-batch `stalenessMs = nowMs` works only because `Date.now()` is
  epoch-huge — explicit `Infinity` would be cleaner.
- S16 slice-1 nits still open (frozenFeed windowed-run, health errorRate
  uncapped, `freshnessScore` vs `freshnessFactor` label).

**Commits:** `aadb53b` slice-2 IPC + panel; this entry close-out.

## Sprint 16 (slice 1) — Pure data-quality core (2026-09-14)

**Goal:** first trust surface (roadmap §18): pure freshness / missing /
duplicate / impossible / spike / frozen-feed / provider-health checks with
zero IPC/persistence/UI/scheduler/fetch, per review #155 gates.

**Did:**
- `core/market/quality/dataQuality.ts` (new, pure): `stalenessMs` /
  `freshnessScore` (primary 1→0 over `STALE_AFTER_MS` = 15 min) /
  `isStaleData` (derived: stale ⇔ score ≤ 0, single truth) +
  `countMissingSides` (one-sided partials the normalizer keeps) /
  `trackMissingItems` (fresh sorted gap list) + `hasDuplicateTimestamp` /
  `isDuplicateBatch` (timestamp-exists, matching `JsonHistoryRepository`;
  content-equal + new timestamp is NOT a duplicate — it is `isFrozenFeed`)
  + `isImpossibleSnapshot` / `countImpossible` (positive-finite but absurd:
  any side > `MAX_GE_PRICE_GP` 2^31−1 or high < low crossed market →
  skip-count, never throw) + `isPriceSpike` (default 50%, suspicious not
  impossible) / `isFrozenFeed` (≥3 identical mids) + `assessProviderHealth`
  (pure fn of total/invalid/excluded/staleness/missing: DOWN >50% err or
  >60m stale; DEGRADED stale/>10%/missing; else HEALTHY). Explicit `nowMs`,
  frozen-input safe, strict-throw invalid (NaN/non-finite/≤0 shapes the
  normalizer never emits), fresh outputs.
- Tests: `tests/quality/dataQuality.test.ts` — 14 tests incl. both-direction
  non-overlap disconfirm (normalizer-keeps-but-quality-flags: stale pull +
  duplicate batch + crossed/over-cap + spike; quality-passes-but-
  normalizer-excludes + `computeConfidence` thin-history penalty) — 293
  total (279 → 293).

**Decisions:**
- Non-overlap documented in code: ≤0/non-finite stays the normalizer's
  exclusion; timestamp-dedupe persistence stays the repository's;
  `freshnessFactor` (<2h/48h) stays ranking evidence weight — quality fires
  only where those stay silent, proven both directions in tests.
- Invalid (caller bug) throws; impossible (market absurdity) skip-counts;
  suspicious (spike/frozen) flags-but-keeps — guide §45 mapping explicit.
- Slice-2 IPC/panel explicitly out (review #155 gate 5).

**Verified:**
- `npm test` → 48 files, 293/293 pass (zero network).
- `npm run typecheck` + `npm run build` green.

## Sprint 15 (slice 1) — Pure weight-variant comparison over S14 harness (2026-09-14)

**Goal:** first weight-tuning surface (roadmap §17, guide §51): pure
multi-period comparison of caller-supplied weight sets through the S14
scorer harness, past-only by inheritance, with comparability gates so
variants compete on identical evidence. Still zero IPC/persistence/UI/
scheduler/search; automated weight search stays out.

**Did:**
- `core/market/backtest/compareVariants.ts` (new, pure):
  `compareWeightVariants` runs every variant through the same stored
  histories over the same periods — per variant: `createScorerRankAt`
  (S14 past-only slice per T, weights-only delta per config) →
  per-period `runRankedBacktest` (S14 settle + summarize) → per-period
  outcomes plus cross-period aggregate (`meanAvgReturn`/`meanWinRate`
  unweighted means, one period = one vote; `totalTrades`/`totalUnsettled`
  sums; `rankedLabels` by mean return desc, label-asc tiebreak) —
  `weightVariantTag` content-aware `0.2-custom` tags from actual shares
  (mirroring the `rankingVersionForPreset` scheme), `MIN_COMPARISON_
  PERIODS = 3` floor. Strict-throw on <2 variants, bad/duplicate
  labels, `isValidWeights` per variant, weights-only delta
  (preset/minPrice/minVolume/minHistoryMinutes identical or throw),
  duplicate-weight tags, <3/duplicate/empty/NaN periods; frozen-input
  safe; fresh output objects per call.
- Tests: `tests/backtest/compareVariants.test.ts` — 6 tests (tag
  content-awareness, variant-gate matrix, weights-only + duplicate +
  period-gate matrix incl. downstream topN, momentum-vs-spread
  divergence disconfirm — climber vs flat-wide-spread fixtures →
  `rankedLabels [momentum, spread]`, momentum 3/3 wins meanWinRate 1 /
  meanAvgReturn >3 vs spread 0/0, frozen purity + double-run equality
  + fresh outputs) — 279 total (273 → 279).

**Decisions:**
- Weights-only delta enforced: a variant that also moves a filter would
  measure the filter, not the weights — preset/minPrice/minVolume/
  minHistoryMinutes must match across variants.
- No-future-leak inherited, not re-proven: ranking via S14
  `createScorerRankAt`, settlement via S14 slice-1 (reads only T +
  horizon); full-history-in stays safe for the same S14 reason.
- Aggregation without overclaim: unweighted means (each period one
  historical regime, one vote); overlapping periods double-count trades
  in the totals (documented — keep periods disjoint when totals must
  read as distinct trades); `rankedLabels` by mean return is the
  default ordering, not a claim return beats win rate/drawdown — full
  per-period summaries ship alongside for re-ranking.
- Carried non-gating nits (reviews #150/#151): `weightVariantTag`
  pct-rounding can false-collide sets differing by <0.005 (fail-closed,
  over-strict); topN/horizonMs/toleranceMs validation delegated
  downstream (fail-closed); zero-trade periods contribute avgReturn 0
  to the unweighted mean (documented one-vote semantics).

**Verified:**
- `npm test` → 47 files, 279/279 pass (zero network).
- `npm run typecheck` + `npm run build` green.

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
