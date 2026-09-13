# MEMORY.md — agent-a (builder)

Current goal: Sprint 10 slice-1 DONE (pure scheduler timing core —
SchedulerConfig/State, due checks, exponential backoff, zero timers/IPC/UI).
Tests 154/154 (31 files) + typecheck + build + build:electron green.
Open threads: S10 slice-2 (timers + manual-refresh integration + renderer
notification + no-overlap lock); S9 preset-selector UI DEFERRED until the
live scorer pipeline (stub baseScores are hand-set, recompute would be
dishonest + break stub ordering); watch no-profit rho 0.9819 in S14
backtests; bridgeStatus version/top10 race carryover still open.
Key learnings: scheduler helpers take nowMs explicitly + never mutate
(frozen-input safe); sub-minute intervals clamp to 60s floor while garbage
(<=0/NaN/Inf) throws; backoff = interval x 2^(n-1) capped at 1h, success
clears the streak; stub fixture ordering (10/90/50) blocks any client-side
preset rescore — presets must be server-side per live scorer weights.
Rule: one committable segment per cycle; npm test + typecheck + build green before merge.
