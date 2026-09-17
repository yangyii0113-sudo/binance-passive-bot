# FOXYYA Lite — Railway Research Staging Rebuild

## Decision

Rebuild Research Staging as a lightweight read-only web shell. Do not repair or reuse the old Forward Runner container as the Lite platform runtime.

## Root causes found in legacy staging

1. Railway healthcheck was configured as `/ready`, but the legacy `service.py` did not expose `/ready`. Railway therefore received HTTP 404 until the healthcheck timeout expired and marked the deployment FAILED.
2. The container itself did start successfully on port 8080.
3. The legacy Forward Runner then received HTTP 451 from Binance USD-M from the Railway runtime location. `cycle_count` remained 0 and fills stayed frozen.
4. The old deployment coupled platform availability to market-provider availability, which violates the Lite architecture.

## Clean replacement service

Service name:

```text
foxyya-lite-staging
```

Git source:

```text
repo: yangyii0113-sudo/binance-passive-bot
branch: foxyya-lite-v1-20260917
root directory: foxyya-lite
Dockerfile: Dockerfile.staging
```

Railway deployment configuration:

```text
healthcheck: /healthz
healthcheck timeout: 60s
restart policy: ON_FAILURE
restart retries: 3
volume: none
```

The staging service must not run `service.py`, `ForwardRunner`, an execution loop, SQLite Paper ledger writes, or lineage writes.

## Runtime behavior

`staging_server.py` serves the Lite static shell and provides a liveness endpoint independent of market-data health.

```text
GET /healthz -> 200
```

Until a read-only upstream is configured, these endpoints intentionally return 404 so the browser canonical adapters resolve them to `EMPTY`:

```text
/api/strategy
/api/paper
/api/results
/api/backtest
/api/runtime/snapshot
/api/backtest/latest
```

Market prices remain a browser-side public-data concern and must not determine Railway service liveness.

## Safety invariants

- PAPER ONLY
- REAL ORDER LOCKED
- no private exchange credentials
- no order-write endpoint
- no Production Execution V2 dependency
- no Research Staging volume dependency
- one failed data source must not make the platform unavailable

## Migration sequence

1. Create `foxyya-lite-staging` in the existing `FOXYYA v12 Research Staging` Railway project.
2. Configure root directory, Dockerfile and `/healthz`.
3. Generate a new Railway domain.
4. Verify `/healthz`, `/`, five Lite routes, and API EMPTY degradation.
5. Keep legacy `foxyya-v12-staging` and lineage volume untouched during verification.
6. Only after the Lite replacement is proven healthy should the legacy service be stopped or removed.
7. Preserve or export old `/data` before any destructive volume action.

## Current external blocker

Railway currently refuses creation/deployment with:

```text
Your trial has expired. Please select a plan to continue using Railway.
```

No destructive migration should be performed until deployment access is restored and the replacement passes verification.
