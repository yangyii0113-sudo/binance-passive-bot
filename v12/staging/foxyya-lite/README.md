# FOXYYA Lite V1

Zero-build static MVP for the simplified FOXYYA platform.

## Scope

- Home
- Strategies
- Paper Orders
- Forward Paper Results
- Historical Backtest shell
- Mobile-first bottom navigation
- Mock data only in Sprint 01

## Safety boundaries

- PAPER ONLY
- REAL ORDER LOCKED
- No Production Execution V2 changes
- No live-order actions in the UI
- Forward Paper and Historical Backtest remain separate

## Run locally

```bash
python -m http.server 8765 --directory foxyya-lite
```

Then open `http://127.0.0.1:8765/`.

## Routes

The MVP uses hash routing so it can be hosted as static files without server-side routing dependencies:

- `#/`
- `#/strategies`
- `#/orders`
- `#/results`
- `#/backtest`

## Sprint 02

Replace the Market Pulse mock rows with BTCUSDT / ETHUSDT / SOLUSDT public market snapshots and add LIVE / STALE / ERROR fallback handling.
