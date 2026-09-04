# OSRS Grand Exchange Analyzer — Architecture

**Document:** `architecture.md`  
**Status:** Baseline Architecture  
**Version:** 0.1  
**Target:** Local-first Electron desktop application

---

## 1. Product Definition

The OSRS Grand Exchange Analyzer is a local desktop application that continuously analyzes Old School RuneScape Grand Exchange market data and produces a ranked **Top 10 daily opportunity list**.

The goal is not simply to identify items whose prices increased. The system should estimate which items currently offer the best combination of:

- price momentum
- buy/sell spread
- liquidity
- trading activity
- volatility
- trend consistency
- estimated flip profit
- risk
- buy-limit efficiency
- confidence in the signal

The first version should be intentionally deterministic and explainable. Every ranking should be possible to inspect and understand.

### Core principle

> **Rank opportunities, not merely price changes.**

A cheap item with a 10% price increase but almost no trading activity should not automatically outrank a liquid item with a smaller but highly reliable opportunity.

---

# 2. Product Goals

## Primary goals

1. Run entirely locally as an Electron desktop application.
2. Require no account, login, or hosted backend.
3. Retrieve public OSRS market data automatically.
4. Maintain enough local historical data to calculate meaningful trends.
5. Rank market opportunities once data has been collected.
6. Present a clear Top 10 list.
7. Explain why each item received its ranking.
8. Refresh automatically.
9. Allow manual refresh.
10. Remain lightweight enough to run continuously.

## Secondary goals

- historical charts
- configurable ranking weights
- watchlists
- alerts
- flip calculator
- item search
- F2P/member filters
- risk profiles
- portfolio/trade tracking

## Explicit non-goals for MVP

- automated GE trading
- botting
- RuneLite automation
- placing orders
- account credential handling
- machine-learning prediction
- cloud infrastructure
- multiplayer/social features

---

# 3. Architecture Philosophy

The project should follow four principles.

## 3.1 Local-first

All computation occurs on the user's machine.

```text
OSRS Wiki Price API
        |
        v
Electron Main Process
        |
        +--> Data Fetching
        +--> Historical Storage
        +--> Analytics
        +--> Ranking
        |
        v
React Renderer
```

There is no application server in the MVP.

## 3.2 Explainable

A ranking should never be a mysterious number.

For every item, the application should be able to answer:

- Why is it ranked here?
- What changed?
- How liquid is it?
- What is the spread?
- What is the estimated profit?
- What is the risk?
- How confident are we?

## 3.3 Provider-independent

Market data access should be isolated behind interfaces so that the application can replace or supplement the OSRS Wiki price API later.

```text
MarketDataProvider
       |
       +-- WikiPriceProvider
       +-- FutureProvider
```

## 3.4 Analytics separated from presentation

React should never calculate market scores.

```text
API data
   ↓
Normalization
   ↓
Historical snapshots
   ↓
Metrics
   ↓
Ranking engine
   ↓
View model
   ↓
React
```

---

# 4. Technology Stack

## Desktop

- Electron
- Node.js runtime
- TypeScript

## Frontend

- React
- TypeScript
- Vite
- CSS

## Data visualization

- Chart.js + react-chartjs-2

## Storage

### MVP recommendation

Use **local JSON files initially**, not SQLite.

The application is local-only and the data volume is manageable for an MVP.

However, the storage layer must be abstracted so SQLite can replace JSON without rewriting analytics or UI.

### Future storage

SQLite is recommended once the application retains substantial historical time-series data.

Potential migration trigger:

- months/years of history
- many snapshots
- extensive item analytics
- complex historical queries
- custom backtesting

## Build

- Vite
- electron-builder

## Testing

- Vitest
- React Testing Library
- Playwright or Electron-focused integration tests later

---

# 5. Repository Structure

