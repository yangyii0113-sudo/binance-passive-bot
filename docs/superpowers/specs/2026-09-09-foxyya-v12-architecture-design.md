# FOXYYA v12 Architecture Specification v1.0

**Status:** Architecture Freeze — User Approved Direction  
**Date:** 2026-09-09  
**Branch:** `v12-multimarket-architecture`  
**Production impact:** None. This specification does not authorize changes to `main` or Railway Production.  
**Supersedes as architecture authority:** `docs/architecture/FOXYYA_v12_multimarket_product_spec.md` remains a precursor product draft; this document is the architecture source of truth for v12 implementation planning.

---

## 1. Product definition

FOXYYA v12 is a **Multi-Market Capital Intelligence Platform** that unifies three daily decision markets in one workspace:

1. **Crypto** — automated strategy research and 24/7 Forward Paper execution using the existing A/B/C/D + Execution V2 core.
2. **US Equities** — research and human decision support focused on trend, momentum, earnings, expectations, capital flow, sector behavior and price scenarios.
3. **Taiwan Equities** — research and human decision support focused on trend, momentum, monthly revenue, fundamentals, institutional flow, margin/short data, sector rotation and overseas linkage.

Regional intelligence extends beyond those three primary markets to:

- United States
- Taiwan
- China / Hong Kong
- Japan
- Korea
- Europe
- Crypto

The product promise is not “more indicators.” FOXYYA should reduce a large information surface into a traceable answer to:

- What is changing globally?
- Where is capital rotating?
- Which assets are entering an early trend or accumulation stage?
- Which Crypto setups are actually qualified for Forward Paper execution?
- Which US/TW assets deserve deeper human review?
- What happened after a strategy or research call?

---

## 2. Architecture constitution

The following requirements are non-negotiable across all v12 work.

### 2.1 Crypto execution safety

- `PAPER_ONLY=true`
- `REAL_ORDER_LOCK=true`
- No private exchange API keys or secrets in the frontend.
- No signed order, leverage-setting, withdrawal or transfer capability.
- No Backfill: a missed legal open is never reconstructed as a fill.
- Crypto qualification uses fully closed candles.
- Portfolio planned open risk remains `<= 1.50% NAV`.
- Canonical NAV is reconstructed from the persistent execution ledger, never edited in the UI.
- Existing A/B/C/D Control strategies are not silently modified by v12 research or UI changes.
- Control and Shadow research remain separated.
- Smart Money / Early Trend / News / AI context may inform research but may not directly write to the Control execution plane.

### 2.2 Data truth

Every user-visible value must be traceable through:

`Value -> Timestamp -> Source -> Market -> Confidence / Freshness`

A value that cannot be obtained must be `UNAVAILABLE`. A delayed or stored value must not be labeled `LIVE`.

### 2.3 Research is not execution

US, Taiwan and other equity-market research states are never mapped to Crypto execution states unless a future, separately approved stock Paper Engine exists.

- Research signal != trade signal.
- Research tracking != paper position.
- Scenario result != filled trade.
- Price scenario != unconditional forecast.

---

## 3. System layers

FOXYYA v12 is organized into six primary layers plus cross-cutting governance.

```text
Unified UI / Read Models
        ↓
Research Plane ───────────── Execution Plane
        ↓                         ↓
Early Trend Intelligence     Crypto A/B/C/D + Risk + Execution V2 + Ledger
        ↓
Global Intelligence / Context Engine
        ↓
Market Core + Market Clock + Event Bus + Data Quality
        ↓
Canonical Data / Provider Adapters
```

### Layer 1 — Data Layer

Responsible only for obtaining raw facts from market, fundamental, macro, news and calendar providers.

Provider families:

- Crypto Provider
- US Equity Provider
- Taiwan Equity Provider
- Korea Equity Provider
- Japan Equity Provider
- China / Hong Kong Equity Provider
- Europe Equity Provider
- Fundamental / Estimates Provider
- Institutional / Flow Provider
- Options Provider
- News Provider
- Macro Provider
- Calendar Provider
- Future On-chain Provider

Provider payloads are never consumed directly by the UI.

### Layer 2 — Market Core

Authoritative identity, market-time and relationship model for all assets.

Responsibilities:

