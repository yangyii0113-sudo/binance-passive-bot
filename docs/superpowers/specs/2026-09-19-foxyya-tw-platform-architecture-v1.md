# FOXYYA Taiwan Market Intelligence — Architecture v1

**Status:** Architecture scaffold  
**Branch:** `tw-research-platform-v1-20260919`  
**Base:** `v12-platform-completion-20260910`  
**Scope:** Taiwan equities research only  
**Execution:** No order submission, no broker/private exchange credentials, no Production Execution V2 changes.

---

## 1. Architecture objective

Build the Taiwan-equity part of FOXYYA as an isolated **Research Plane** rather than another execution engine.

The platform must answer, in order:

1. What is the Taiwan market doing?
2. Where is capital rotating?
3. Which sectors and instruments deserve review?
4. What do price structure, flow, fundamentals and events say?
5. What does historical evidence say about a research rule?
6. What portfolio risk exists?
7. What should the user review before / during / after the session?

The platform may generate research states and scenarios, but **must not create executable orders**.

---

## 2. Six-layer architecture

```text
┌────────────────────────────────────────────────────────────┐
│ 6. Presentation / UI                                       │
│ Dashboard · Market Radar · Stock Workspace · Backtest      │
│ Portfolio Risk · Journal · Daily Plan                      │
├────────────────────────────────────────────────────────────┤
│ 5. Read Models / API                                       │
│ Stable JSON projections · mobile-first response contracts  │
├────────────────────────────────────────────────────────────┤
│ 4. Research Services                                       │
│ Candidate Engine · Technical · News/Event · Backtest       │
│ Portfolio Risk · Journal Review · Daily Plan               │
├────────────────────────────────────────────────────────────┤
│ 3. Intelligence                                            │
│ Sector Rotation · Institutional Flow · Breadth · Momentum  │
│ Fundamentals · Event Impact · Cross-market linkage         │
├────────────────────────────────────────────────────────────┤
│ 2. Canonical Data + Data Quality                           │
│ Instrument · Observation · Freshness · Availability        │
│ Provenance · Validation · UNAVAILABLE/STALE rules          │
├────────────────────────────────────────────────────────────┤
│ 1. Provider Adapters                                       │
│ TWSE · TPEx · MOPS/Public disclosure · future providers    │
└────────────────────────────────────────────────────────────┘
             ↓
Cross-cutting: cache · audit · observability · provenance
```

---

## 3. Repository boundaries

```text
research/
└── tw/
    ├── contracts.py
    ├── data_quality.py
    ├── read_models.py
    ├── providers/
    │   └── base.py
    └── services/
        ├── market_radar.py
        └── candidate_engine.py

tw_platform/
├── index.html
├── styles.css
└── app.js
```

Rules:

- `research/tw/**` may read public / approved market data.
- `research/tw/**` must not import or mutate execution ledger/order modules.
- `tw_platform/**` consumes read models only; provider payloads never go directly to UI.
- Production Crypto Execution V2 remains separate.
- Any future brokerage integration requires a separate architecture approval.

---

## 4. Canonical contracts

### Instrument

Stable identity independent of data provider.

Required fields:

- `instrument_id` — e.g. `twse:2330`
- `symbol`
- `name`
- `venue` — TWSE / TPEX
- `currency` — TWD
- sector / industry when available

### Observation

Every user-visible value must be traceable:

```text
value
→ field
→ instrument_id
→ source
→ observed_at
→ received_at
→ freshness
→ availability
```

Availability:

- `AVAILABLE`
- `STALE`
- `UNAVAILABLE`

No source/timestamp => never label as live.

### Research Signal

Research signal is descriptive research state only:

- bullish
- neutral
- bearish
- insufficient_data

It must contain rationale and evidence references.

It cannot contain broker order IDs, signed-order payloads or execution commands.

---

## 5. Provider layer

Initial provider families:

1. **TWSE Provider**
   - index / stock market data
   - trading statistics
   - institutional flows where available

