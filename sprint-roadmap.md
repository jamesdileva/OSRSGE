# OSRS Grand Exchange Analyzer — Sprint Roadmap

**Document:** `sprint-roadmap.md`  
**Status:** Baseline Roadmap  
**Version:** 0.1

---

# 1. Roadmap Philosophy

Build the project vertically.

Each sprint should produce something that actually works rather than creating large amounts of infrastructure with no visible result.

Target progression:

```text
Sprint 0
Foundation
   ↓
Sprint 1
Electron + React shell
   ↓
Sprint 2
Market API
   ↓
Sprint 3
Historical storage
   ↓
Sprint 4
Analytics
   ↓
Sprint 5
Ranking engine
   ↓
Sprint 6
Dashboard
   ↓
Sprint 7
Item details + charts
   ↓
Sprint 8
Automation + reliability
   ↓
Sprint 9
Backtesting
   ↓
Sprint 10
Polish / release
```

---

# 2. Sprint 0 — Project Definition

## Goal

Lock down the project boundaries before writing implementation code.

## Tasks

- Create repository.
- Create README.
- Create architecture.md.
- Create sprint-roadmap.md.
- Create implementation-guide.md.
- Decide package manager.
- Decide Node/TypeScript versions.
- Confirm OSRS Wiki API documentation.
- Confirm API request requirements.
- Identify item metadata source.
- Define MVP scope.

## Deliverables

```text
README.md
architecture.md
sprint-roadmap.md
implementation-guide.md
```

## Verification

- Project can be cloned.
- Documentation explains the entire MVP.
- No implementation dependency has been left ambiguous.

---

# 3. Sprint 1 — Electron + React Foundation

## Goal

Create a secure desktop shell.

## Tasks

### Electron

- Add Electron.
- Create `electron/main.ts`.
- Create `electron/preload.ts`.
- Configure BrowserWindow.
- Enable context isolation.
- Disable node integration.
- Configure development URL.
- Configure production loading.

### React

- Keep Vite React TypeScript template.
- Create application layout.
- Create basic sidebar.
- Create dashboard placeholder.

### IPC

Create initial test channel:

```text
app:getVersion
```

## Deliverables

A desktop window launches successfully.

## Verification

```text
npm run dev
```

Expected:

- Electron opens.
- React renders.
- DevTools can be opened during development.
- React can call `app:getVersion`.
- No direct Node access exists in renderer.

---

# 4. Sprint 2 — Market Data Provider

## Goal

Successfully retrieve real OSRS GE data.

## Tasks

Create:

```text
core/market/providers/MarketDataProvider.ts
core/market/providers/WikiPriceProvider.ts
```

Define provider interface.

Implement:

- latest prices
- recent time-series data
- error handling
- timeout
- response validation

## Item metadata

Add item metadata retrieval/cache.

## Deliverables

A command or UI action can retrieve real market data.

## Verification

Display:

```text
Items received: XXXX
Timestamp: XXXXX
API status: OK
```

Check several known item IDs manually.

---

# 5. Sprint 3 — Normalization

## Goal

Stop the rest of the application from depending on raw API responses.

## Tasks

- Create normalized `MarketSnapshot`.
- Validate numeric fields.
- Normalize timestamps.
- Normalize missing values.
- Map item IDs to names.
- Reject invalid records.
- Track excluded records.

## Deliverables

```text
Raw API response
      ↓
Normalized internal model
```

## Tests

Test:

- valid record
- missing high
- missing low
- zero price
- invalid timestamp
- missing item metadata
- malformed API response

---

# 6. Sprint 4 — Local Historical Storage

## Goal

Start accumulating useful data.

## Tasks

Implement:

```text
HistoryRepository
JsonHistoryRepository
snapshotService
```

Store snapshots under the application data directory.

Implement:

- write snapshot
- read snapshot
- get snapshots by item
- get snapshots by time range
- cleanup/retention strategy

## Deliverables

