# OSRS Grand Exchange Analyzer — Implementation Guide

**Document:** `implementation-guide.md`  
**Status:** Baseline Implementation Guide  
**Version:** 0.1

---

# 1. Purpose

This document explains **how** the architecture should actually be implemented.

The architecture document defines what the system is.

This document defines how to build it correctly.

---

# 2. Implementation Order

Use this order:

```text
1. Project setup
2. Electron shell
3. Preload IPC
4. React application
5. Market provider
6. Data normalization
7. Item metadata
8. Local storage
9. Analytics
10. Ranking
11. IPC integration
12. Dashboard
13. Item details
14. Scheduler
15. Tests
16. Packaging
```

Do not build the ranking algorithm directly inside a React component.

---

# 3. Project Initialization

Create the application using Vite React TypeScript.

Recommended baseline:

```bash
npm create vite@latest osrs-ge-analyzer -- --template react-ts
cd osrs-ge-analyzer
npm install
```

Install Electron/build tooling:

```bash
npm install electron
npm install -D electron-builder concurrently wait-on
```

Install analytics/UI dependencies as needed:

```bash
npm install chart.js react-chartjs-2
npm install zod
npm install lucide-react
```

Testing:

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom
```

---

# 4. TypeScript Strategy

Use strict TypeScript.

```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

Do not use `any` for market data.

Bad:

```ts
function analyze(data: any) {}
```

Better:

```ts
function analyze(data: MarketSnapshot[]) {}
```

External API data should be treated as unknown until validated.

---

# 5. Electron Main Process

`electron/main.ts` owns application lifecycle.

Responsibilities:

```text
create window
register IPC
initialize services
initialize scheduler
shutdown cleanly
```

Pseudo-flow:

```ts
app.whenReady().then(async () => {
  initializeApplicationServices();
  registerIpcHandlers();
  createWindow();
  startScheduler();
});
```

---

# 6. Secure BrowserWindow

Use:

```ts
new BrowserWindow({
  webPreferences: {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true
  }
});
```

The renderer should never receive unrestricted Node APIs.

---

# 7. Preload API

Create a typed bridge.

Example:

```ts
contextBridge.exposeInMainWorld("osrsApi", {
  market: {
    getTopOpportunities: () =>
      ipcRenderer.invoke("market:getTopOpportunities"),

    refresh: () =>
      ipcRenderer.invoke("market:refresh"),

    getItemHistory: (itemId: number) =>
      ipcRenderer.invoke("market:getItemHistory", itemId)
  }
});
```

Never do:

```ts
contextBridge.exposeInMainWorld("ipc", ipcRenderer);
```

That exposes too much power.

---

# 8. Global Window Types

Create a shared declaration.

Example:

```ts
interface OsrsApi {
  market: {
    getTopOpportunities(): Promise<Opportunity[]>;
    refresh(): Promise<RefreshResult>;
    getItemHistory(itemId: number): Promise<MarketSnapshot[]>;
  };
}
```

Then:

```ts
declare global {
  interface Window {
    osrsApi: OsrsApi;
  }
}
```

This prevents React code from using `(window as any)`.

---

# 9. Market Provider Interface

Create:

```text
core/market/providers/MarketDataProvider.ts
```

Example:

```ts
export interface MarketDataProvider {
  getLatest(): Promise<RawLatestResponse>;
  getFiveMinute(): Promise<RawFiveMinuteResponse>;
  getHourly(): Promise<RawHourlyResponse>;
}
```

The interface exists so the ranking system does not care which external provider is being used.

---

# 10. Wiki Provider

Create:

```text
core/market/providers/WikiPriceProvider.ts
```

Responsibilities:

- HTTP requests
- timeout
- headers
- response parsing
- API errors

Do not perform scoring here.

The provider should answer:

> "What did the API tell us?"

It should not answer:

> "What should we buy?"

---

# 11. API Client

Use a small HTTP abstraction.

Example responsibilities:

```text
request()
timeout()
retry()
status validation
JSON parsing
```

