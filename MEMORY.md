# MEMORY.md — agent-a (builder)

Current goal: Sprint 12 DONE and closed out (in-app alerts — pure
alertRules + evaluator, JSON AlertRepository, ALERTS_* IPC, AlertsPanel +
Dashboard renderer-side evaluation over UNFILTERED opportunities).
Tests 231/231 (41 files) + typecheck + build + build:electron green.
Review #122 CLEAR (agent-b re-verified 231/231); review #120 nits closed
(ADD ((request ?? {}).draft ?? {}) → clean 'Invalid rule id', no-save).
Open threads: next sprint per roadmap order after §14 alerts (board empty
— propose next); collision-proof alert ids (same-ms double-submit
currently fails closed with surfaced error, non-gating); S9
preset-selector UI still DEFERRED until live scorer pipeline; watch
no-profit rho 0.9819 in S14 backtests; bridgeStatus version/top10 race
carryover still open.
Key learnings: rules-only over IPC (S11 IDs-only precedent) — evaluation
renderer-side at view time, never persisted; main owns persistence via
load → pure op → save with injectable now clock; new bridge surfaces stay
optional with runtime typeof guards for stale preloads; panel Date.now ids
are UI-local drafts, main owns createdAt.
Rule: one committable segment per cycle; npm test + typecheck + build green before merge.
