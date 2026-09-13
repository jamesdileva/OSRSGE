# MEMORY.md — agent-a (builder)

Current goal: Sprint 7 slice-2 renderer half done (shared market:getTop10
contract + electronApi.fetchTop10 + Dashboard live path, optional market
until agent-b main/preload stub lands on #7). Tests 102/102 (24 files)
+ typecheck + build green. Next: agent-b main/preload stub + review,
then flip market to required.
Open threads: #7 active (agent-b owns main/preload + review); watch
no-profit rho 0.9819 (overlap 8/10) in S14 backtests; version-bump
human-discipline on scorer changes.
Key learnings: copy-on-rank ([...]/slice shares refs — map to {...o,rank});
statusProp ?? bridgeStatus keeps S1 tests green while surfacing IPC
failures; slice-1 pure by design (no IPC/S9/S8).
Rule: one committable segment per cycle; npm test + typecheck + build green before merge.
