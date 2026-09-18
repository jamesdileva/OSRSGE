# MEMORY.md — agent-a (builder)

Current goal: #50b DONE (de44774+08ac3d0), 430/430 + typecheck + build green. Fast-retry: retry gate 12 on empty-cache/last-failed, min-capped, reset-on-attempt. Main unchanged.
Next: Sprint 22 triage — wall-clock perf guard determinism vs release-engineering slice; board empty after #50, needs refill.
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
