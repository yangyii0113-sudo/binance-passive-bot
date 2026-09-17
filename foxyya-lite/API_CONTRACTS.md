# FOXYYA Lite Snapshot API Contracts

FOXYYA Lite consumes read-only canonical snapshots. Data providers may be the existing FOXYYA engine, a Cloudflare Worker, a Mac mini bridge, or another adapter, but the browser contract does not change.

## Common transport rules

- Method: `GET` only.
- Default browser timeout: 5 seconds.
- `200`: parse canonical snapshot and set slice to `LIVE`.
- `404`: provider is not configured yet; keep canonical `EMPTY` snapshot.
- Other non-2xx / timeout / invalid payload: set only that slice to `ERROR`.
- An error in one slice must not prevent other slices from rendering.
- Lite V1 exposes no create/amend/cancel/submit order endpoint.

## GET /api/strategy

```json
{
  "updated_at": "2026-09-17T08:00:00Z",
  "items": [
    {
      "symbol": "BTCUSDT",
      "strategy": "A",
      "direction": "LONG WATCH",
      "status": "PENDING_INTENT",
      "status_label": "等待確認",
      "entry": 76000,
      "stop": 74800,
      "tp1": 77200,
      "tp2": 78500,
      "rr": 1.8,
      "confidence": "MEDIUM",
      "note": "read-only strategy snapshot",
      "updated_at": "2026-09-17T08:00:00Z"
    }
  ]
}
```

Required per item: `symbol`, `strategy`.

The adapter accepts snake_case or camelCase timestamp/status-label fields and normalizes them before they reach the page layer.

## GET /api/paper

```json
{
  "updated_at": "2026-09-17T08:00:00Z",
  "summary": {
    "nav": 100000,
    "cash": 95000,
    "open_positions": 1,
    "pending_orders": 1,
    "unrealized_pnl": 250,
    "portfolio_risk_pct": 0.75
  },
  "positions": [],
  "pending_orders": []
}
```

This endpoint is strictly read-only. It must not mutate the Paper ledger or invoke Production Execution V2.

## GET /api/results

```json
{
  "updated_at": "2026-09-17T08:00:00Z",
  "summary": {
    "trades": 42,
    "win_rate_pct": 54.76,
    "expectancy_r": 0.22,
    "profit_factor": 1.31,
    "net_pnl": 3250,
    "max_drawdown_pct": -4.6
  },
  "nav_curve": [],
  "recent_trades": []
}
```

Results represent Forward Paper only. Historical Backtest data must never be merged into this endpoint.

## GET /api/backtest

```json
{
  "updated_at": "2026-09-17T08:00:00Z",
  "input": {
    "symbol": "ETHUSDT",
    "strategy": "A",
    "time_range": "1Y",
    "timeframe": "1H"
  },
  "result": {
    "trades": 124,
    "win_rate_pct": 51.6,
    "profit_factor": 1.28,
    "net_return_pct": 18.9,
    "max_drawdown_pct": -8.2
  },
  "equity_curve": []
}
```

Historical Backtest is a separate dataset. Reading or running a backtest must not modify Forward Paper positions, orders, ledger events, or NAV.

## Execution boundary

The Lite browser must never directly consume exchange API keys or private account credentials.

```text
FOXYYA Lite Browser
       |
       +-- public Binance market data
       |
       +-- /api/strategy  (read only)
       +-- /api/paper     (read only)
       +-- /api/results   (read only)
       +-- /api/backtest  (read only snapshot)

Production Execution V2  <-- isolated / no Lite write path
```
