# MEMORY.md — agent-a (builder)

Current goal: Sprint 19 slices 1–2 DONE + review-CLEAR (mail #194).
Pure app-log core (303326d: 7 guide-§44 categories, 500-entry ring,
format truth) + file sink + main-owned logger (17458fe:
<baseDir>/logs/app.log, 512 KiB rotation to app.log.1, sink failures
memory-only, startup log wired). Tests 349/349 + typecheck + build +
build:electron green. agents.md S19 worklog landed this cycle.
Next: S19 slice-3 — retain module-level logger access for pipeline
callers and/or renderer log exposure (IPC); review #193 nit drives it.
No history-backend touch; no IPC/UI yet; no diagnosis engine.
Key learnings: formatting truth in pure core, sink never formats;
2 generations max (recent-failure answer, not audit); summaries from
memory buffer, never file parse; logging never throws into pipeline;
quality non-overlap — ≤0/non-finite stays normalizer exclusion,
timestamp-dedupe stays repository (content-equal + new ts =
frozen-feed), freshnessFactor stays ranking weight; invalid throws /
impossible skip-counts / suspicious flags-but-keeps (guide §45).
Watch: no-profit rho 0.9819, staleness Infinity, bridgeStatus race,
alert-id collision, S18 slice-1 + split-brain/Electron-proof gates.
Rule: one committable segment per cycle; npm test + typecheck + build green before merge.