Do not scatter:

```ts
fetch("https://...")
```

throughout the project.

All external network access should be centralized.

---

# 12. Validate External Data

External API data should enter the application as:

```ts
unknown
```

Then validate it.

A schema validation library such as Zod can help.

Conceptually:

```text
unknown
 ↓
schema validation
 ↓
Raw API model
```

Invalid records should be rejected and counted rather than crashing the entire refresh.

---

# 13. Item Metadata

Create:

```text
core/items/itemMetadata.ts
```

The item metadata system should provide:

```ts
getItem(id)
getAllItems()
getItemName(id)
```

Cache metadata locally.

Never make one network request per item during ranking.

That would be extremely inefficient.

---

# 14. Normalization

Create:

```text
core/market/normalization/normalizer.ts
```

The normalizer transforms provider-specific data:

```text
Wiki API
   ↓
Normalizer
   ↓
MarketSnapshot
```

Example:

```ts
{
  itemId: 4151,
  timestamp: 1234567890,
  high: 2100000,
  low: 2050000,
  highTime: ...,
  lowTime: ...
}
```

The rest of the application only sees the normalized representation.

---

# 15. Historical Storage

Create repository interface:

```ts
export interface HistoryRepository {
  saveSnapshots(snapshots: MarketSnapshot[]): Promise<void>;

  getItemHistory(
    itemId: number,
    from: number,
    to: number
  ): Promise<MarketSnapshot[]>;

  getLatestSnapshot(
    itemId: number
  ): Promise<MarketSnapshot | null>;
}
```

Then implement:

```text
JsonHistoryRepository
```

Later:

```text
SqliteHistoryRepository
```

No analytics code should import either implementation directly.

---

# 16. Where Local Data Goes

Use Electron's application data directory.

Conceptually:

```text
app.getPath("userData")
```

Then:

```text
OSRS-GE-Analyzer/
├── cache/
├── history/
├── settings.json
└── logs/
```

Do not write persistent data into:

```text
src/
dist/
project root/
```

---

# 17. Snapshot Frequency

Start with:

```text
every 5 minutes
```

Each refresh:

```text
fetch
 ↓
validate
 ↓
normalize
 ↓
save snapshot
 ↓
calculate metrics
 ↓
rank
 ↓
notify renderer
```

Avoid overlapping refreshes.

Use a lock:

```ts
if (refreshInProgress) {
  return;
}
```

---

# 18. Analytics Architecture

Analytics should be pure functions whenever possible.

Example:

```ts
calculatePriceChange(history, window)
calculateSpread(snapshot)
calculateVolatility(history)
calculateLiquidity(history)
calculateTrendConsistency(history)
```

Pure functions are easier to test.

---

# 19. Price Change

Use:

```text
changePct =
((currentPrice - historicalPrice) / historicalPrice) * 100
```

Guard against:

```text
historicalPrice <= 0
missing historical point
insufficient history
```

Return an explicit missing value instead of producing:

```text
Infinity
NaN
```

---

# 20. Time Alignment

Do not assume a snapshot exactly 24 hours old exists.

If the desired timestamp is:

```text
T = now - 24 hours
```

select the closest valid observation within an acceptable tolerance.

Example:

```text
target = 14:00
available = 13:55, 14:05
```

Select the closest observation.

This makes the system robust to missed refreshes.

---

# 21. Spread Calculation

Use the observed high/low values carefully.

Conceptually:

```text
spreadGp = sellSide - buySide
```

But verify the API semantics before naming the values "buy" and "sell."

The application should maintain a clear distinction between:

```text
observed API values
```

and:

```text
estimated executable prices
```

Do not claim that a market-data midpoint is a guaranteed fill price.

---

# 22. Liquidity

Liquidity should not simply equal:

```text
volume / 1000
```

Instead:

1. calculate activity
2. compare it against the candidate universe
3. normalize
4. convert to a score

Example percentile concept:

```text
top 1% volume → 100
top 10%       → 90
median        → 50
bottom 10%    → 10
```