The application can close and reopen without losing historical data.

## Verification

1. Run application.
2. Fetch data.
3. Close.
4. Reopen.
5. Verify previous snapshot exists.

---

# 7. Sprint 5 — Analytics Engine

## Goal

Turn snapshots into useful metrics.

## Implement

### Price change

```text
1h
6h
24h
```

### Spread

```text
spreadGp
spreadPct
```

### Volatility

Start with a simple rolling volatility model.

### Liquidity

Normalize activity/volume.

### Trend consistency

Compare multiple timeframes.

## Deliverables

For each candidate:

```text
price
change1h
change6h
change24h
spread
spreadPct
volatility
liquidity
trendConsistency
```

## Verification

Unit-test every metric using synthetic data.

---

# 8. Sprint 6 — Ranking Engine

## Goal

Produce the first legitimate Top 10.

## Tasks

Implement:

```text
scorer.ts
weights.ts
risk.ts
confidence.ts
```

Pipeline:

```text
Candidates
    ↓
Filtering
    ↓
Metric normalization
    ↓
Weighted score
    ↓
Risk adjustment
    ↓
Confidence adjustment
    ↓
Sort
    ↓
Top 10
```

## Deliverables

Typed:

```ts
Opportunity
```

object.

## Verification

Create synthetic market scenarios.

### Scenario A

High volume + moderate momentum.

Expected:

```text
high score
low/medium risk
```

### Scenario B

Huge price spike + almost no activity.

Expected:

```text
lower score
high risk
```

### Scenario C

Stable positive trend + healthy liquidity.

Expected:

```text
strong score
low risk
```

---

# 9. Sprint 7 — Dashboard

## Goal

Make the ranking useful at a glance.

## Build

### Header

- application name
- last update
- refresh button
- API status

### Market summary

- items analyzed
- opportunities found
- average market movement
- last snapshot

### Top 10

Columns:

```text
#
Item
Price
1h
6h
24h
Spread
Liquidity
Risk
Score
```

## Deliverables

A user can open the app and immediately understand the day's strongest opportunities.

---

# 10. Sprint 8 — Item Details

## Goal

Make rankings explainable.

## Build

Item details page/panel.

Display:

- item name
- price
- price history
- 1h change
- 6h change
- 24h change
- spread
- liquidity
- volatility
- estimated profit
- risk
- confidence
- score breakdown

## Score breakdown

Example:

```text
Momentum        26 / 30
Liquidity       17 / 20
Spread          14 / 20
Profitability   12 / 15
Consistency      8 / 10
Volatility       4 / 5
--------------------------------
Base Score      81 / 100
```

Then show risk/confidence adjustments.

---

# 11. Sprint 9 — Filters and Ranking Controls

## Goal

Allow different trading styles.

## Filters

- F2P
- members
- price range
- risk
- liquidity
- minimum score
- category

## Presets

### Conservative

High liquidity, low volatility.

### Balanced

Default ranking.

### Aggressive

Allows higher volatility.

### Cheap flips

Emphasizes low unit price.

### High profit

Emphasizes estimated profit per limit.

---

# 12. Sprint 10 — Auto Refresh

## Goal

Turn the application into a continuously updating market monitor.

## Tasks

- scheduler
- configurable interval
- refresh status
- background update
- renderer notification
- prevent overlapping refreshes
- retry logic
- exponential backoff

## UI

```text
Auto Refresh: ON
Interval: 5 minutes
Next update: 03:42
```

---

# 13. Sprint 11 — Watchlist

## Goal

Allow users to monitor specific items.

## Features

- add item
- remove item
- current price
- change
- spread
- risk
- mini chart

Persist locally.

---

# 14. Sprint 12 — Alerts

## Goal

Notify the user when opportunities meet conditions.

Examples:

```text
Abyssal whip:
Score > 80

Rune ore:
24h change > 5%

Item:
Spread > 10%
```

Notifications should be optional.

