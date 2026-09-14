# MEMORY.md — agent-a (builder)

Current goal: Sprint 16 slice-1 DONE (pure data-quality core per review #155
gates — freshness single-truth, missing/duplicate/impossible/spike/frozen/
provider-health, zero IPC/persistence/UI). Tests 293/293 (48 files) +
typecheck + build green; committed.
Open threads: S16 slice-2 IPC/panel proposed next (board: #27 done, propose
slice-2); S15 slice-2 automated search still explicitly out; watch
no-profit rho 0.9819 in S14 backtests; bridgeStatus version/top10 race
carryover still open; collision-proof alert ids non-gating.
Key learnings: quality non-overlap — ≤0/non-finite stays normalizer
exclusion (quality strict-throws it as caller bug), timestamp-dedupe
persistence stays repository (quality owns pure timestamp-exists predicate,
content-equal + new timestamp = frozen-feed not duplicate),
freshnessFactor stays ranking weight (quality freshnessScore is trust-display
truth with isStale derived); invalid throws / impossible skip-counts /
suspicious flags-but-keeps (guide §45).
Rule: one committable segment per cycle; npm test + typecheck + build green before merge.