The exact transformation can evolve.

---

# 23. Volatility

Start with a simple historical return measure.

For observations:

```text
P1, P2, P3, ...
```

calculate returns:

```text
r_t = (P_t - P_(t-1)) / P_(t-1)
```

Then calculate dispersion over a rolling window.

High volatility:

```text
more opportunity
+
more risk
```

Therefore volatility must influence both opportunity and risk.

---

# 24. Trend Consistency

Use multiple windows.

Example:

```text
1h  = +2%
6h  = +5%
24h = +7%
```

This is stronger than:

```text
1h  = -4%
6h  = +3%
24h = +8%
```

The second could indicate a reversal.

Create a consistency score rather than a simple yes/no condition.

---

# 25. Candidate Filtering

Filtering should happen before expensive ranking.

Pipeline:

```text
All tradeable items
       ↓
Minimum price
       ↓
Minimum data history
       ↓
Minimum activity
       ↓
Minimum spread
       ↓
Candidate set
```

This makes ranking faster and prevents illiquid junk from dominating the list.

---

# 26. Normalizing Metrics

Raw values cannot be safely combined.

Example:

```text
spreadGp = 5,000
volume = 100,000
momentum = 4%
```

These have completely different scales.

Convert them into comparable values:

```text
0–100
```

using percentile, min-max, logarithmic, or another appropriate normalization.

Percentile ranking is a strong initial choice because GE values are highly skewed.

---

# 27. Base Opportunity Score

Create:

```text
core/market/ranking/scorer.ts
```

Conceptually:

```ts
baseScore =
  momentumScore * momentumWeight +
  liquidityScore * liquidityWeight +
  spreadScore * spreadWeight +
  profitabilityScore * profitabilityWeight +
  consistencyScore * consistencyWeight +
  volatilityOpportunityScore * volatilityWeight;
```

Weights should total 1.0.

---

# 28. Risk Adjustment

Risk should reduce the final ranking.

Example:

```ts
finalScore =
  baseScore *
  riskMultiplier *
  confidenceMultiplier;
```

Avoid simply subtracting arbitrary points unless there is a reason.

Multipliers make the meaning easier to understand.

---

# 29. Confidence

Confidence should reflect data quality.

Potential formula:

```text
confidence =
  historyCoverage
  × observationQuality
  × timeframeAgreement
  × freshness
```

Normalize to:

```text
0–1
```

Then:

```text
confidenceMultiplier =
0.70 + (confidence × 0.30)
```

This prevents incomplete data from completely destroying an otherwise useful signal while still penalizing it.

The exact multiplier should be tuned with backtesting.

---

# 30. Risk Classification

Example baseline:

```text
LOW
```

when:

- liquidity strong
- volatility moderate
- trend consistent
- history sufficient

```text
MEDIUM
```

when one or two warning signals exist.

```text
HIGH
```

when:

- very low activity
- extreme volatility
- sudden spike
- insufficient history
- inconsistent trend

Risk rules should be centralized.

---

# 31. Opportunity Object

Return a complete object.

Example:

```ts
interface Opportunity {
  rank: number;

  item: ItemMetadata;

  currentPrice: number;

  changes: {
    oneHour?: number;
    sixHour?: number;
    twentyFourHour?: number;
  };

  spread: {
    gp?: number;
    percent?: number;
  };

  metrics: {
    momentum: number;
    liquidity: number;
    profitability: number;
    consistency: number;
    volatility: number;
  };

  estimatedProfit?: number;

  risk: "LOW" | "MEDIUM" | "HIGH";

  confidence: number;

  baseScore: number;
  finalScore: number;
}
```

This object becomes the primary UI contract.

---

# 32. Ranking Explainability

Do not return only:

```text
score: 84.2
```

Return component scores.

Then the UI can show:

```text
Momentum       91
Liquidity      78
Spread         83
Profitability  76
Consistency    88
Volatility     63

Base Score     82
Risk           LOW
Confidence     94%
Final Score    85
```

This is one of the most important product features.

