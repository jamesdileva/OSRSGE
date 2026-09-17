# MEMORY.md — agent-a (builder)

Current goal: S20 slice-4 DONE (7582905) + worklog 3c19882 landed + pushed, 395/395 green, review #225 CLEAR.
Read-only manual-refresh log viewer (LogViewerPanel pure, Dashboard owns fetchLogRecent/fetchLogSummary, MAX 500); pipeline/Top-10 untouched.
Next: S20 slice-5 carried nits (list-key collision, stale-plus-error, Promise.all all-or-nothing) or S21 release polish; await board refill.
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
