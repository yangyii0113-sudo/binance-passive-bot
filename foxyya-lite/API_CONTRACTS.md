# FOXYYA Lite Snapshot Contracts

FOXYYA Lite consumes **canonical read-only snapshots** in the page/state layer. The current V1 implementation does not require Production Execution V2 changes: it bridges existing read-only runtime endpoints into canonical Strategy / Paper / Results / Backtest snapshots in the browser service layer.

## Current source mapping

```text
Existing runtime GET /api/runtime/snapshot
        ├─> Strategy Adapter ─> StrategySnapshot
        ├─> Paper Adapter ────> PaperSnapshot
        └─> Results Adapter ──> ResultsSnapshot

Existing runtime GET /api/backtest/latest
        └─> Backtest Adapter ─> BacktestSnapshot
```

`src/services/runtime.js` deduplicates concurrent reads of `/api/runtime/snapshot` with a short in-memory cache, so Strategy / Paper / Results can share the same immutable runtime projection.

The existing runtime service remains untouched. Lite performs no write operation against it.

## Common transport rules

- Method: `GET` only.
- Default browser timeout: 5 seconds.
- Runtime snapshot endpoint `200`: normalize into canonical slice(s) and set them to `LIVE`.
- Runtime snapshot endpoint `404`: provider is not available in the current hosting context; keep canonical `EMPTY` snapshot.
- Other non-2xx / timeout / invalid payload: set only that slice to `ERROR`.
- An error in one slice must not prevent other slices from rendering.
- Lite V1 exposes no create/amend/cancel/submit order endpoint.
- The browser never receives exchange API keys or private account credentials.

## Canonical StrategySnapshot

```json
{
  "status": "LIVE",
  "updatedAt": "2026-09-17T08:00:00Z",
  "items": [
    {
      "symbol": "BTCUSDT",
      "strategy": "A",
      "direction": "偏多觀察",
      "status": "ARMED",
      "statusLabel": "等待進場",
      "entry": 76000,
      "stop": 74800,
      "tp1": 77200,
      "tp2": 78500,
      "rr": 1.8,
      "confidence": "MEDIUM",
      "note": "read-only strategy snapshot",
      "updatedAt": "2026-09-17T08:00:00Z"
    }
  ]
}
```

Current runtime mapping:

- `candidates[]` become Strategy items.
- `pending[]` become Strategy items with `status="PENDING"` and `statusLabel="等待進場"`.
- `LONG` / `SHORT` are mapped to display-only direction labels.
- Missing price/target fields remain `null`; Lite must not invent values.

## Canonical PaperSnapshot

```json
{
  "status": "LIVE",
  "updatedAt": "2026-09-17T08:00:00Z",
  "summary": {
    "nav": 1012,
    "cash": 1010,
    "openPositions": 1,
    "pendingOrders": 1,
    "unrealizedPnl": 2,
    "portfolioRiskPct": 1.2
  },
  "positions": [],
  "pending": []
}
```

Current runtime mapping from the `5x` paper book:

- `books["5x"].equity -> nav`
- `books["5x"].balance -> cash`
- number of `books["5x"].positions -> openPositions`
- number of `pending[] -> pendingOrders`
- `equity - balance -> unrealizedPnl`
- `reserved_risk_fraction * 100 -> portfolioRiskPct`

This mapping is strictly read-only and does not mutate the Paper ledger.

## Canonical ResultsSnapshot

```json
{
  "status": "LIVE",
  "updatedAt": "2026-09-17T08:00:00Z",
  "summary": {
    "trades": 42,
    "winRatePct": 54.76,
    "expectancyR": 0.22,
    "profitFactor": 1.31,
    "netPnl": 3250,
    "maxDrawdownPct": null
  },
  "navCurve": [],
  "recentTrades": []
}
```

Current runtime mapping uses **closed Forward Paper trades only**:

- trade count = closed trades
- win rate = positive `net_pnl_usdt` / closed trades
- expectancy = average available `realized_r`
- profit factor = gross positive net P&L / absolute gross negative net P&L
- net P&L = sum of closed trade `net_pnl_usdt`
- max drawdown remains `null` until a trusted Forward Paper equity-history source exists

Lite must not fabricate a drawdown value.

## Canonical BacktestSnapshot

```json
{
  "status": "LIVE",
  "updatedAt": "2026-09-17T08:00:00Z",
  "input": {
    "symbol": "ETHUSDT",
    "strategy_version": "PB-1.0.0"
  },
  "result": {
    "trades": 124,
    "winRatePct": 51.6,
    "expectancyR": 0.21,
    "profitFactor": 1.28,
    "netReturnPct": 18.9,
    "maxDrawdownPct": 8.2
  },
  "equityCurve": []
}
```

Current source is `/api/backtest/latest`:

- `run_config -> input`
- `metrics.performance.closed_trades -> trades`
- ratio-form `win_rate`, `net_return`, and `max_drawdown` are converted to percent values
- `metrics.equity_curve -> equityCurve`

Historical Backtest remains a separate dataset. Reading it must not modify Forward Paper positions, orders, ledger events, or NAV.

## Future canonical HTTP façade

A Cloudflare Worker, Mac mini service, or another hosting adapter may later expose these canonical paths directly:

```text
GET /api/strategy
GET /api/paper
GET /api/results
GET /api/backtest
```

When that happens, only the service/transport layer may change. `appState`, page renderers, and UI contracts must remain unchanged.

## Execution boundary

```text
FOXYYA Lite Browser
       |
       +-- Binance public market data
       |
       +-- Runtime Bridge (GET only)
               |
               +-- /api/runtime/snapshot
               +-- /api/backtest/latest

Production Execution V2  <-- isolated / no Lite write path
```