2. **TPEx Provider**
   - OTC index / listed OTC instruments
   - trading statistics
   - flow data where available

3. **Public Disclosure Provider**
   - revenue / financial events / material information

Provider responsibilities:
- fetch raw data
- preserve source timestamp
- expose explicit failure
- never silently substitute fabricated values

Provider must not:
- calculate final UI scores
- decide buy/sell
- write to execution ledger

---

## 6. Intelligence modules

### Market Radar

Produces:
- index state
- breadth
- turnover
- foreign / investment trust / dealer flow
- margin / short context
- sector rotation
- market regime research state

### Candidate Engine

Inputs:
- watchlist or selected universe
- technical context
- capital flow
- fundamentals
- events
- data quality

Outputs:
- research candidates
- evidence
- scenario ranges
- invalidation condition
- risk notes

A candidate is **not** an order recommendation and does not create a position.

### Technical Research

- daily / weekly trend
- support / resistance
- MA / EMA
- RSI / MACD / momentum
- volume confirmation
- volatility state

### Event Intelligence

- material information
- monthly revenue
- earnings / conference events
- dividend / corporate action
- industry / overseas linkage

### Backtest Research

Metrics:
- sample count
- win rate
- expectancy
- profit factor
- max drawdown
- cost sensitivity

Historical results must be explicitly labelled historical simulation.

### Portfolio Risk

- position concentration
- sector concentration
- correlation
- exposure
- stress scenarios

### Journal / Daily Plan

- latest 20-trade review
- recurring mistakes
- missed opportunities
- user rules
- pre-market / intraday / close checklist

---

## 7. Read-model/API boundary

UI may consume only stable read models, for example:

```text
GET /api/tw/overview
GET /api/tw/market-radar
GET /api/tw/instruments/{symbol}
GET /api/tw/candidates
GET /api/tw/events
GET /api/tw/backtests/{run_id}
GET /api/tw/portfolio-risk
GET /api/tw/journal
GET /api/tw/daily-plan
```

These routes are architecture targets; this commit does not wire them into Production `service.py`.

---

## 8. Mobile-first UI architecture

Navigation:
- 首頁
- 雷達
- AI 研究
- 回測
- 日誌

Desktop adds:
- 技術分析
- 新聞事件
- 組合風險

Home priority:
1. data freshness
2. index / breadth
3. market state
4. sector rotation
5. institutional flow
6. research candidates
7. events / risks

No fake live indicators.

---

## 9. Failure model

Provider error:
- preserve last successful value if policy allows
- mark STALE
- show timestamp

No usable value:
- return UNAVAILABLE

Partial data:
- degrade module confidence
- do not fail whole dashboard

Data-quality failure:
- block candidate calculation that depends on the missing field

---

## 10. Architecture gates

Before data integration is considered complete:

- [ ] No imports from Taiwan Research Plane into Crypto execution modules.
- [ ] No order submission path in `research/tw/**`.
- [ ] Every visible market value has source + timestamp + availability.
- [ ] Missing data returns UNAVAILABLE.
- [ ] Mobile Safari layout remains usable.
- [ ] Candidate engine degrades safely on partial data.
- [ ] Backtest results clearly identify historical simulation.
- [ ] UI consumes canonical read models rather than raw provider payloads.

---

## 11. Build sequence

**P0 — Architecture & contracts**  
Canonical contracts, data-quality gate, provider interface, read-model boundary.

**P1 — Official public data**  
TWSE / TPEx baseline market data and instrument registry.

**P2 — Market Radar**  
Index, breadth, turnover, institutional flow, sector rotation.

**P3 — Stock Workspace**  
2330 / 2317 / 2454 / 2308 / 2881 as acceptance instruments.

**P4 — AI Research Candidate Engine**  
Evidence-based research candidate generation.

**P5 — Backtest / Portfolio / Journal**  
Research validation and personal decision process.

**P6 — Deployable mobile platform**  
Cloud-hosted read-only research dashboard.
