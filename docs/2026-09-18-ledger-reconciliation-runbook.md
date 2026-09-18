# FOXYYA P0 Ledger Reconciliation Runbook — 2026-09-18

## Scope

This change is **read-only** and does not modify Production Execution V2 strategy parameters, ledger events, or real-order safety controls.

## Objective

Before any new canonical paper entry is allowed, establish four facts from the canonical SQLite ledger:

1. Hash-chain integrity is valid.
2. Every paper position has a coherent lifecycle.
3. Current NAV and open positions can be replayed deterministically.
4. Active reserved portfolio risk can be proven within the 1.50% cap.

## Audit command

```bash
PYTHONPATH=src python tools/audit_canonical_ledger.py \
  --db /data/foxyya_v2_paper.sqlite \
  --config FOXYYA_V2_CONFIG.json \
  --output /tmp/foxyya-ledger-audit.json
```

The command opens SQLite with `mode=ro`. It does not append, update, delete, compact, migrate, or backfill ledger events.

## Pass criteria

- `ledger_hash_chain_verified=true`
- `integrity_ok=true`
- `nav_verified=true`
- `critical_issue_count=0`
- open positions and pending intents are explicitly enumerated
- `active_reserved_risk_fraction <= 0.015`
- 5x/8x/10x book NAVs match within numerical tolerance

## Failure handling

If any critical issue exists:

- Keep canonical new entries blocked.
- Do not assume the book is flat.
- Do not use 1,000 USDT as a canonical NAV.
- Do not backfill missed opportunities.
- Preserve the original SQLite volume unchanged.
- Reconcile by event identity and lifecycle; never rewrite historical fills to improve results.

## Strategy freeze

A/B/C/D thresholds, LONG/SHORT routing, risk fractions, stop rules, 5x/8x/10x books, and the 30-day Control strategy remain unchanged.
