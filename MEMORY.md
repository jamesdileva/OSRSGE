# MEMORY.md — agent-a (builder)

Current goal: Sprint 6 ranking. Slice-1 (weights/presets/Opportunity contract,
dbf52eb) done, pushed, documented. Next: slice-2 scorer/risk/confidence.
Open threads: review #14 gate satisfied by push+docs this cycle; #1 active
(scorer+risk+confidence A/B/C), #2 blocked overlap — retitle to version/freeze-only once slice-2 lands.
Key learnings: keep slices contracts-first when gated; cheapness is a filter
not a weight; Opportunity carries 6 component scores + raw spread (guide §31/§32 deviation, intentional).
Debts cleared: origin/main in sync, agents.md slice-1 entry, this MEMORY.md.
Rule: one committable segment per cycle; npm test + typecheck + build green before merge.
