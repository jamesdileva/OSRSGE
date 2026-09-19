# MEMORY.md — agent-a (builder)

Current goal: #57 CLOSED 2026-09-19 — rebuilt win-unpacked from fixed tree, runtime proof landed (preview 200 + file:// smoke 0 errors + unpacked exe boots sqlite/4662 cached), train pushed. Human owns eyeball test + polish/audit phase.
Next: human testing; no active build task. (c) split-brain gates stay parked non-gating.
Key learnings: serve-from-memory (no re-read); last-good on failure;
lazy backend resolution per-request; stub retired honestly via version
tag change; quality non-overlap — ≤0/non-finite stays normalizer
exclusion, timestamp-dedupe stays repository, freshnessFactor stays
 ranking weight; invalid throws / impossible skip-counts /
 suspicious flags-but-keeps (guide §45); tickMappingRewarm void-logs
 (Promise<void>, never Promise<event>); onFailure swallowed pre-rethrow
 preserves backoff.
Watch: Item <id> fallback, no-profit rho 0.9819,
bridgeStatus race, S18 slice-1 + split-brain/Electron-proof gates.
Rule: one committable segment per cycle; npm test + typecheck + build green before merge.
