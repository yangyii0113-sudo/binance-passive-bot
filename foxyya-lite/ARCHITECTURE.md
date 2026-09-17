# FOXYYA Lite V1 Architecture

## Status

Architecture Freeze v1 — Gate A verified on branch `foxyya-lite-v1-20260917`.

Verified by GitHub Actions workflow `FOXYYA Lite Gate A` after legacy `app.js` removal:

- ES Module syntax checks: PASS
- Market state machine `LIVE -> STALE -> ERROR`: PASS
- Snapshot endpoints `404 -> EMPTY`: PASS
- Five routes: PASS
- Five page renderers: PASS

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
        +--> Strategy Service ----> /api/strategy
        +--> Paper Service -------> /api/paper
        +--> Results Service -----> /api/results
        +--> Backtest Service ----> /api/backtest
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
5. `status.js` is the only source of `LIVE / STALE / ERROR / LOADING / EMPTY` constants.
6. `market.js` owns Binance market transport/parsing and returns a Market Snapshot; it does not render DOM.
7. Each file under `src/services/` is an adapter boundary. Replacing a data source must not require changing page renderers.
8. `pages.js` reads canonical state only. It must not call Binance, Execution V2, SQLite, Railway, or another trading runtime directly.
9. `router.js` owns hash-route parsing and navigation state only.
10. `ui.js` contains reusable presentational primitives only.
11. A failure in one state slice must not block rendering or refresh of another slice.
12. Snapshot adapters are read-only; execution mutations are outside FOXYYA Lite.

## State slices

```text
appState
├── market
├── strategy
├── paper
├── results
└── backtest
```

Each slice can fail independently. One slice entering `ERROR`, `STALE`, or `EMPTY` must not prevent other pages or slices from rendering.

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

Canonical item fields:

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

## Snapshot degradation policy

```text
Endpoint 200 + valid payload -> LIVE
Endpoint 404 -> EMPTY
Transport / HTTP / payload failure -> ERROR
```

A Snapshot adapter must return its canonical empty shape even when status is `EMPTY` or `ERROR`, so the page renderer remains safe.

## Execution safety boundary

FOXYYA Lite V1 is read-only with respect to trading execution.

Mandatory invariants:

- PAPER ONLY
- REAL ORDER LOCKED
- No direct order endpoint in the Lite UI
- Production Execution V2 remains isolated
- Forward Paper and Historical Backtest remain separate datasets
- No Backtest run may mutate the Paper ledger
- No page renderer imports or calls an execution engine

## Current file map

```text
foxyya-lite/
├── index.html
├── styles.css
├── ARCHITECTURE.md
├── API_CONTRACTS.md
├── package.json
├── tests/
│   └── gate-a-smoke.mjs
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
        ├── http.js
        ├── strategy.js
        ├── paper.js
        ├── results.js
        └── backtest.js
```

The former monolithic `foxyya-lite/app.js` has been removed after Gate A regression tests passed.

## Architecture gates

### Gate A — Module verification — VERIFIED

Covered by `.github/workflows/foxyya-lite-gate-a.yml`.

### Gate B — Strategy Adapter — STRUCTURE READY

`loadStrategySnapshot()` is the only Strategy entry point for the Lite app. Next work is to provide a real read-only `/api/strategy` producer from the existing engine.

### Gate C — Paper Adapter — STRUCTURE READY

`loadPaperSnapshot()` is read-only. Next work is to expose canonical Paper Snapshot data without adding order mutation endpoints.

### Gate D — Results Adapter — STRUCTURE READY

`loadResultsSnapshot()` consumes Forward Paper statistics only.

### Gate E — Backtest Adapter — STRUCTURE READY

`loadBacktestSnapshot()` consumes Historical Backtest output only; it remains separate from Forward Paper storage.

### Gate F — UI refinement — DEFERRED

Visual polish, spacing, card hierarchy, typography, iconography, and the gold/dark design language begin only after the real Strategy/Paper/Results/Backtest producers are connected and architecture remains green.