- instrument identity
- exchange / venue
- asset class
- country / region
- currency
- sector / industry
- timezone
- trading session
- market holidays
- corporate actions
- ADR / primary listing relationships
- supply-chain / theme relationships

### Layer 3 — Global Intelligence

Answers “what is changing globally?” before evaluating individual assets.

Modules:

- Global Overview
- Regional Trend
- Market Context Engine
- Capital Rotation
- Cross-Market Impact
- Macro
- Geopolitics
- Economic Calendar
- Earnings / Corporate Events
- Risk Events

### Layer 4 — Early Trend Intelligence

Answers “is capital, expectation or market structure changing before the move becomes obvious?”

Modules:

- Smart Money Flow
- Institutional Flow
- Insider / Filing Activity
- Expectation Revision
- Options Intelligence
- Breadth Diffusion
- Capital Rotation Detector
- Lead-Lag Engine
- Volatility Regime Shift
- Smart Money Divergence
- Future On-chain Flow
- Signal Fusion Engine
- Pre-Entry Center

### Layer 5 — Research / Execution Planes

Two physically and logically distinct planes.

**Research Plane**

- US research
- Taiwan research
- other regional equity research
- Global Intelligence
- Early Trend Intelligence
- scenario analysis
- research tracking
- backtest / Shadow studies

**Execution Plane**

- Crypto A/B/C/D
- Regime routing
- qualification
- Risk Model
- Pending Intent
- future legal open
- Forward Paper Execution V2
- position management
- canonical execution ledger

Research Plane is read-only relative to the Control execution ledger.

### Layer 6 — Unified UI

The UI consumes stable read models rather than provider responses or mutable execution internals.

---

## 4. Market Core schema

### 4.1 Instrument identity

Required canonical object:

```json
{
  "instrument_id": "twse:2330",
  "symbol": "2330",
  "display_name": "台積電",
  "asset_class": "EQUITY",
  "venue": "TWSE",
  "region": "TAIWAN",
  "country": "TW",
  "currency": "TWD",
  "timezone": "Asia/Taipei",
  "sector": "Semiconductors",
  "industry": "Foundry",
  "primary_listing": true,
  "relationships": ["nyse:TSM"],
  "themes": ["AI", "HPC", "Foundry"]
}
```

The exact taxonomy may evolve by schema version, but `instrument_id` must remain stable for historical references.

### 4.2 Company / cross-listing relationship

FOXYYA must be able to represent one economic entity with several instruments.

Example:

```text
TSMC
├── TWSE:2330
└── NYSE:TSM ADR
```

Cross-listed instruments may share company intelligence but retain their own price, currency, session and trading history.

### 4.3 Market Clock

A single Market Clock service owns:

- open / closed state
- pre-market / regular / after-hours state where applicable
- exchange timezone
- holidays
- DST handling
- next open
- next close
- event-local time conversion

No page or engine independently computes exchange sessions.

Canonical event time is stored in UTC; user-facing default presentation is Asia/Taipei unless a market-local view is explicitly selected.

---

## 5. Canonical Data Contract

Provider data is normalized before entering Intelligence or Research.

Minimum canonical envelope:

```json
{
  "schema_version": "foxyya-data/1",
  "domain": "QUOTE",
  "instrument_id": "nasdaq:NVDA",
  "market": "US",
  "region": "US",
  "value": 0,
  "unit": "PRICE",
  "currency": "USD",
  "exchange_time": 0,
  "received_time": 0,
  "as_of": 0,
  "source": {
    "provider": "provider-id",
    "reference": "provider-record-id"
  },
  "quality": {
    "status": "LIVE",
    "freshness_ms": 0,
    "confidence": "HIGH"
  }
}
```

### 5.1 Quality states

Allowed presentation states:

- `LIVE`
- `DELAYED`
- `SNAPSHOT`
- `STALE`
- `UNAVAILABLE`

Freshness thresholds are domain/provider-specific and declared by the adapter. Consumers may not invent a threshold and relabel a stale value as live.

### 5.2 Multi-provider conflict rule

If more than one provider exists:

1. provider priority must be explicit;
2. timestamp and units must be normalized;
3. material conflicts must be surfaced to Data Quality;
4. no silent averaging of incompatible values;
5. the selected provider remains visible in provenance.

### 5.3 Corporate-action rule

Adjusted and unadjusted equity series must carry an explicit adjustment field. Historical return and trend calculations must not mix the two without a declared transformation.