---

# 15. Sprint 13 — Flip Calculator

## Goal

Turn market analytics into actionable calculations.

Inputs:

```text
Available GP
Item
Buy price
Sell price
Quantity
```

Calculate:

```text
gross profit
tax
net profit
ROI
profit per hour estimate
capital efficiency
```

Respect buy limits.

Clearly distinguish calculated values from observed market data.

---

# 16. Sprint 14 — Backtesting

## Goal

Determine whether the ranking algorithm actually works.

## Tasks

Create historical simulation.

At each historical point:

```text
calculate ranking
select Top 10
simulate entry
measure later price
```

Metrics:

- average return
- median return
- win rate
- max drawdown
- false-positive rate
- opportunity hit rate

## Most important goal

Determine whether ranking weights improve outcomes.

---

# 17. Sprint 15 — Weight Optimization

## Goal

Use backtesting to tune the deterministic model.

Test:

```text
Momentum: 20–40%
Liquidity: 10–30%
Spread: 10–30%
Profitability: 10–25%
Consistency: 5–20%
Volatility: 0–15%
```

Do not optimize against a single day.

Use multiple historical periods.

---

# 18. Sprint 16 — Data Quality System

## Goal

Make the application trustworthy.

Add:

- freshness score
- missing-data tracking
- API anomaly detection
- duplicate snapshot detection
- impossible-price detection
- stale-data detection
- provider health status

---

# 19. Sprint 17 — SQLite Migration

Only do this if JSON becomes a bottleneck.

Tables:

```text
items
market_snapshots
daily_metrics
ranking_runs
watchlist
settings
```

The existing repository interfaces should allow this migration without changing the analytics engine.

---

# 20. Sprint 18 — Release Engineering

## Tasks

- electron-builder
- Windows installer
- application icon
- versioning
- logging
- crash-safe storage
- configuration migration
- clean uninstall behavior
- README installation instructions

---

# 21. Future Sprint — ML Experiment

Only after substantial historical data exists.

Create a separate experimental module.

Compare:

```text
Deterministic Ranker
vs
ML Ranker
```

The ML system must beat the deterministic baseline consistently before becoming production ranking logic.

---

# 22. Milestone Definitions

## Milestone A — Working App

Sprints 1–4.

Result:

```text
Electron desktop app
+
real GE data
+
local history
```

## Milestone B — Useful Analyzer

Sprints 5–7.

Result:

```text
metrics
+
ranking
+
Top 10 dashboard
```

## Milestone C — Trading Research Tool

Sprints 8–13.

Result:

```text
charts
+
filters
+
watchlist
+
alerts
+
flip calculator
```

## Milestone D — Validated Ranking Engine

Sprints 14–16.

Result:

```text
backtesting
+
optimized weights
+
data quality
```

## Milestone E — Production Desktop App

Sprints 17–18.

Result:

```text
SQLite if needed
+
installer
+
polished application
```

---

# 23. MVP Definition

The MVP is complete when all of the following work:

- Electron launches.
- React renders.
- API data is fetched.
- Item names are available.
- Data is normalized.
- Historical snapshots are saved.
- 1h/6h/24h metrics work when sufficient history exists.
- Candidates are filtered.
- Opportunity scores are calculated.
- Risk is calculated.
- Confidence is calculated.
- Top 10 is displayed.
- Manual refresh works.
- Automatic refresh works.
- API errors are handled.
- Rankings explain their scores.

---

# 24. Important Development Rule

Do not move to a later sprint because the UI "looks good."

Move forward only when the underlying behavior has been verified.

For every sprint:

```text
Implement
   ↓
Test
   ↓
Verify
   ↓
Document
   ↓
Commit
   ↓
Next sprint
```

---

# 25. Expected First Useful Version

The first genuinely useful application should answer:

> "If I opened OSRS right now and wanted to flip something, what 10 items should I investigate first, and why?"

That question is the product's north star.