---

# 33. IPC Market Service

Create a market application service.

Conceptually:

```text
MarketApplicationService
```

Responsibilities:

```text
refreshMarket()
getTopOpportunities()
getItemDetails()
getHistory()
getMarketStatus()
```

It orchestrates components but should not contain the mathematical analytics itself.

---

# 34. Refresh Service

A refresh should behave transactionally at the application level:

```text
START
 ↓
fetch
 ↓
validate
 ↓
normalize
 ↓
persist
 ↓
analyze
 ↓
rank
 ↓
publish result
END
```

If API retrieval fails:

```text
keep previous successful data
mark current state stale
report error
```

Do not erase valid cached data because one request failed.

---

# 35. UI State Model

React should track:

```ts
{
  status: "idle" | "loading" | "success" | "error";

  opportunities: Opportunity[];

  lastUpdated?: number;

  error?: string;
}
```

Do not make the UI infer whether data is stale from arbitrary timestamps.

The backend should provide status information.

---

# 36. Dashboard Layout

Recommended layout:

```text
┌─────────────────────────────────────────────────────┐
│ OSRS GE ANALYZER                    Refresh  ●      │
├───────────┬─────────────────────────────────────────┤
│ Dashboard │  Market Overview                        │
│ Watchlist │  ┌──────┐ ┌──────┐ ┌──────┐            │
│ History   │  │Items │ │Opps  │ │Update│            │
│ Settings  │  └──────┘ └──────┘ └──────┘            │
│           │                                         │
│           │  Top 10 Daily Opportunities             │
│           │  ┌───────────────────────────────────┐  │
│           │  │ # Item Price 24h Spread Risk Score│  │
│           │  │ 1 ...                              │  │
│           │  │ 2 ...                              │  │
│           │  │ ...                                │  │
│           │  └───────────────────────────────────┘  │
└───────────┴─────────────────────────────────────────┘
```

The dashboard should prioritize information density over unnecessary scrolling.

---

# 37. Opportunity Row

Each row should contain:

```text
Rank
Item icon/name
Current price
24h %
Spread
Liquidity
Estimated profit
Risk
Score
```

Clicking the row opens details.

---

# 38. Color Semantics

Keep colors semantic rather than decorative.

Examples:

```text
positive → positive accent
negative → negative accent
LOW risk → safe semantic treatment
MEDIUM → warning semantic treatment
HIGH → danger semantic treatment
```

Do not rely on color alone.

Also use:

```text
↑
↓
LOW
MEDIUM
HIGH
```

for accessibility.

---

# 39. Item Details Implementation

When a user selects an item:

```text
React
 ↓
window.osrsApi.market.getItemHistory(id)
 ↓
Electron
 ↓
HistoryRepository
 ↓
return snapshots
 ↓
React
 ↓
Chart
```

The renderer should never read the JSON history file directly.

---

# 40. Charts

Use Chart.js initially.

Price chart:

```text
X = timestamp
Y = price
```

Optional:

```text
1h
6h
24h
7d
30d
```

Volume chart should only be displayed when reliable volume/activity data exists.

---

# 41. Scheduler Implementation

Create:

```text
electron/services/scheduler.ts
```

Responsibilities:

- interval
- next-run timestamp
- start
- stop
- manual refresh integration

Important:

Manual refresh should use the same refresh service as scheduled refresh.

Do not create two separate implementations.

---

# 42. Concurrency

Prevent:

```text
scheduled refresh
+
manual refresh
```

from running simultaneously.

Use a shared refresh lock.

If a refresh is already running:

```text
return current refresh promise
```

rather than starting another API operation.

---

# 43. API Rate Safety

The application should:

- avoid unnecessary requests
- cache static metadata
- avoid per-item requests
- use one bulk request where possible
- respect provider limits
- implement reasonable retry/backoff

Do not hammer the API every few seconds.

---

# 44. Logging

Create application logging for:

```text
startup
API refresh
API failures
snapshot count
ranking count
storage failures
scheduler events
```

