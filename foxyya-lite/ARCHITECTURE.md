# FOXYYA Lite V1 Architecture

## Goal

FOXYYA Lite is a read-first, mobile-first trading intelligence shell. The web UI must remain usable when Strategy, Paper, Results, or Backtest services are unavailable. Production Execution V2 is outside this application boundary and must not be modified or invoked by the Lite UI.

## Runtime shape

```text
Browser / Mobile PWA
        |
        v
    src/main.js
        |
        +--> Market Service ------> Binance USD-M public data
        |       |
        |       +--> local Last Known Good cache
        |
        +--> Strategy Service ----> Strategy Snapshot adapter (next phase)
        |
        +--> Paper Service -------> Paper Snapshot adapter (next phase)
        |
        +--> Results Service -----> Forward Paper results adapter (next phase)
        |
        +--> Backtest Service ----> Historical Backtest adapter (next phase)
        |
        v
     appState
        |
        v
   Page Renderers
        |
        v
    index.html
```

## Dependency rules

1. `index.html` loads only `src/main.js` as the application entry point.
2. `main.js` orchestrates services, state updates, routing, and rendering. It contains no exchange-specific parsing logic.
3. `state.js` owns the in-browser state slices only. It does not fetch remote data.
4. `contracts.js` defines the canonical Snapshot shapes for Strategy, Paper, Results, and Backtest.
5. `status.js` is the only source of `LIVE / STALE / ERROR / LOADING / EMPTY` state constants.
6. `market.js` owns Binance market transport/parsing and returns a Market Snapshot; it does not render DOM.
7. Each file under `src/services/` is an adapter boundary. Replacing a data source must not require changing page renderers.
8. `pages.js` reads canonical state only. It must not call Binance, Execution V2, SQLite, or Railway directly.
9. `router.js` owns hash-route parsing and navigation state only.
10. `ui.js` contains reusable presentational primitives only.

## State slices

```text
appState
├── market
├── strategy
├── paper
├── results
└── backtest
```

Each slice can fail independently. One slice entering `ERROR` or `STALE` must not prevent other pages or slices from rendering.

## Snapshot contracts

### Market

```text
status
source
updatedAt
direction
sentiment
rows[]
```

### Strategy

```text
status
updatedAt
items[]
```

Target item fields for the next adapter phase:

```text
symbol
strategy
direction
status
statusLabel
entry
stop
tp1
tp2
rr
confidence
note
updatedAt
```

### Paper

```text
status
updatedAt
summary.nav
summary.cash
summary.openPositions
summary.pendingOrders
summary.unrealizedPnl
summary.portfolioRiskPct
positions[]
pending[]
```

### Results

```text
status
updatedAt
summary.trades
summary.winRatePct
summary.expectancyR
summary.profitFactor
summary.netPnl
summary.maxDrawdownPct
navCurve[]
recentTrades[]
```

### Backtest

```text
status
updatedAt
input
result
equityCurve[]
```

## Market degradation policy

```text
Initial load -> LOADING
Successful Binance response -> LIVE
Fetch failure + Last Known Good -> STALE
Fetch failure + no cache -> ERROR
```

No fabricated live price may be substituted for an unavailable market response.

## Execution safety boundary

FOXYYA Lite V1 is read-only with respect to trading execution.

Mandatory invariants:

- PAPER ONLY
- REAL ORDER LOCKED
- No direct order endpoint in the Lite UI
- Production Execution V2 remains isolated
- Forward Paper and Historical Backtest remain separate datasets
- No Backtest run may mutate the Paper ledger

## Current file map

```text
foxyya-lite/
├── index.html
├── styles.css
├── app.js                  # legacy V1 shell; retained temporarily until full module verification
├── ARCHITECTURE.md
└── src/
    ├── main.js
    ├── config.js
    ├── status.js
    ├── state.js
    ├── contracts.js
    ├── cache.js
    ├── market.js
    ├── mock.js
    ├── ui.js
    ├── pages.js
    ├── router.js
    └── services/
        ├── strategy.js
        ├── paper.js
        ├── results.js
        └── backtest.js
```

## Next architecture gates

### Gate A — module verification

Verify all browser ES Module imports, five routes, and Market LIVE/STALE/ERROR behavior from one deployed Preview before removing legacy `app.js`.

### Gate B — Strategy Adapter

Connect the existing strategy engine through `loadStrategySnapshot()` only. The page layer must receive canonical Strategy Snapshot data and must not import the old strategy engine.

### Gate C — Paper Adapter

Expose read-only Paper Snapshot data. No Lite UI code may create, amend, cancel, or submit an execution order.

### Gate D — Results Adapter

Expose Forward Paper statistics and NAV curve through Results Snapshot.

### Gate E — Backtest Adapter

Expose Historical Backtest through its own service boundary. Keep storage and output separate from Forward Paper.

### Gate F — UI refinement

Only after Gates A-E are structurally stable should visual polish, spacing, card hierarchy, typography, iconography, and gold/dark design language be refined.