---

## 6. Data Quality Gate

The Data Quality Gate sits between provider normalization and canonical consumption.

Checks include:

- schema validity
- instrument resolution
- unit / currency validity
- timestamp ordering
- stale / future timestamp rejection
- duplicate observations
- missing required fields
- provider conflict
- corporate-action consistency
- session plausibility

Failure behavior:

- one provider failure must not take down unrelated markets;
- a prior snapshot may remain visible only with `SNAPSHOT` or `STALE` status;
- no prior value may be silently promoted to current;
- `UNAVAILABLE` is preferable to fabricated continuity.

---

## 7. Event-driven architecture

FOXYYA v12 uses an event-driven domain model. “Event Bus” describes the logical contract; implementation technology is not frozen by this design document.

Core domain events:

- `MARKET_DATA_UPDATED`
- `CANDLE_CLOSED`
- `FUNDAMENTAL_UPDATED`
- `EXPECTATION_UPDATED`
- `INSTITUTIONAL_FLOW_UPDATED`
- `NEWS_PUBLISHED`
- `CALENDAR_EVENT_UPDATED`
- `REGIONAL_BIAS_CHANGED`
- `EARLY_STAGE_CHANGED`
- `CRYPTO_SIGNAL_QUALIFIED`
- `CRYPTO_INTENT_CREATED`
- `CRYPTO_PAPER_FILLED`
- `CRYPTO_POSITION_CLOSED`
- `LEDGER_INTEGRITY_ERROR`

Rules:

- a new closed candle may fan out to Crypto strategy analysis, US/TW trend research and Regional Trend without each page recomputing raw data;
- UI page loads must not be the trigger for core research calculations;
- execution events remain canonical in the execution ledger;
- research events are stored separately from execution events.

---

## 8. Global Intelligence

### 8.1 Regional coverage

Regional Intelligence v12 first scope:

1. United States
2. Taiwan
3. China / Hong Kong
4. Japan
5. Korea
6. Europe
7. Crypto

### 8.2 Regional Bias

Allowed bias labels:

- `STRONG_BULLISH`
- `BULLISH`
- `NEUTRAL`
- `BEARISH`
- `STRONG_BEARISH`

Every Regional Bias object also contains an independent confidence rating.

```json
{
  "region": "KOREA",
  "bias": "BULLISH",
  "confidence": 0.78,
  "as_of": 0,
  "drivers": [],
  "risks": [],
  "evidence": [],
  "data_status": "LIVE"
}
```

Bias is market context, not a trade instruction.

### 8.3 Region-specific evidence

**US**

- S&P 500 / Nasdaq / SOX / Russell
- breadth
- VIX
- yields / DXY
- sector rotation
- earnings / expectation revisions

**Taiwan**

- TAIEX / TPEx
- breadth / turnover
- foreign / investment trust / dealer flow
- sector rotation
- monthly revenue / earnings context
- overseas semiconductor linkage

**China / Hong Kong**

- core indices
- sector breadth
- policy / liquidity context
- cross-border flow when available

**Japan**

- Nikkei / TOPIX
- JPY / rates
- sector rotation
- foreign flow when available

**Korea**

- KOSPI / KOSDAQ
- Samsung Electronics / SK Hynix context
- semiconductor / HBM / memory cycle
- foreign flow
- USD/KRW
- export / policy context

**Europe**

- STOXX / major indices
- ECB / EUR / rates
- sector breadth and rotation

**Crypto**

- BTC / ETH
- eligible-universe breadth
- Funding / OI / crowding
- alt rotation
- Crypto Regime

---

## 9. Market Context Engine

The Context Engine combines high-level evidence into reusable research context.

Inputs:

- Regional Bias
- Macro
- breadth
- capital rotation
- sector rotation
- cross-market relationships
- volatility
- catalysts

Output:

```json
{
  "context_id": "taiwan:semiconductor:2026-09-09",
  "scope": "SECTOR",
  "market": "TW",
  "subject": "Semiconductors",
  "bias": "POSITIVE",
  "confidence": 0.82,
  "drivers": [],
  "risks": [],
  "next_events": [],
  "as_of": 0
}
```

Context may route attention or research priority. It must not directly create a Crypto fill or stock trade.

---

## 10. Early Trend Intelligence

