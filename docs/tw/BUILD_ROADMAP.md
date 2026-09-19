# FOXYYA TW — Build Roadmap

## Category map

| Layer | Category | Main responsibility |
|---|---|---|
| L0 | Governance | phase control, contracts, CI, boundaries |
| L1 | Data Core | instrument registry, TWSE/TPEx/public disclosure adapters |
| L2 | Data Quality | provenance, timestamp, freshness, availability |
| L3 | Intelligence | breadth, flow, sector rotation, trend, events |
| L4 | Research Services | market radar, candidate research, technical/event research |
| L5 | Validation | backtest, portfolio risk, journal review |
| L6 | Read Models/API | stable JSON contracts for UI |
| L7 | Experience | desktop/mobile dashboard |
| L8 | Operations | staging, monitoring, rollback, deployment |

---

## P0 — Foundation / Anti-collapse layer

### Build
- architecture source of truth
- canonical contracts
- data-quality gate
- provider interface
- stable read-model boundary
- dependency rules
- phase manifest
- CI architecture gate

### Exit gate
- research-only boundary test passes
- missing provenance => UNAVAILABLE
- stale data => STALE
- UI contains no direct official-provider fetch URL
- only one ACTIVE phase in phase manifest

### Forbidden in P0
- live provider integration
- scoring model tuning
- deployment
- execution integration

---

## P1 — Taiwan Data Core

### Build
- instrument registry
- TWSE adapter
- TPEx adapter
- public disclosure adapter
- canonical OHLCV observations
- index observations
- trading-day/session model
- fixture datasets

### Acceptance instruments
- 2330
- 2317
- 2454
- 2308
- 2881

### Exit gate
- source / timestamp / availability present for every visible value
- provider failure returns explicit unavailable/stale states
- deterministic fixture tests pass
- no raw provider schema leaks above adapter layer

---

## P2 — Market Intelligence

### Build
- TAIEX / TPEx context
- breadth
- turnover
- institutional flow
- margin/short context
- sector rotation
- market-regime research state

### Exit gate
- dashboard can render from canonical fixtures without network
- partial data degrades confidence instead of crashing
- each intelligence output cites input evidence

---

## P3 — Stock Research Workspace

### Build
- stock profile
- daily / weekly technical structure
- support / resistance
- MA / EMA / RSI / MACD / momentum
- monthly revenue / financial-event context
- event timeline
- research candidate engine

### Exit gate
- candidate requires minimum evidence set
- insufficient evidence => INSUFFICIENT_DATA
- scenario / invalidation are research fields only
- no order object exists

---

## P4 — Backtest & Research Validation

### Build
- Taiwan historical dataset contract
- deterministic research replay
- strategy-rule definitions
- win rate
- expectancy
- profit factor
- max drawdown
- transaction-cost sensitivity

### Exit gate
- no look-ahead
- complete provenance
- historical simulation clearly labelled
- benchmark / sample window recorded
- failed integrity checks block normal KPI output

---

## P5 — Portfolio Risk & Journal

### Build
- holdings input
- concentration
- sector exposure
- correlation
- -10 / -20 / -30 stress tests
- recent-20-trade journal review
- recurring mistake classification
- personal-rule tracking

### Exit gate
- portfolio analysis never mutates positions
- journal analytics are reproducible from stored inputs
- stress-test assumptions shown explicitly

---

## P6 — Product UI / Mobile

### Build
- home
- market radar
- stock workspace
- AI research
- backtest
- portfolio risk
- journal
- daily plan
- responsive iPhone/Safari flow

### Exit gate
- mobile navigation usable
- no fake LIVE labels
- empty / stale / unavailable states designed
- all UI screens consume read models only

---

## P7 — Staging / Observability

### Build
- separate Research Staging deployment
- health endpoint
- provider health
- freshness dashboard
- error budget
- rollback path
- deployment smoke tests

### Exit gate
- repeated refresh cycles without data-contract violation
- deploy rollback tested
- no dependency on Production Execution V2 runtime

---

## P8 — AI Enhancement / Automation

Only after P0–P7 are stable.

### Build
- evidence summarization
- event classification
- research explanations
- watchlist prioritization
- journal pattern detection

### Rule
AI may summarize and rank research evidence but must not bypass Data Quality, Phase Gates or execution boundaries.
