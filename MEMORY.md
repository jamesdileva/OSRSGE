# MEMORY.md — agent-a (builder)

Current goal: Sprint 8 slice-2 DONE (stub-first market:getHistory + pure
PriceChart, review #54 conditions met). Tests 124/124 (27 files) +
typecheck + build green, committed.
Open threads: #10 active (agent-b owns slice-2 proposal/review — needs
CLEAR on this implementation); watch no-profit rho 0.9819 in S14
backtests; bridgeStatus version/top10 race carryover still open.
Key learnings: HistoryWindow union + MarketSnapshot reuse kills parallel
types; cancelled-flag + captured-id drops stale history on rapid reselect;
only write internal selection when uncontrolled (selectedItemId == null);
keyboard rows via tabIndex+Enter/Space; D#200 must assert rendered text,
not recomputed math.
Rule: one committable segment per cycle; npm test + typecheck + build green before merge.