### 10.1 Purpose

Detect early evidence before a trend becomes obvious while explicitly controlling false positives.

The system is designed to make FOXYYA **earlier at noticing change**, not to claim certainty about future price.

### 10.2 Stage machine

```text
DETECT
  ↓
EARLY_WATCH
  ↓
ACCUMULATION
  ↓
CONFIRMING
  ↓
READY
```

An asset may regress to an earlier state or become `INVALIDATED` when evidence fails.

Definitions:

- `DETECT` — isolated anomaly or new information exists.
- `EARLY_WATCH` — multiple early evidence families begin to align.
- `ACCUMULATION` — sustained flow / expectation / breadth evidence exists before full price confirmation.
- `CONFIRMING` — price, momentum or breadth begins confirming the earlier evidence.
- `READY` — enough evidence is aligned for human pre-entry review; this is still not an execution permission.
- `INVALIDATED` — explicit invalidation condition has occurred.

### 10.3 Evidence families

**Smart Money / Institutional**

- institutional accumulation / distribution
- foreign / investment trust flow for Taiwan
- insider / ownership filings where legally and reliably sourced
- large transaction / market-flow context where data rights permit

**Expectation**

- EPS estimate revisions
- revenue estimate revisions
- guidance changes
- analyst revision trends
- monthly revenue changes for Taiwan

**Options / Derivatives**

- unusual options volume
- volume / open interest
- skew / IV / term structure where available
- Crypto Funding / OI / crowding

**Breadth / Diffusion**

- sector breadth
- sub-industry breadth
- new highs / relative strength diffusion
- volume breadth

**Rotation**

- region rotation
- sector rotation
- narrative / supply-chain rotation

**Lead-Lag**

- statistical lead / lag relationships across sessions and markets
- examples: SOX -> TSM ADR -> 2330; NVDA -> HBM / AI supply chain; yields -> Nasdaq / BTC

**Volatility Shift**

- volatility compression
- range compression
- ATR / realized volatility percentile
- subsequent expansion

**Divergence**

- price flat while institutional / expectation / relative-strength evidence improves
- price rising while breadth / flow deteriorates

### 10.4 Signal Fusion output

Signal Fusion does not output BUY / SELL.

```json
{
  "instrument_id": "nasdaq:NVDA",
  "stage": "ACCUMULATION",
  "direction": "POSITIVE",
  "confidence": 0.76,
  "evidence_family_count": 5,
  "supporting_evidence": [],
  "contradictions": [],
  "invalidations": [],
  "next_confirmation": [],
  "as_of": 0,
  "research_only": true
}
```

No single evidence family may be labeled Smart Money certainty. Confidence is based on evidence agreement and data quality, not branding.

---

## 11. US Equity Research Engine

Primary six-dimension Research Read:

1. Trend
2. Momentum
3. Fundamental
4. Expectation
5. Flow
6. Risk

Additional modules:

- Earnings Intelligence
- Sector Rotation
- Options Intelligence where verified data exists
- Price Scenario
- Early Trend stage

### 11.1 Earnings / Expectation model

Research differentiates actual results from market expectations.

Required concepts when provider data supports them:

- actual EPS / revenue
- consensus EPS / revenue
- surprise
- guidance direction
- revision direction
- post-earnings reaction history

A strong fundamental number may still be negative relative to expectations; the system must not collapse `actual growth` and `expectation surprise` into one field.

---

## 12. Taiwan Equity Research Engine

Primary research dimensions:

- Trend
- Momentum
- Monthly Revenue
- Fundamental
- Institutional Flow
- Margin / Short / Lending context
- Sector Rotation
- Overseas Linkage
- Risk
- Price Scenario
- Early Trend stage

Institutional evidence must distinguish foreign investors, investment trusts and dealers rather than merging them into one anonymous flow number.

Cross-market linkage may reference US semiconductor / ADR / Korea memory evidence but must be presented as context rather than causality.

---

## 13. Other regional equity research

Korea, Japan, China/Hong Kong and Europe initially participate in Global / Regional Intelligence. Full asset-level research modules may be added after provider contracts are validated.

They use the same Research Plane architecture, but market-specific evidence is not fabricated to match US or Taiwan fields.

---

## 14. Price Scenario model

Equity research uses conditional scenarios instead of an unconditional AI price target.

