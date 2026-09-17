# FOXYYA Lite V1 Architecture

## Status

Architecture Freeze v1.1 — core modules and read-only runtime bridge verified on branch `foxyya-lite-v1-20260917`.

Verified by GitHub Actions workflow `FOXYYA Lite Gate A`:

- ES Module syntax checks: PASS
- Market state machine `LIVE -> STALE -> ERROR`: PASS
- Missing read-only sources -> canonical `EMPTY`: PASS
- Existing runtime -> Strategy/Paper/Results canonicalization: PASS
- Existing historical backtest -> Backtest canonicalization: PASS
- Five routes: PASS
- Five page renderers: PASS
- Legacy monolithic `app.js`: removed and regression-tested

## Goal

FOXYYA Lite is a read-first, mobile-first trading intelligence shell. The web UI must remain usable when Strategy, Paper, Results, or Backtest services are unavailable. Production Execution V2 is outside this application boundary and must not be modified or invoked by the Lite UI.

## Runtime shape

```text
Mobile / Browser
      |
      +--> Binance USD-M public market data
      |
      +--> same-origin /api/*
                |
                v
          Edge Gateway
                |
                | GET only
                v
       Existing FOXYYA Runtime
       /api/runtime/snapshot
       /api/backtest/latest
                |
                v
        Lite Runtime Bridge
          ├─ Strategy
          ├─ Paper
          ├─ Results
          └─ Backtest
                |
                v
             appState
                |
                v
          Page Renderers
```

The browser does not need the runtime hostname. Hosting-specific runtime origins belong only in the server/edge gateway. See `DEPLOYMENT_ARCHITECTURE.md`.

## Dependency rules

1. `index.html` loads only `src/main.js` as the application entry point.
2. `main.js` orchestrates services, state updates, routing, and rendering. It contains no exchange-specific parsing logic.
3. `state.js` owns the in-browser state slices only. It does not fetch remote data.
4. `contracts.js` defines canonical Snapshot shapes.
5. `status.js` is the only source of `LIVE / STALE / ERROR / LOADING / EMPTY` constants.
6. `market.js` owns Binance public market transport/parsing and does not render DOM.
7. `src/services/runtime.js` is the shared read-only bridge to the existing runtime endpoints.
8. Strategy/Paper/Results adapters may transform a shared immutable runtime snapshot but must not mutate runtime data.
9. Backtest reads the existing historical backtest endpoint separately from Forward Paper.
10. `pages.js` reads canonical state only. It must not call Binance, Execution V2, SQLite, Railway, or another trading runtime directly.
11. `router.js` owns navigation state only.
12. `ui.js` contains reusable presentational primitives only.
13. One state slice failing must not block other slices or the shell.
14. Browser runtime endpoints remain same-origin `/api/*`; external runtime origins and credentials are forbidden in browser modules.
15. All Lite runtime access is GET-only.

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

## Snapshot source mapping

```text
/api/runtime/snapshot
├─ candidates + pending -> StrategySnapshot
├─ books["5x"] + pending -> PaperSnapshot
└─ closed trades -> ResultsSnapshot

/api/backtest/latest
└─ run_config + metrics -> BacktestSnapshot
```

`runtime.js` deduplicates concurrent runtime reads with a short in-memory cache so Strategy, Paper, and Results can consume one runtime projection rather than issuing three independent reads at startup.

Detailed canonical fields and mapping rules are defined in `API_CONTRACTS.md`.

## Market degradation policy

```text
Initial load -> LOADING
Successful Binance response -> LIVE
Fetch failure + Last Known Good -> STALE
Fetch failure + no cache -> ERROR
```

No fabricated live price may be substituted for an unavailable market response.

## Runtime slice degradation policy

```text
Read-only endpoint 200 + valid payload -> LIVE
Endpoint 404 -> EMPTY
Transport / HTTP / invalid payload -> ERROR
```

Every adapter returns its canonical empty shape even when status is `EMPTY` or `ERROR`, keeping page renderers safe.

## Results integrity policy

Forward Results use closed Forward Paper trades only.

Currently available and derived from the trusted runtime snapshot:

- closed trade count
- win rate
- expectancy R
- profit factor
- net P&L

`maxDrawdownPct` and NAV curve remain unavailable until a trusted Forward Paper equity-history source is connected. Lite must not fabricate them.

## Execution safety boundary

FOXYYA Lite V1 is read-only with respect to trading execution.

Mandatory invariants:

- PAPER ONLY
- REAL ORDER LOCKED
- No direct order endpoint in the Lite UI
- Production Execution V2 remains isolated and unmodified
- Forward Paper and Historical Backtest remain separate datasets
- No Backtest run may mutate the Paper ledger
- No page renderer imports or calls an execution engine
- Same-origin gateway exposes only allow-listed GET routes

## Current file map

```text
foxyya-lite/
├── index.html
├── styles.css
├── ARCHITECTURE.md
├── API_CONTRACTS.md
├── DEPLOYMENT_ARCHITECTURE.md
├── package.json
├── tests/
│   ├── gate-a-smoke.mjs
│   └── architecture-boundaries.mjs
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
        ├── runtime.js
        ├── strategy.js
        ├── paper.js
        ├── results.js
        └── backtest.js
```

## Architecture gates

### Gate A — Core module verification — VERIFIED

Module syntax, routing, market degradation, empty-source behavior, page rendering, and legacy-file removal are under CI.

### Gate B — Strategy Adapter — VERIFIED WITH RUNTIME FIXTURE

Existing runtime `candidates` and `pending` are normalized into canonical Strategy items. A live hosted gateway/runtime round trip is still required before production-style use.

### Gate C — Paper Adapter — VERIFIED WITH RUNTIME FIXTURE

The 5x Paper book is normalized read-only into NAV, cash, positions, pending orders, unrealized P&L, and portfolio risk. No write path exists.

### Gate D — Results Adapter — VERIFIED WITH RUNTIME FIXTURE

Closed Forward Paper trades produce trade count, win rate, expectancy, profit factor, and net P&L. Drawdown/NAV curve remain intentionally unavailable rather than fabricated.

### Gate E — Backtest Adapter — VERIFIED WITH BACKTEST FIXTURE

Existing `/api/backtest/latest` data is normalized independently from Forward Paper.

### Gate F — Deployment Gateway — STRUCTURE DEFINED / PREVIEW PROOF PENDING

The browser uses same-origin `/api/*`; the edge host must proxy allow-listed GET requests to the private runtime. The Preview deployment must prove this round trip and outage isolation.

### Gate G — UI refinement — DEFERRED

Only after Gate F is proven should visual polish, card hierarchy, typography, iconography, spacing, and the black/gold high-fidelity design language be refined.
