# P3.5 — Taiwan Research Candidate Engine

**Status:** COMPLETE

## Purpose

Convert already-validated research evidence into a deterministic review
candidate. A candidate is not an order, forecast guarantee, or execution
instruction.

## Required evidence families

A normal candidate requires all of:

1. stock workspace / current quote;
2. P3.3 technical research;
3. P3.4 fundamentals/events context;
4. same-session P2 market regime context;
5. explicit evidence provenance and coverage.

Missing a required family produces `INSUFFICIENT_DATA`.

## Output contract

- instrument_id
- research state: bullish / neutral / bearish / insufficient_data
- scenario
- invalidation
- rationale
- evidence references
- risk notes
- confidence based on evidence completeness/consistency
- execution_allowed=false

## Construction slices

### P3.5.1 Evidence Gate
- validate symbol / venue / date compatibility
- enforce minimum coverage
- reject missing or contradictory source families
- never fabricate scenario levels

### P3.5.2 Research Fusion
- descriptive technical direction
- market-regime context
- revenue/event context
- risk-note aggregation
- deterministic research state

### P3.5.3 Scenario / Invalidation
- derive review scenario only from available canonical levels/evidence
- invalidation must be explicit or UNAVAILABLE
- no broker/order payload

### P3.5.4 Review Ranking
- deterministic priority for human review
- ranking is not a return prediction or win-rate claim
- insufficient-data candidates rank below evidence-complete candidates

## Exit gate

- deterministic fixture tests green
- missing evidence fails closed
- date / venue mismatch fails closed
- candidate cannot set execution_allowed=true
- no provider/network dependency in candidate service
- no Production Execution V2 import
- official live smoke green on acceptance symbols
- P3.6 is unlocked after the acceptance evidence below

## Acceptance — 2026-09-23

Implementation reviewed at `807e7f9952da72b93a76979301e3aae5844530e6`.
Fresh local Taiwan suite: **234 passed** (Python 3.12).
[GitHub architecture gate](https://github.com/yangyii0113-sudo/binance-passive-bot/actions/runs/35760532319): 234 passed at that commit.
[Official live smoke](https://github.com/yangyii0113-sudo/binance-passive-bot/actions/runs/35760526005): all four steps passed at `2db4e27b9a5509110ebc71c5944586b5b78522e0`.
The subsequent implementation commit only exports candidate service symbols;
its architecture gate verifies those imports. The official candidate step
accepted TWSE 2330 and TPEx 6488 at common market date 2026-09-22, both with
`execution_allowed=false`. These are recorded acceptance results, not a
continuous freshness or production-readiness claim.

P3.5.4 and P3.5 are complete; only P3.6 is now active. P3 itself remains active.
Next: stable JSON stock-workspace read model combining canonical quote,
technical, fundamentals/events and candidate evidence, with deterministic
serialization, explicit missing states and official acceptance. UI/mobile
and deployment remain separate later phases. No execution runtime changes.