Required scenarios:

- `BULL_CASE`
- `BASE_CASE`
- `BEAR_CASE`

Each scenario includes:

- trigger conditions
- structural price zone
- volatility context
- catalyst context
- invalidation
- source / calculation provenance
- as-of timestamp

Scenario labels may be generated or summarized by AI only after quantitative / factual inputs are preserved separately.

---

## 15. Crypto Execution Plane

The v11.2 execution core remains the authoritative execution system.

Sequence:

```text
Universe
→ Candidate
→ WATCH
→ ARMED
→ QUALIFIED / EXECUTABLE
→ PENDING_INTENT
→ Revalidation
→ Future Legal 1H Open
→ OPEN
→ Position Management
→ EXITED / CANCELLED
→ Ledger / Results
```

### 15.1 Existing strategy families

- A — Structure Pullback
- B — Momentum Continuation
- C — Starter-to-Add
- D — Compression Breakout / Breakdown

### 15.2 Execution isolation

Global Intelligence and Early Trend outputs may be displayed beside Crypto signals and may later be studied as Shadow features. They do not automatically alter Control thresholds, risk, quantity, entry timing or ledger events.

### 15.3 Canonical ledger

The existing append-only SQLite execution ledger remains the source of truth for:

- Signal / Intent / Position identity
- fill
- entry / stop
- quantity / risk
- fees / slippage / funding
- partial / trail / exit
- R / P&L / NAV
- rejection / cancellation reason

The Research Plane uses separate research storage and may not write execution events.

---

## 16. Asset Workspace

Every asset uses one workspace shell:

`Overview | Chart | Research | Events | History`

Shared UX does not mean shared financial logic.

### Crypto Research module

- Daily / 4H / 1H context
- A/B/C/D state
- structure
- RS/RW
- Funding / OI / crowding
- execution state

### US module

- trend / momentum
- earnings / expectations
- fundamental
- institutional / sector flow
- options where available
- Early Trend
- Price Scenario

### Taiwan module

- trend / momentum
- monthly revenue / fundamental
- institutional flow
- margin / short context
- sector rotation
- overseas linkage
- Early Trend
- Price Scenario

---

## 17. Research Tracking vs Positions

### Crypto Positions

Real Forward Paper states:

- Pending
- Open
- Partial
- Trailing / Managed
- Exited
- Cancelled

### Equity Research Tracking

Research-only states:

- Watch
- Early
- Accumulating
- Confirming
- Ready
- Tracking
- Invalidated

An equity Research Tracking record never contributes to Crypto trade count, NAV or Win Rate.

---

## 18. Results architecture

Two independent result families.

### 18.1 Crypto Trading Results

- closed trades
- sample count
- Win Rate
- Net P&L
- Net R
- Profit Factor
- Expectancy
- Average R
- Max Drawdown
- fees
- funding
- MFE
- MAE
- Capture Ratio

If valid completed sample count is `<20`, performance interpretation displays `Sample Insufficient`.

### 18.2 Equity Research Results

Research tracking may evaluate:

- +1D
- +5D
- +20D
- maximum favorable move
- maximum adverse move
- time to confirmation
- scenario hit / invalidation
- directional follow-through

These metrics are labeled `Research Performance` and are never combined with Crypto Trading Win Rate.

---

## 19. Lab architecture

### Crypto Strategy Lab

- A/B/C/D
- LONG / SHORT
- Regime
- 5x / 8x / 10x
- Expectancy / PF / MFE / MAE / Capture / DD / execution metrics

### US Research Lab

- Trend
- Momentum
- Earnings / Expectation
- Flow
- Early Trend evidence families

### Taiwan Research Lab

- Trend
- Momentum
- Monthly Revenue / Fundamental
- Institutional Flow
- Sector
- Early Trend evidence families

### Cross-Market Lab

Researches relationships such as:

- SOX -> TSM ADR -> 2330
- NVDA -> HBM -> Korea / Taiwan supply chain
- US 10Y -> Nasdaq -> BTC
- BTC -> ETH -> Alt rotation

Correlation or lead-lag statistics are descriptive research unless validated prospectively; they are not presented as deterministic causality.

### Learning loop

```text
Observation
→ Hypothesis
→ Shadow Variant
→ Forward Test
→ Compare
→ Review
→ Version Approval
```

