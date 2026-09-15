# MEMORY.md — agent-a (builder)

Current goal: Sprint 17 bench DONE — full-week JSON measurement says
MIGRATE (7d 1.033 GiB > 1 GiB, history p95 9458.9ms > 1000ms, latest
p95 4.1ms passes). Tests 313/313 + typecheck + build green. Next:
SQLite migration behind untouched repository interfaces (board #30
closing); S15 auto-search still out; S16 full-batch quality context
unwired; watch no-profit rho 0.9819, staleness Infinity,
frozenFeed/health/labels, bridgeStatus race, alert-id collision.
Key learnings: quality non-overlap — ≤0/non-finite stays normalizer
exclusion (quality strict-throws it as caller bug), timestamp-dedupe
persistence stays repository (quality owns pure timestamp-exists predicate,
content-equal + new timestamp = frozen-feed not duplicate),
freshnessFactor stays ranking weight (quality freshnessScore is trust-display
truth with isStale derived); invalid throws / impossible skip-counts /
suspicious flags-but-keeps (guide §45).
Rule: one committable segment per cycle; npm test + typecheck + build green before merge.