Logs should help answer:

> "Why didn't the rankings update?"

Do not log sensitive information because the application should not collect any.

---

# 45. Error Strategy

Errors fall into three categories.

## Recoverable

```text
API timeout
temporary network failure
```

Action:

```text
retry
retain previous data
```

## Data-quality

```text
invalid item
missing price
bad timestamp
```

Action:

```text
exclude record
continue processing
```

## Fatal

```text
corrupted configuration
unrecoverable storage failure
```

Action:

```text
display actionable error
```

---

# 46. Testing Strategy

Testing should happen at four levels.

## Unit

Test:

```text
metrics
normalization
scoring
risk
confidence
filters
```

## Provider

Test API response parsing using fixtures.

Do not make unit tests depend on live internet access.

## Integration

Test:

```text
provider
→ normalizer
→ storage
→ analytics
→ ranking
```

## UI

Test:

```text
loading
success
empty
error
refresh
filter
item selection
```

---

# 47. Synthetic Ranking Tests

Create known market scenarios.

Example:

```text
Item A
high liquidity
moderate momentum
moderate spread
consistent trend
```

versus:

```text
Item B
low liquidity
huge spike
wide volatility
little history
```

The test should prove that A outranks B under the balanced configuration.

This is much more useful than testing only whether the function returns an array.

---

# 48. Avoiding Algorithmic Mistakes

Do not rank by:

```text
highest 24h %
```

alone.

Do not rank by:

```text
highest spread
```

alone.

Do not rank by:

```text
highest volume
```

alone.

Those are individual signals.

The product is a composite opportunity model.

---

# 49. Avoiding Survivorship Bias

When backtesting:

Do not use today's item universe to pretend it was the universe months ago.

Historical tests should ideally use information that would have been available at that point in time.

Otherwise the ranking can look artificially good.

---

# 50. Backtesting

A backtest should simulate:

```text
At time T:
  calculate available metrics
  rank items
  select Top N

After T:
  observe future market

Calculate:
  return
  success
  failure
```

Do not allow future data to leak into the ranking at T.

This is critical.

---

# 51. Ranking Versioning

Every ranking result should optionally contain:

```text
algorithmVersion
configurationVersion
timestamp
```

Example:

```text
algorithmVersion: "0.1-balanced"
```

This allows future comparisons.

If weights change, you can identify which model produced old rankings.

---

# 52. Daily Rankings

At midnight or another configurable boundary:

```text
finalize previous day
calculate daily summary
store daily Top 10
```

But also maintain rolling/current rankings.

The application should distinguish:

```text
CURRENT
DAILY
```

rather than pretending they are identical.

---

# 53. "Top 10 Daily" Definition

For MVP, define the daily ranking as:

> The Top 10 opportunities produced by the ranking engine using the current day's available market history, with a rolling 24-hour analysis window.

Later, a true daily aggregate can be introduced.

This avoids pretending we have a complete day's information before the day is over.

---

# 54. Cheap Item Strategy

Because the original concept emphasizes low-priced items, add a candidate preference.

Example:

```text
cheapnessScore
```

Possible interpretation:

```text
lower unit price → higher score
```

But do not let cheapness dominate.

Otherwise the Top 10 becomes a list of worthless low-priced items.

Use it as a secondary feature or filter.

---

# 55. Capital Efficiency

A future metric should estimate:

```text
profit / capital required
```

For example:

```text
capitalEfficiency =
estimatedProfit / capitalRequired
```

This is often more useful than absolute GP profit for players with limited capital.

---

# 56. Buy Limits

Once reliable item buy-limit metadata exists, incorporate:

```text
limit
```

into opportunity calculations.

Potential:

```text
maxProfit =
profitPerUnit × buyLimit
```

But actual achievable profit depends on:

- available capital
- market depth
- execution
- price movement
- competition

Always label it as an estimate.

---

# 57. Taxes

For items affected by GE tax:

```text
netProfit =
sellPrice
- buyPrice
- applicableTax
```

Tax rules should be centralized in:

```text
core/market/analytics/profitability.ts
```

Do not hard-code tax calculations inside React.

---

# 58. Settings

Settings should include:

```text
refresh interval
minimum price
maximum price
minimum liquidity
minimum spread
risk preference
ranking preset
members-only
F2P-only
history retention
```

Persist them locally.

---

# 59. Configuration Presets

Example:

```ts
BALANCED
CONSERVATIVE
AGGRESSIVE
CHEAP_FLIPS
HIGH_PROFIT
```

Each preset supplies ranking configuration.

Users should be able to understand what changed between presets.

---

# 60. Performance Strategy

The application may analyze thousands of items.

Keep the pipeline efficient:

```text
one bulk fetch
↓
one normalization pass
↓
indexed history access
↓
candidate filtering
↓
ranking
```

Avoid:

```text
for every item:
  make API request
```

Avoid repeated sorting of the entire universe.

Use one final sort after calculating scores.

---

# 61. JSON Performance

JSON is acceptable for the MVP because:

- OSRS item count is manageable.
- Local storage is fast enough.
- Implementation is simple.
- Debugging is easy.

But avoid rewriting a gigantic JSON file every five minutes if the historical dataset becomes large.

That is the signal to migrate to SQLite.

---

# 62. SQLite Migration

When migration becomes necessary:

```text
HistoryRepository
      ↓
SqliteHistoryRepository
```

The analytics layer should remain unchanged.

This is why repository interfaces exist.

---

# 63. Release Build

Use electron-builder.

Build pipeline:

```text
React build
   ↓
Electron package
   ↓
Windows installer
```

Verify:

- API access works after packaging.
- preload path is correct.
- data directory is writable.
- charts load.
- persistent history works.
- app can restart safely.

---

# 64. First Implementation Target

Do not attempt the entire roadmap immediately.

First target:

```text
Electron
+
React
+
secure IPC
+
one API provider
+
real item names
+
one normalized snapshot
+
one local cache
```

Then verify that foundation before implementing sophisticated ranking.

---

# 65. Recommended Development Workflow

For each file:

```text
1. Create file
2. Implement smallest useful version
3. Compile
4. Run
5. Test behavior
6. Only then continue
```

For each sprint:

```text
Architecture
    ↓
Implementation
    ↓
Verification
    ↓
Commit
```

Do not stack ten unverified changes.

---

# 66. Verification Checklist

## Foundation

- [ ] Electron opens.
- [ ] React renders.
- [ ] Preload works.
- [ ] IPC works.
- [ ] Renderer has no Node access.

## Data

- [ ] API request works.
- [ ] API response validates.
- [ ] Item metadata works.
- [ ] Snapshot normalizes.
- [ ] Snapshot persists.

## Analytics

- [ ] 1h change works.
- [ ] 6h change works.
- [ ] 24h change works.
- [ ] spread works.
- [ ] liquidity works.
- [ ] volatility works.
- [ ] consistency works.

## Ranking

- [ ] candidates filter.
- [ ] metrics normalize.
- [ ] weights apply.
- [ ] risk applies.
- [ ] confidence applies.
- [ ] Top 10 sorts correctly.
- [ ] score breakdown is available.

## UI

- [ ] dashboard renders.
- [ ] loading works.
- [ ] errors work.
- [ ] refresh works.
- [ ] Top 10 displays.
- [ ] item details work.
- [ ] chart works.

## Reliability

- [ ] API failure preserves previous data.
- [ ] refreshes cannot overlap.
- [ ] scheduler works.
- [ ] application restarts safely.
- [ ] storage corruption is handled.

---

# 67. Final Implementation Principle

The most important design rule for this project is:

> **Do not confuse an interesting market movement with a profitable flip.**

The system should progressively move from:

```text
"price went up"
```

to:

```text
"this item has a favorable combination of
momentum + liquidity + spread + profitability
+ consistency + manageable risk,
and we have enough data to trust the signal."
```

That is what turns the project from a price viewer into an actual GE opportunity analyzer.