No Shadow result directly overwrites Control.

---

## 20. Knowledge Graph

A Cross-Market Knowledge Graph is a planned architecture capability for relationship-aware intelligence.

Relationship types may include:

- company -> listing / ADR
- company -> supplier / customer
- company -> theme
- company -> sector
- sector -> region
- macro factor -> affected market
- event -> related asset

Initial implementation may use curated / provider-derived relationships. The graph must distinguish known relationships from inferred correlations.

---

## 21. Read Models and API boundary

Frontend reads normalized views rather than invoking provider adapters directly.

Required read-model domains:

- `home_global_status`
- `regional_trends`
- `market_rankings`
- `asset_snapshot`
- `asset_chart`
- `asset_research`
- `early_opportunities`
- `global_intelligence`
- `economic_calendar`
- `crypto_execution`
- `crypto_positions`
- `crypto_results`
- `equity_research_results`
- `lab_results`
- `system_health`

Conceptual v12 endpoints:

```text
GET /api/v12/home
GET /api/v12/regions
GET /api/v12/markets/{market}
GET /api/v12/assets/{instrument_id}
GET /api/v12/assets/{instrument_id}/research
GET /api/v12/early-opportunities
GET /api/v12/intelligence
GET /api/v12/calendar
GET /api/v12/research-results
GET /api/v12/health
```

Existing Crypto runtime endpoints remain intact during migration:

- `/api/runtime/status`
- `/api/runtime/events`
- `/api/runtime/snapshot`

The v12 API may adapt these read-only; it does not rename or mutate the execution contract during initial migration.

---

## 22. Primary user information architecture

Primary navigation:

1. Home
2. Markets
3. Research
4. Positions
5. Results
6. Lab

Auxiliary:

- Intelligence
- Economic Calendar
- Notifications
- Search
- System Health
- Settings

### 22.1 Home reading order

1. **Global Market Status** — primary three-market view plus regional context
2. **Today Focus** — highest-value market changes
3. **Early Trend** — Smart Money / rotation / expectation / pre-entry candidates
4. **Three-Market Market Board** — Crypto / US / Taiwan
5. **Opportunities** — Crypto Strategy / US Research / Taiwan Research
6. **Global Risk & Events** — macro / earnings / geopolitical / calendar

Home does not contain full charts, full position tables, full performance reports or system configuration.

### 22.2 Regional Trend page

Displays all seven regions with:

- bias
- confidence
- trend
- momentum
- flow
- macro
- risk
- bullish catalysts
- bearish catalysts
- upcoming risks

Selecting a region reveals evidence and cross-market linkages.

### 22.3 Pre-Entry Center

Research-only Early Opportunity view.

Each candidate shows:

- asset
- stage
- direction
- confidence
- evidence families aligned
- contradictions
- next confirmation
- invalidation

Primary action: `Open Research Detail`.

No `Buy` button exists in v12 equity research.

---

## 23. Button / action governance

Each content card:

- maximum 1 Primary action
- maximum 2 Secondary actions
- filters are visually separate from actions
- utility actions move to overflow where appropriate

Button classes:

- Primary — main next decision step
- Secondary — supporting detail
- Filter — visible-data scope
- Utility — favorite / reminder / export / settings

Avoid clusters containing Start / Run / Load / Read / Advance / Refresh / Analyze / Detail simultaneously.

---

## 24. Morning / session briefs

### Taiwan Morning Brief

- overnight US close
- Crypto overnight state
- macro / yields / DXY / gold / oil when verified
- seven-region change summary
- Taiwan opening context
- important events
- Early Trend watchlist

### US Pre-Market Brief

- US futures / index context when available
- Macro events
- Earnings
- Early Trend US watchlist
- Crypto state

Briefs summarize canonical data and research states. They do not fabricate forecasts.

---

## 25. Notifications

Notify only material events.

### Intelligence / research

- high-impact macro event
- major geopolitical shock
- material earnings / guidance change for followed assets
- Early Trend stage upgrade to `READY` when confidence / data-quality requirements are satisfied
- material Regional Bias change

### Crypto execution

- New Paper Entry
- Partial Exit
- Full Exit
- Risk Limit
- Critical Execution Error
- Ledger Integrity Error
- Material Strategy Health Change

Do not notify normal scans, ordinary rejects or heartbeat cycles.

