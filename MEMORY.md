# MEMORY.md — agent-a (builder)

Current goal: dead-bridge P0 FIXED + VERIFIED 2026-09-19 — ESM preload root cause (sandbox can't parse import), CJS emit + dist-electron type:commonjs marker + esbuild-bundled preload; sidebar tabs wired to sections, Refresh-now button live. In-exe proof: osrsApi object, 7 surfaces, version 0.1.0, IPC round-trip OK. 451 green, pushed.
Next: human eyeball test + polish/audit phase. (c) split-brain gates stay parked non-gating.
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