```text
osrs-ge-analyzer/
│
├── electron/
│   ├── main.ts
│   ├── preload.ts
│   ├── ipc/
│   │   ├── market.handlers.ts
│   │   ├── settings.handlers.ts
│   │   └── history.handlers.ts
│   └── services/
│       ├── scheduler.ts
│       └── application.ts
│
├── src/
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── TopOpportunityTable.tsx
│   │   │   ├── OpportunityCard.tsx
│   │   │   ├── MarketSummary.tsx
│   │   │   └── MarketHealth.tsx
│   │   ├── charts/
│   │   │   ├── PriceChart.tsx
│   │   │   └── VolumeChart.tsx
│   │   ├── filters/
│   │   │   ├── MarketFilters.tsx
│   │   │   └── RiskFilter.tsx
│   │   ├── common/
│   │   │   ├── LoadingState.tsx
│   │   │   ├── ErrorState.tsx
│   │   │   └── ScoreBadge.tsx
│   │   └── layout/
│   │       ├── Sidebar.tsx
│   │       ├── Header.tsx
│   │       └── AppLayout.tsx
│   │
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── ItemDetails.tsx
│   │   ├── Watchlist.tsx
│   │   └── Settings.tsx
│   │
│   ├── hooks/
│   │   ├── useMarketData.ts
│   │   ├── useTopOpportunities.ts
│   │   └── useSettings.ts
│   │
│   ├── services/
│   │   └── electronApi.ts
│   │
│   ├── types/
│   │   ├── market.ts
│   │   ├── analytics.ts
│   │   └── settings.ts
│   │
│   ├── styles/
│   │   ├── globals.css
│   │   ├── variables.css
│   │   └── dashboard.css
│   │
│   ├── App.tsx
│   └── main.tsx
│
├── core/
│   ├── market/
│   │   ├── providers/
│   │   │   ├── MarketDataProvider.ts
│   │   │   └── WikiPriceProvider.ts
│   │   ├── normalization/
│   │   │   └── normalizer.ts
│   │   ├── analytics/
│   │   │   ├── metrics.ts
│   │   │   ├── momentum.ts
│   │   │   ├── volatility.ts
│   │   │   ├── liquidity.ts
│   │   │   └── spread.ts
│   │   └── ranking/
│   │       ├── scorer.ts
│   │       ├── weights.ts
│   │       ├── risk.ts
│   │       └── confidence.ts
│   │
│   ├── history/
│   │   ├── HistoryRepository.ts
│   │   └── snapshotService.ts
│   │
│   └── items/
│       ├── ItemRepository.ts
│       └── itemMetadata.ts
│
├── storage/
│   ├── json/
│   │   ├── JsonHistoryRepository.ts
│   │   ├── JsonSettingsRepository.ts
│   │   └── JsonCacheRepository.ts
│   └── paths.ts
│
├── shared/
│   ├── constants.ts
│   ├── ipc.ts
│   └── validation.ts
│
├── tests/
│   ├── analytics/
│   ├── ranking/
│   ├── providers/
│   └── integration/
│
├── package.json
├── tsconfig.json
├── vite.config.ts
├── electron-builder.yml
└── README.md
```

---

# 6. Electron Architecture

Electron has two security boundaries.

## Main process

Responsible for:

- external network requests
- file-system access
- scheduling
- market analysis
- historical storage
- IPC handlers

## Renderer

Responsible for:

- UI
- charts
- filters
- presentation
- user interaction

The renderer should not have unrestricted Node.js access.

## Preload

The preload script exposes a deliberately small API.

Example:

```ts
window.osrsApi.market.getTopOpportunities()
window.osrsApi.market.refresh()
window.osrsApi.market.getItemHistory(itemId)
window.osrsApi.settings.get()
window.osrsApi.settings.update(...)
```

Do not expose raw `ipcRenderer` to React.

---

# 7. Security Decisions

BrowserWindow should use:

```text
contextIsolation: true
nodeIntegration: false
sandbox: true
```

The preload bridge should expose only explicit functions.

External URLs should not automatically be loaded inside the application.

---

# 8. Market Data Architecture

The application should treat external data as untrusted input.

```text
Provider
  ↓
Raw response
  ↓
Validation
  ↓
Normalization
  ↓
Internal market model
```

The rest of the application should not depend directly on the Wiki API response format.

---

# 9. Market Data

Primary source:

**OSRS Wiki Prices API**

Useful endpoints include:

```text
/latest
/5m
/1h
```

Historical data should be collected locally over time rather than relying exclusively on a single endpoint.

The architecture should support:

- current prices
- recent snapshots
- hourly trend data
- daily trend data
- historical high/low observations
- volume/activity estimates where available

Important:

The API's fields must be verified against its current documentation before implementation. Do not invent volume semantics from unrelated fields.

---

# 10. Item Metadata

Market prices alone do not provide everything required by the ranking engine.

Maintain an item metadata source containing:

```ts
interface ItemMetadata {
  id: number;
  name: string;
  members: boolean;
  tradeable: boolean;
  buyLimit?: number;
  category?: string;
  examine?: string;
}
```

Item metadata should be cached locally.

---

# 11. Internal Market Model

```ts
interface MarketSnapshot {
  itemId: number;
  timestamp: number;

  high?: number;
  low?: number;

  highTime?: number;
  lowTime?: number;

  volume?: number;
}
```

Derived metrics should be separate:

```ts
interface MarketMetrics {
  price: number;
  priceChange1h?: number;
  priceChange6h?: number;
  priceChange24h?: number;

  spreadGp?: number;
  spreadPct?: number;

  volatility?: number;
  liquidityScore?: number;

  momentumScore?: number;
  profitabilityScore?: number;

  riskScore?: number;
  confidenceScore?: number;
}
```

---

# 12. Ranking Engine

The ranking engine should not directly rank raw values.

Each metric should first be normalized.

Example:

```text
raw market data
      ↓
metric calculation
      ↓
percentile/normalized scores
      ↓
weighted score
      ↓
risk adjustment
      ↓
confidence adjustment
      ↓
final opportunity score
```

This prevents a large GP item from automatically dominating a percentage-based metric.

---

# 13. Candidate Filtering

Before ranking, eliminate unsuitable candidates.

Potential filters:

```text
tradeable == true
price >= minimumPrice
price <= maximumPrice
volume >= minimumVolume
spreadPct >= minimumSpread
historyCoverage >= minimumRequired
```

Example MVP defaults:

```text
minimum price: 100 GP
minimum activity: configurable
minimum history: enough data for 24h comparison
```

The exact values should remain configurable.

---

# 14. Opportunity Metrics

## Momentum

Measure movement over multiple windows:

- 1h
- 6h
- 24h

A multi-window model is preferable to a single 24h percentage.

## Spread

Estimate the gap between current buy-side and sell-side prices.

```text
spreadGp = high - low
spreadPct = spreadGp / midpoint
```

The exact interpretation must account for how the API represents high/low prices.

## Liquidity

Favor items that appear frequently traded.

Volume should be normalized relative to the market rather than compared as a raw number.

## Volatility

Volatility identifies opportunity but also risk.

High volatility should not automatically mean high ranking.

## Trend consistency

Prefer:

```text
1h positive
6h positive
24h positive
```

over:

```text
24h +20%
1h -8%
```

The latter may represent a reversal.

---

# 15. Profitability Model

A useful opportunity estimate can be:

```text
estimatedProfitPerUnit
    = estimatedSellPrice
    - estimatedBuyPrice
    - taxes
```

Then:

```text
estimatedProfitPerLimit
    = estimatedProfitPerUnit
    × min(buyLimit, affordableQuantity)
```

This becomes especially useful once buy limits are available.

The system should clearly label estimates as estimates.

---

# 16. Risk Model

Risk should be independent from opportunity.

Potential risk signals:

- low volume
- extreme volatility
- inconsistent trend
- sudden price spike
- insufficient history
- unusually wide spread
- weak data confidence

Output:

```text
LOW
MEDIUM
HIGH
```

---

# 17. Confidence Model

Confidence answers:

> "How much evidence do we have that this ranking is meaningful?"

Possible inputs:

- history length
- number of observations
- data freshness
- volume/activity
- agreement between timeframes
- absence of anomalous spikes

A high opportunity score with low confidence should be penalized.

---

# 18. Proposed Score

Do not hard-code the final weights permanently.

Store them in a configuration object.

Baseline:

```text
Momentum              30%
Liquidity             20%
Spread / Margin       20%
Profitability         15%
Trend Consistency     10%
Volatility Opportunity 5%
```

Then apply:

```text
Final Score
= Base Opportunity Score
× Risk Multiplier
× Confidence Multiplier
```

Example multipliers:

```text
LOW risk     1.00
MEDIUM risk  0.90
HIGH risk    0.70
```

These are starting values, not proven optimal weights.

---

# 19. Top 10 Selection

The UI should show:

```text
Rank
Item
Current Price
24h %
Spread
Liquidity
Estimated Profit
Risk
Confidence
Opportunity Score
```

A user should be able to expand an item to see the score breakdown.

---

# 20. Historical Storage

JSON MVP layout:

```text
%APPDATA%/OSRS-GE-Analyzer/
├── cache/
│   ├── latest.json
│   └── metadata.json
├── history/
│   ├── 2026-08-28.json
│   └── ...
├── settings.json
└── app-state.json
```

Do not store mutable user data inside the packaged application directory.

---

# 21. Snapshot Strategy

Every scheduled collection creates a timestamped snapshot.

Avoid saving duplicate snapshots when data has not meaningfully changed.

Potential cadence:

```text
5 minutes — current market snapshot
1 hour    — aggregated hourly analytics
1 day     — daily summary
```

The scheduler should be configurable.

---

# 22. Caching

Use separate caches:

### API cache

Avoid repeatedly downloading identical data.

### Item metadata cache

Item names and metadata change infrequently.

### Analytics cache

Reuse calculated results until source data changes.

---

# 23. IPC Contract

Suggested channels:

```text
market:getLatest
market:getTopOpportunities
market:getItem
market:getItemHistory
market:refresh
market:getStatus

settings:get
settings:update

history:getDailySummary
history:getSnapshotRange
```

