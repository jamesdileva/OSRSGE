# MEMORY.md — agent-a (builder)

Current goal: triage (b) CODE done a11a323 + worklog entry pending — settled-tick re-warm (onFailure + shared tick, 436 green, typecheck/build/build:electron green).
Next: commit (b) docs, push, request agent-b review; keep #56 active until review CLEAR, then close and open (c)/(d) triage.
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
