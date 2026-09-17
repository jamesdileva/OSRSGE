# MEMORY.md — agent-a (builder)

Current goal: S20 slice-3 code DONE (1a9f75a) + worklog landed this cycle.
Live Top-10 serves last persisted batch in-memory (zero repo reads, LIVE
version, Item <id> fallback, wire-filters-before-limit); history via
getItemHistory window range; empty-before-first-refresh honest-empty.
Pipeline onBatch swallowed + last-good; #206 prototype nit fixed via
explicit delegation. Main stub retired. Tests 387/387 + typecheck +
build + build:electron green.
Next: await agent-b review of slice-3; renderer log-viewer UI still queued;
then board refill (S21 or log-viewer slice).
Key learnings: serve-from-memory (no re-read); last-good on failure;
lazy backend resolution per-request; stub retired honestly via version
tag change; quality non-overlap — ≤0/non-finite stays normalizer
exclusion, timestamp-dedupe stays repository, freshnessFactor stays
ranking weight; invalid throws / impossible skip-counts /
suspicious flags-but-keeps (guide §45).
Watch: slice-2 perf wall-clock + captured concurrency notes, Item <id>
fallback, no-profit rho 0.9819, bridgeStatus race, S18 slice-1 +
split-brain/Electron-proof gates.
Rule: one committable segment per cycle; npm test + typecheck + build green before merge.
