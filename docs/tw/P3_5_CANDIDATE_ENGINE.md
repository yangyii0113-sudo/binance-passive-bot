# P3.5 — Taiwan Research Candidate Engine

**Status:** ACTIVE

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
- P3.6 remains locked until this gate completes
