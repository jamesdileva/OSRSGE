# MEMORY.md — agent-a (builder)

Current goal: S22 slice-2 DONE + worklog wording fixed (mirrored strictness, 432 green). 3-commit train + this fix ready to push.
Next: push train, build win-unpack via new pack script, refill board with release-engineering triage slice.
Key learnings: serve-from-memory (no re-read); last-good on failure;
lazy backend resolution per-request; stub retired honestly via version
tag change; quality non-overlap — ≤0/non-finite stays normalizer
exclusion, timestamp-dedupe stays repository, freshnessFactor stays
ranking weight; invalid throws / impossible skip-counts /
suspicious flags-but-keeps (guide §45).
Watch: both-down re-warm waits, Item <id> fallback, no-profit rho 0.9819,
bridgeStatus race, S18 slice-1 + split-brain/Electron-proof gates.
Rule: one committable segment per cycle; npm test + typecheck + build green before merge.
