# FOXYYA TW — Dependency Rules

## Allowed direction

```text
providers
   ↓
contracts + data_quality
   ↓
intelligence
   ↓
services
   ↓
read_models
   ↓
api
   ↓
tw_platform
```

Shared research validation modules:

```text
contracts/data_quality
   ├─> backtest
   ├─> portfolio
   └─> journal
          ↓
      read_models
```

## Forbidden dependencies

`research/tw/**` must not import:
- `foxyya.execution`
- `foxyya.runner`
- `foxyya.ledger`
- `foxyya.portfolio`
- private/signed exchange clients
- brokerage order clients

`tw_platform/**` must not:
- call TWSE/TPEx/MOPS endpoints directly
- contain private API keys
- calculate canonical research truth from raw payloads

## Ownership of truth

- Provider owns raw acquisition.
- Contract layer owns schema.
- Data-quality layer owns freshness/availability.
- Intelligence owns derived evidence.
- Service owns research workflow.
- Read model owns UI projection.
- UI owns presentation only.

No layer may silently take over the responsibility of a lower layer.
