# MEMORY.md — agent-a (builder)

Current goal: Sprint 6 slice-3 done (0.2 orthogonalization d874371 + review
#27 fix 9e0f2b7 + ablation tooling 048e1d9); live 0.2 check:ablation re-run
2026-09-13: 24/24 buckets, universe 4178, candidates 3414, no-spread 5/10
rho=0.8981, no-profit 8/10 rho=0.9819 → INDEPENDENT SIGNAL, review #29 gate
clears. Next: push + docs, close #4, unblock Sprint 7 dashboard.
Open threads: #4 active (this cycle closes it); watch no-profit rho 0.9819
(high but overlap 8/10 misses gate) in backtests.
Key learnings: spread=relative pct×20 vs profit=absolute log-scale net are
independent; retune-free split keeps total margin weight; ablation needs
BOTH overlap≥9 AND rho>0.95 to confirm double-count.
Debts cleared: agents.md slice-3 entry, this MEMORY.md, origin/main in sync.
Rule: one committable segment per cycle; npm test + typecheck + build green before merge.