---

## 26. System Health and observability

Health is domain-specific, not one global green light.

Required health groups:

- Frontend
- Crypto Market Data
- US Market Data
- Taiwan Market Data
- Other Regional Data
- Fundamental / Estimates
- News
- Macro / Calendar
- Early Trend pipelines
- Crypto Paper Engine
- Ledger

Each reports:

- status
- last successful update
- error / degradation reason
- freshness
- provider / subsystem

One failed provider must not mark unrelated domains unhealthy.

---

## 27. Version Registry

Version-controlled domains:

- Strategy Version
- Research Model Version
- Regional Bias Model Version
- Early Trend / Fusion Version
- Data Schema Version
- Scenario Model Version
- Frontend Release Version

Any result stored for later performance comparison must reference the version that produced it.

---

## 28. Storage boundaries

### Crypto execution storage

Existing persistent append-only SQLite ledger remains canonical and isolated.

### Research storage

Separate store for:

- normalized research snapshots
- Early Trend stages
- research tracking
- scenario definitions
- research results
- model versions

Research storage cannot create or edit Crypto execution events.

### Read-model / cache storage

May cache:

- latest market snapshot
- Global Intelligence snapshot
- Regional Bias snapshot
- Early Trend snapshot
- research snapshot
- Crypto execution snapshot

Cache entries always preserve original `as_of`, source and quality status.

---

## 29. Failure and degradation behavior

### Provider unavailable

- isolate affected provider / domain;
- retain last known data only with correct stale/snapshot status;
- show `UNAVAILABLE` if no safe snapshot exists.

### Conflicting data

- do not silently average;
- choose according to explicit provider policy or mark conflict;
- preserve provenance.

### Market Clock uncertainty

- research may degrade to unavailable;
- Crypto execution continues to use its existing verified timing logic and must not substitute UI time calculations.

### Research Engine error

- Research result becomes unavailable / stale;
- Crypto Execution Plane remains unaffected.

### Crypto execution error

- existing execution safety behavior remains authoritative;
- fills freeze when required;
- UI exposes the error without trying to reconstruct state independently.

### Ledger integrity error

- treat as critical;
- execution truth cannot be replaced by frontend calculations.

---

## 30. Testing and validation strategy

### 30.1 Contract tests

Validate:

- Instrument schema
- Canonical Data Contract
- Regional Bias
- Research Read
- Early Signal Fusion
- Read-model APIs

### 30.2 Market Clock tests

Include:

- Taiwan session
- US DST / standard time
- pre / regular / after-hours
- holidays
- Crypto 24/7

### 30.3 Data Quality tests

Include:

- stale data
- future timestamps
- duplicate observations
- missing currencies / units
- corporate-action series distinction
- provider conflict

### 30.4 Research / Execution isolation tests

Must prove:

- Research cannot write Crypto ledger.
- Early Trend cannot create an intent.
- News cannot create a fill.
- equity tracking cannot change NAV.

### 30.5 Crypto regression tests

Before any v12 Preview can replace an existing UI adapter, verify:

- PAPER_ONLY
- REAL_ORDER_LOCK
- Backfill = 0
- duplicate fill = 0
- ledger restart reconstruction
- existing A/B/C/D behavior parity
- Pending Intent / legal open behavior parity

### 30.6 UX contract tests

Verify:

- Home renders Crypto / US / Taiwan simultaneously.
- Regional page contains all seven regions.
- Research and Trading Results are labeled separately.
- every visible value exposes timestamp / source / status at detail level.
- mobile cards do not expose execution actions for equities.

---

## 31. Acceptance gates

### Architecture Gate

- this specification approved;
- no ambiguous page responsibility;
- no Research-to-Execution write path;
- Market Core and Data Contract frozen for implementation plan.

### Data Gate

- provider adapters produce canonical envelopes;
- stale / unavailable behavior verified;
- Market Clock verified for supported markets.

### Intelligence Gate

- Regional Bias provides evidence + confidence;
- no region output is based on a single unsupported label;
- Early Trend output includes contradictions and invalidation.

### Research Gate

- US and Taiwan Research Reads operate independently from execution;
- scenarios are conditional;
- stored research references model version and as-of time.

### Crypto Gate

- v11.2 execution safety and ledger behavior unchanged.

### Preview Gate

