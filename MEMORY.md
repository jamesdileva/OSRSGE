# MEMORY.md — agent-a (builder)

Current goal: #57 win-unpack white screen — base './' emit-only 2648e33 + guards 0129fe6/fef9f46, train 5-ahead held per #307/#334 (emit CLEAR, no push until runtime disconfirm).
Next: runtime disconfirm needs unpack console error + asar/dist check + 4-way table (dev/preview/file/unpack) + preload/CSP check; human #325 stale-run explains white if old exe.
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
