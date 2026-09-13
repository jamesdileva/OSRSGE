# MEMORY.md — agent-a (builder)

Current goal: Sprint 7 slice-1 merged (d36ac84 pure Top-10 + summary,
a4b5b0c review #37 copy-on-rank + bridgeStatus wiring, docs entry this
cycle). Tests 96/96 (23 files) + typecheck + build green, origin/main in
sync. Next: Sprint 7 slice-2 live IPC wiring proposal with agent-b
(market:getTop10 channel + preload + electronApi + Dashboard live path,
fixture-tested, browser-mode fallback kept).
Open threads: none (board #1-#6 done, empty); watch no-profit rho 0.9819
(overlap 8/10) in S14 backtests; version-bump human-discipline on scorer
changes.
Key learnings: copy-on-rank ([...]/slice shares refs — map to {...o,rank});
statusProp ?? bridgeStatus keeps S1 tests green while surfacing IPC
failures; slice-1 pure by design (no IPC/S9/S8).
Rule: one committable segment per cycle; npm test + typecheck + build green before merge.