IPC response objects should be typed.

---

# 24. Error Handling

The application must gracefully handle:

- API unavailable
- API timeout
- malformed response
- rate limiting
- incomplete market data
- missing item metadata
- corrupted local cache
- disk errors

The UI should show:

```text
Last successful update
Current data age
API status
Number of analyzed items
Number of excluded items
```

---

# 25. Scheduler

The scheduler runs only in the Electron main process.

Example:

```text
Application starts
       ↓
Load cache
       ↓
Display last known rankings
       ↓
Schedule refresh
       ↓
Fetch market data
       ↓
Store snapshot
       ↓
Recalculate rankings
       ↓
Notify renderer
```

The app should not block startup waiting for the API.

---

# 26. UI Architecture

Primary screen:

```text
┌─────────────────────────────────────────────────────────┐
│ OSRS GE ANALYZER                       Updated 2m ago    │
├───────────┬─────────────────────────────────────────────┤
│ Dashboard │                                             │
│ Watchlist │       MARKET SUMMARY                        │
│ History   │       Market opportunities: 1,247           │
│ Settings  │                                             │
│           │       TOP 10 OPPORTUNITIES                  │
│           │                                             │
│           │  # Item       Price   24h   Spread  Score   │
│           │  1 ...                                         │
│           │  2 ...                                         │
│           │  ...                                          │
│           │                                             │
└───────────┴─────────────────────────────────────────────┘
```

---

# 27. Item Details

Clicking an item opens:

```text
Item Name
Current Price

[Price Chart]

24h Change
6h Change
1h Change

Spread
Liquidity
Volatility
Estimated Profit
Risk
Confidence

[Score Breakdown]

Momentum       ████████
Liquidity      ██████
Spread         ███████
Profitability  █████
```

---

# 28. Dashboard Filters

Filters should include:

- Members / F2P
- minimum price
- maximum price
- risk
- minimum liquidity
- minimum spread
- minimum score
- item category

Sorting:

- Opportunity
- % change
- spread
- estimated profit
- liquidity
- risk

---

# 29. Refresh Behavior

Manual refresh should show:

```text
Refreshing...
Fetching market data...
Analyzing 4,000+ items...
Ranking opportunities...
Complete
```

The UI should remain usable during refresh.

---

# 30. Daily Ranking Concept

The application should distinguish between:

### Current opportunity

"What looks attractive right now?"

### Daily opportunity

"What has been one of the strongest opportunities over today's analysis window?"

These should not necessarily produce the same Top 10.

Future versions can provide:

```text
Top 10 Right Now
Top 10 Today
Top 10 Improving
Top 10 Low Risk
Top 10 High Profit
```

---

# 31. Backtesting Architecture

A future backtesting engine should be able to take historical snapshots:

```text
Historical Data
      ↓
Pretend ranking at time T
      ↓
Simulated entry
      ↓
Future observations
      ↓
Measure outcome
```

This is important for tuning scoring weights.

The ranking engine must therefore remain deterministic and independent from Electron/UI.

---

# 32. Configuration

Example:

```ts
interface RankingConfig {
  momentumWeight: number;
  liquidityWeight: number;
  spreadWeight: number;
  profitabilityWeight: number;
  consistencyWeight: number;
  volatilityWeight: number;

  minPrice: number;
  minVolume: number;
  minHistoryMinutes: number;
}
```

---

# 33. Future Machine Learning

ML should NOT be part of MVP.

First build a deterministic ranking engine.

Once enough historical observations exist:

```text
Historical Market Data
        ↓
Features
        ↓
Known Outcomes
        ↓
Model Training
        ↓
Prediction
        ↓
Compare against deterministic score
```

ML should prove that it improves ranking before replacing the baseline system.

---

# 34. Architecture Decision Summary

| Decision | Choice |
|---|---|
| Desktop | Electron |
| UI | React + TypeScript |
| Build | Vite |
| Backend | Electron Main |
| API | OSRS Wiki Prices |
| MVP storage | JSON |
| Future storage | SQLite |
| Analytics | TypeScript |
| Charts | Chart.js |
| IPC | Electron preload bridge |
| Authentication | None |
| Cloud backend | None |
| ML | Future |
| Automation/trading | Not included |

---

# 35. Definition of Done — Architecture

The architecture is considered implemented when:

- Electron and React communicate through preload IPC.
- External API access occurs outside the renderer.
- Market data is normalized.
- Historical snapshots can be persisted.
- Analytics are independently testable.
- Ranking is deterministic.
- Top 10 results are explainable.
- UI can consume typed ranking results.
- API failures do not crash the application.
- Storage location is outside the packaged application.

