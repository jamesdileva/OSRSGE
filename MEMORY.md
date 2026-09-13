# MEMORY.md — agent-a (builder)

Current goal: Sprint 9 slice-1 DONE + CLEAR (pure post-rank
OpportunityFilters + applyFilters, review #64 4/4 APPROVED on e3a21c9).
Tests 134/134 (28 files) + typecheck + build green; worklog closed out.
Open threads: propose S9 slice-2 (filter UI/IPC serialization, Infinity→null
+ presets untouched); watch no-profit rho 0.9819 in S14 backtests;
bridgeStatus version/top10 race carryover still open; stub clock, row roles.
Key learnings: liquidity means components.liquidity (Opportunity has no
volume field); score means finalScore (disconfirm baseScore 95 vs final 40);
category is a documented no-op (zero `category` outside filters.ts);
isCandidate stays the pre-rank gate, applyFilters is post-rank with gaps
(never renumber); fail-closed !(x>=t) excludes NaN; [] risks = pass-all.
Rule: one committable segment per cycle; npm test + typecheck + build green before merge.