- all read models available in staging / preview;
- no production deployment caused by branch work;
- mobile and desktop navigation validated.

### Production Gate

Production migration requires a separate explicit approval after Preview validation.

---

## 32. Build sequence

The build sequence is frozen as follows.

### Phase 0 — Architecture Freeze

- Architecture Specification
- Functional Tree
- Sitemap
- Page Responsibility Map
- Action Map
- security / plane boundaries

### Phase 1 — Market Core + Canonical Data Contract

- Instrument identity
- Market Clock
- schema / quality envelope
- provider interface

### Phase 2 — Data Providers + Quality Gate

- Crypto parity
- US
- Taiwan
- fundamental / macro / news / calendar
- then additional regions according to verified provider availability

### Phase 3 — Global Intelligence

- Regional Trend
- Context Engine
- Capital Rotation
- Cross-Market Impact

### Phase 4 — Early Trend Intelligence

- Smart Money / institutional
- expectation revision
- breadth / rotation
- lead-lag
- volatility / divergence
- Signal Fusion / Pre-Entry

### Phase 5 — US / Taiwan Research Engines

- six-dimension US model
- Taiwan market-specific model
- scenario engine
- research tracking

### Phase 6 — Unified Asset Workspace

- common shell
- market-specific modules

### Phase 7 — Crypto Execution V2 Bridge

- read-only v12 adapters over existing Runtime / Ledger
- no strategy rewrite

### Phase 8 — Positions / Tracking / Results

- Crypto trading results
- Equity research results

### Phase 9 — Lab

- Crypto Strategy Lab
- US Research Lab
- Taiwan Research Lab
- Cross-Market Lab

### Phase 10 — Unified UI

- Home
- Markets
- Research
- Positions
- Results
- Lab
- Intelligence

### Phase 11 — Preview Validation

- staging / preview only
- contract, safety, responsive and data-quality validation

### Phase 12 — Production Migration

- separate explicit release decision
- no automatic deployment from Architecture / Preview approval

---

## 33. Out of scope for v12 architecture phase

The following are deliberately not authorized by this specification:

- real-money execution
- direct automated US / Taiwan stock order execution
- lowering Crypto strategy thresholds to increase signal count
- changing Crypto Control strategy based on Early Trend ideas without Shadow validation
- fabricating unavailable equity data
- treating filings, options flow or institutional data as certainty of “smart money” direction
- unconditional AI price targets
- rewriting historical fills
- merging Research Performance into Crypto Trading Performance

---

## 34. Final end-to-end flows

### 34.1 Platform data flow

```text
Data Sources
→ Normalize
→ Data Quality Gate
→ Market Core / Market Clock
→ Canonical Data
→ Global Intelligence
→ Early Trend Intelligence
→ Research / Crypto Execution
→ Tracking / Positions
→ Results
→ Lab
→ Versioned Research Feedback
```

### 34.2 Daily user flow

```text
Home
→ Global Market Status
→ Today Focus
→ Early Trend
→ Market / Asset Workspace
→ Research / Crypto Strategy
→ Human Decision OR Crypto Forward Paper Execution
→ Tracking / Positions
→ Results
→ Lab
```

### 34.3 Crypto execution flow

```text
Universe
→ Candidate
→ WATCH
→ ARMED
→ QUALIFIED / EXECUTABLE
→ PENDING_INTENT
→ Revalidation
→ Future Legal Open
→ PAPER OPEN
→ Management
→ EXIT / CANCEL
→ Ledger
→ Trading Results
```

### 34.4 Equity research flow

```text
Global / Regional Context
→ Early Detection
→ EARLY_WATCH
→ ACCUMULATION
→ CONFIRMING
→ READY
→ Asset Research
→ Human Decision
→ Research Tracking
→ Research Results
→ Lab
```

---

## 35. Architecture freeze statement

FOXYYA v12 implementation must optimize around this structure rather than adding page-local features opportunistically.

The product architecture is considered frozen when this document is approved. Any later proposal that changes one of the following requires an explicit architecture revision:

- Crypto Automation vs Equity Research role split
- Research / Execution isolation
- seven-region Regional Intelligence scope
- canonical Market Core identity model
- canonical Data Truth contract
- Early Trend stage model
- Trading Results vs Research Results separation
- primary build sequence
- Production release gate
