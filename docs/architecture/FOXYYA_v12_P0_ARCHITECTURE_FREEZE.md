# FOXYYA v12 — P0 Architecture Freeze

**Status:** FROZEN FOR IMPLEMENTATION  
**Date:** 2026-09-09  
**Branch:** `v12-multimarket-architecture`  
**Production impact:** None  
**Architecture authority:** `docs/superpowers/specs/2026-09-09-foxyya-v12-architecture-design.md`

---

## 0. Freeze declaration

FOXYYA v12 is frozen at the product-architecture level before further implementation expansion.

The purpose of this freeze is to stop opportunistic page-local feature growth and make every subsequent implementation map to a named responsibility, data contract, read model, research engine, execution boundary or release gate.

The following are frozen unless an explicit Architecture Revision is approved:

1. Crypto Automation vs Equity Research role split.
2. Research Plane vs Execution Plane isolation.
3. Primary markets: Crypto, US Equities, Taiwan Equities.
4. Regional Intelligence scope: US, Taiwan, China/HK, Japan, Korea, Europe, Crypto.
5. Primary navigation and page responsibilities.
6. Home information hierarchy.
7. Asset Workspace shell.
8. Early Trend stage model.
9. Trading Results vs Research Results separation.
10. Canonical data-truth contract.
11. Build-phase order and Production release gate.

No document in this freeze authorizes real-money execution or Production migration.

---

# 1. Product role split

## 1.1 Primary daily markets

### Crypto

Role: **Automation + Forward Paper Execution**

Responsibilities:

- A/B/C/D strategy evaluation
- qualification
- Pending Intent
- Future Legal Open
- 24/7 Paper execution
- risk management
- ledger
- Paper Positions
- Trading Results
- Crypto Strategy Lab

### US Equities

Role: **Research + Human Decision Support**

Responsibilities:

- trend
- momentum
- earnings
- expectations
- institutional / sector flow
- options when licensed data exists
- Early Trend
- conditional Price Scenario
- research tracking
- Research Results

No automated stock order execution exists in v12.

### Taiwan Equities

Role: **Research + Human Decision Support**

Responsibilities:

- trend
- momentum
- monthly revenue
- fundamentals
- foreign / investment trust / dealer flow
- margin / short context
- sector rotation
- overseas linkage
- Early Trend
- conditional Price Scenario
- research tracking
- Research Results

No automated stock order execution exists in v12.

---

# 2. Regional Intelligence scope

Frozen first-version region set:

1. US
2. Taiwan
3. China / Hong Kong
4. Japan
5. Korea
6. Europe
7. Crypto

Each region may expose:

- status
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
- supporting evidence
- contradictions
- cross-market linkages

## 2.1 Regional bias vocabulary

Only the following directional labels are valid:

- `STRONG_BULLISH`
- `BULLISH`
- `NEUTRAL`
- `BEARISH`
- `STRONG_BEARISH`
- `UNAVAILABLE`

`status` and `bias` are separate concepts.

Valid example:

```text
status = AVAILABLE
bias   = UNAVAILABLE
```

This means regional data exists but directional evidence is not yet sufficient.

---

# 3. Frozen system layers

```text
L6  Unified UI / Stable Read Models
                ↓
L5  Research Plane            Execution Plane
        ↓                          ↓
L4  Early Trend              Crypto A/B/C/D
        ↓                    Risk / Execution V2
L3  Global Intelligence           Ledger
        ↓
L2  Market Core / Market Clock / Data Quality / History
        ↓
L1  Canonical Data / Provider Adapters / Source Catalog
```

Cross-cutting governance:

- Source lineage
- version registry
- auditability
- observability
- failure isolation
- Branch Scope Gate
- Production release gate

---

# 4. Functional tree

```text
FOXYYA v12
│
├── HOME
│   ├── Global Market Status
│   ├── Today Focus
│   ├── Early Trend
│   ├── Three-Market Board
│   ├── Opportunities
│   │   ├── Crypto Strategy Opportunities
│   │   ├── US Research Opportunities
│   │   └── Taiwan Research Opportunities
│   └── Global Risk & Events
│
├── MARKETS
│   ├── All Markets
│   ├── Crypto
│   ├── US
│   ├── Taiwan
│   ├── Rankings
│   ├── Watchlist
│   ├── Sector / Theme
│   └── Asset Workspace
│       ├── Overview
│       ├── Chart
│       ├── Research
│       ├── Events
│       └── History
│
├── RESEARCH
│   ├── Early Opportunities / Pre-Entry Center
│   ├── US Research
│   ├── Taiwan Research
│   ├── Regional Equity Research
│   ├── Price Scenarios
│   └── Research Tracking
│
├── POSITIONS
│   ├── Crypto Pending
│   ├── Crypto Open
│   ├── Crypto Managed / Partial
│   ├── Crypto Exited
│   └── Equity Research Tracking
│
├── RESULTS
│   ├── Crypto Trading Performance
│   └── Equity Research Performance
│
├── LAB
│   ├── Crypto Strategy Lab
│   ├── US Research Lab
│   ├── Taiwan Research Lab
│   └── Cross-Market Lab
│
└── INTELLIGENCE
    ├── Global Overview
    ├── Regional Trend
    ├── Capital Rotation
    ├── Cross-Market Impact
    ├── Macro
    ├── Geopolitics
    ├── Economic Calendar
    ├── Earnings / Corporate Events
    └── Risk Events

AUXILIARY
├── Search
├── Notifications
├── System Health
└── Settings
```

---

# 5. Frozen sitemap

## 5.1 Primary desktop navigation

1. Home
2. Markets
3. Research
4. Positions
5. Results
6. Lab

Secondary / auxiliary:

- Intelligence
- Economic Calendar
- Notifications
- Search
- System Health
- Settings

## 5.2 Mobile navigation

Daily-use bottom navigation:

1. Home
2. Markets
3. Research
4. Positions
5. Results

`More` contains:

- Lab
- Intelligence
- Calendar
- Notifications
- System Health
- Settings

## 5.3 Route responsibility rule

A feature belongs to one primary page only. Other pages may show summaries or deep links, but must not duplicate the full responsibility.

---

# 6. Page Responsibility Map

| Page | Owns | May summarize | Must not own |
|---|---|---|---|
| Home | daily decision overview | market status, Early Trend, opportunities, risks | full charts, full result reports, configuration |
| Markets | discovery, rankings, market board, asset entry point | trend / sector summaries | strategy execution, full research report |
| Research | detailed equity research, Early Trend, scenarios | regional context | Crypto ledger mutation, stock orders |
| Positions | Crypto Paper position lifecycle + equity research tracking | risk / current research state | backtest analysis, market discovery |
| Results | realized Crypto performance + research follow-through | sample status | execution controls, model editing |
| Lab | hypothesis, Shadow, comparison, version evaluation | historical results | automatic Control promotion |
| Intelligence | global/regional/macro/cross-market context | asset linkage | order execution, P&L ownership |
| System Health | provider/runtime/ledger health | freshness | trading decisions |
| Settings | preferences and permitted configuration | defaults | hidden strategy threshold mutation |

---

# 7. Home freeze

Home reading order is fixed:

1. **Global Market Status**
2. **Today Focus**
3. **Early Trend**
4. **Three-Market Board**
5. **Opportunities**
6. **Global Risk & Events**

## 7.1 Home exclusions

Home must not contain:

- full K-line workspaces
- complete open-position tables
- complete trading-performance report
- complete Research Result report
- strategy threshold editing
- provider credentials
- order-entry controls for equities

## 7.2 Home opportunity semantics

Crypto opportunity label:

`PAPER / READ-ONLY` until the user enters the existing execution workflow.

Equity opportunity label:

`RESEARCH`

No equity `BUY`, `SELL`, `OPEN POSITION` or execution-equivalent action exists.

---

# 8. Asset Workspace freeze

All asset classes use one shell:

```text
Overview | Chart | Research | Events | History
```

Shared shell does not imply shared finance model.

## 8.1 Crypto workspace

May show:

- Daily / 4H / 1H structure
- A/B/C/D states
- RS/RW
- Funding / OI / crowding
- Paper execution state
- Paper history

## 8.2 US workspace

May show:

- trend
- momentum
- fundamentals
- earnings
- expectations
- institutional / sector flow
- options when available
- Early Trend
- conditional Price Scenario

## 8.3 Taiwan workspace

May show:

- trend
- momentum
- monthly revenue
- fundamentals
- foreign / investment trust / dealer flows
- margin / short context
- sector rotation
- overseas linkage
- Early Trend
- conditional Price Scenario

Equity Workspace contract rejects execution modules.

---

# 9. Early Trend freeze

Frozen state progression:

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

Early Trend is research-only.

Evidence families may include:

- Institutional / Smart Money
- Expectation Revision
- Breadth Diffusion
- Capital Rotation
- Options Intelligence
- Lead-Lag
- Volatility Regime Shift
- Divergence
- On-chain context where applicable

Rules:

- duplicate evidence family cannot inflate readiness;
- stale evidence cannot advance stage;
- contradictions remain visible;
- `READY` does not mean order authorization;
- no single unsupported “smart money” label may create a trade instruction.

---

# 10. Data flow freeze

```text
Official / Approved Source
        ↓
Source Catalog / Activation Gate
        ↓
Transport Loader
        ↓
Official Adapter
        ↓
Canonical Observation / Event
        ↓
Data Quality / Point-in-Time Validation
        ↓
Research History / Market Core
        ↓
Global Intelligence / Early Trend / Research
        ↓
Stable Read Model
        ↓
View Model
        ↓
Renderer / UI
```

The frontend never consumes raw provider payloads directly.

---

# 11. Data Truth contract

Every user-visible value must preserve:

- value
- source
- observed / publication time where available
- received time
- market / scope
- status
- freshness
- confidence / quality where applicable
- schema / model version when stored for later evaluation

Allowed availability vocabulary:

- `LIVE`
- `DELAYED`
- `SNAPSHOT`
- `STALE`
- `UNAVAILABLE`

Rules:

- missing is not zero;
- delayed is not LIVE;
- stored is not LIVE;
- source failure does not fabricate fallback values;
- point-in-time invalid data is rejected;
- provider conflict is not silently averaged;
- historical research accumulation is forward-only unless a future separately governed PIT-safe dataset is explicitly approved.

---

# 12. Research History freeze

Research history is a separate domain from the Crypto execution ledger.

Initial forward-only history responsibilities:

- Taiwan monthly revenue release history
- Taiwan Quote + institutional-session history
- future Research Tracking snapshots
- model / policy version references

Rules:

- no backfill by default;
- same period / session exact duplicate may be idempotent;
- conflicting rewrite is rejected;
- older period arriving after newer canonical history is rejected unless a separately approved PIT-safe correction protocol exists;
- cross-instrument contamination is rejected;
- research history never changes Crypto NAV, fills or ledger events.

---

# 13. Research / Execution boundary freeze

```text
GLOBAL / REGIONAL / EARLY TREND / EQUITY RESEARCH
                    │
                    │ READ / CONTEXT ONLY
                    ▼
─────────────────────────────────────────────
                    ▲
                    │ strict read adapter
                    │
CRYPTO CONTROL EXECUTION
A/B/C/D → Risk → Pending Intent → Legal Open → Paper Fill → Ledger
```

Forbidden paths:

- Research → create Crypto intent
- Early Trend → create fill
- News → create position
- Equity Research Tracking → modify NAV
- UI → edit ledger truth
- Shadow → auto-promote Control
- Stock Research → stock order API

---

# 14. Crypto execution freeze

Authoritative sequence:

```text
Universe
→ Candidate
→ WATCH
→ ARMED
→ QUALIFIED / EXECUTABLE
→ PENDING_INTENT
→ Revalidation
→ Future Legal 1H Open
→ PAPER OPEN
→ Position Management
→ EXIT / CANCEL
→ Ledger
→ Trading Results
```

Non-negotiable safety:

- `PAPER_ONLY=true`
- `REAL_ORDER_LOCK=true`
- No Backfill
- Fully Closed Bar
- Portfolio planned open risk <= 1.50% NAV
- canonical persistent ledger
- no private exchange key in frontend
- no real-money order path
- Control / Shadow separation

---

# 15. Positions / Tracking freeze

## 15.1 Crypto

Execution states may include:

- Pending
- Open
- Partial
- Managed / Trailing
- Exited
- Cancelled

These are Paper execution states.

## 15.2 Equities

Research Tracking states:

- Watch
- Early
- Accumulating
- Confirming
- Ready
- Tracking
- Invalidated

These are not positions and do not contribute to Crypto trade count, NAV or Win Rate.

---

# 16. Results freeze

Two independent domains.

## Crypto Trading Performance

May include:

- sample count
- Win Rate
- Net P&L
- Net R
- Profit Factor
- Expectancy
- Max Drawdown
- fees / funding
- MFE / MAE / Capture

## Equity Research Performance

May include:

- +1D
- +5D
- +20D
- maximum favorable move
- maximum adverse move
- time to confirmation
- scenario hit / invalidation
- directional follow-through

Never merge Research Performance into Crypto Trading Performance.

---

# 17. Lab freeze

Frozen lab families:

- Crypto Strategy Lab
- US Research Lab
- Taiwan Research Lab
- Cross-Market Lab

Learning loop:

```text
Observation
→ Hypothesis
→ Shadow Variant
→ Forward Test
→ Compare
→ Review
→ Version Approval
```

No automatic promotion.

---

# 18. Intelligence freeze

Intelligence owns context, not execution.

Frozen modules:

- Global Overview
- Regional Trend
- Capital Rotation
- Cross-Market Impact
- Macro
- Geopolitics
- Economic Calendar
- Earnings / Corporate Events
- Risk Events

Knowledge Graph remains an architecture capability, but relationship evidence must distinguish:

- known relationship
- provider-derived relationship
- statistical correlation
- inferred linkage

No correlation is labeled deterministic causality.

---

# 19. Action Map freeze

Allowed action classes:

1. Primary
2. Secondary
3. Filter
4. Utility

Card limits:

- max 1 Primary
- max 2 Secondary
- filters separated visually
- utility moved to overflow where appropriate

## 19.1 Page-level primary actions

| Context | Primary action |
|---|---|
| Home opportunity | Open Detail |
| Equity Early Opportunity | Open Research Detail |
| Market asset row | Open Asset Workspace |
| Research scenario | Open Scenario Detail |
| Crypto candidate | Open Crypto Strategy / Execution Detail |
| Result row | Open Result Detail |
| Lab variant | Open Comparison |

Equity research has no order action.

---

# 20. Failure-state freeze

## Provider unavailable

- isolate affected provider;
- preserve unrelated domains;
- safe prior snapshot may remain only with correct stale / snapshot status;
- otherwise `UNAVAILABLE`.

## Research engine error

- affected research becomes unavailable / stale;
- Crypto execution remains unaffected.

## Crypto execution error

- existing execution safety remains authoritative;
- UI never reconstructs fills or positions independently.

## Ledger integrity error

- critical health state;
- frontend calculations cannot replace ledger truth.

---

# 21. System Health freeze

Health is domain-specific.

Frozen groups:

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

Each health object owns:

- status
- last successful update
- freshness
- provider / subsystem
- degradation reason

One failed provider cannot mark unrelated domains unhealthy.

---

# 22. Build sequence freeze

The implementation order remains:

```text
P0  Architecture Freeze
P1  Market Core + Canonical Data + Provider / History Foundation
P2  Global Intelligence + Early Trend + US/TW Research Engines
P3  Crypto Execution V2 Read-Only Bridge
P4  Product / Unified UI
P5  Results / Research Tracking / Lab Validation
P6  Staging Validation
P7  Explicit Production Release Decision
```

This simplified phase naming does not change the detailed Phase 0–12 sequence in the architecture specification; it groups them into execution gates for project management.

---

# 23. Go / No-Go gates

## P0 — Architecture Gate

GO only if all are true:

- [x] Product role split defined.
- [x] Seven-region scope defined.
- [x] Functional Tree defined.
- [x] Sitemap defined.
- [x] Page responsibilities defined.
- [x] Home hierarchy defined.
- [x] Asset Workspace contract defined.
- [x] Action Map defined.
- [x] Research / Execution boundary defined.
- [x] Results domains separated.
- [x] Data Truth contract defined.
- [x] Build sequence defined.
- [x] Production gate explicitly separate.

**P0 decision: GO TO P1, subject to CI branch-scope safety.**

## P1 — Data Foundation Gate

Required before P2 is considered complete:

- canonical identity stable;
- Source Catalog enforced;
- point-in-time timing enforced;
- `UNAVAILABLE` behavior tested;
- research history forward-safe;
- no provider exposes execution write;
- supported Market Clock behavior tested.

## P2 — Research / Intelligence Gate

Required before product UI is considered authoritative:

- Regional Bias evidence + confidence;
- Early Trend contradictions + invalidation;
- US Research read model;
- Taiwan Research read model;
- scenario conditionality;
- research storage / model versions;
- no research-to-execution write path.

## P3 — Crypto Bridge Gate

Required before Crypto data is shown through v12 as authoritative execution state:

- read-only adapter only;
- PAPER_ONLY preserved;
- REAL_ORDER_LOCK preserved;
- no Backfill regression;
- ledger parity;
- Pending / legal-open parity.

## P4 — UI Gate

Required before staging UX acceptance:

- Home three markets together;
- seven regions visible;
- Equity Research clearly distinct from Crypto execution;
- mobile daily navigation fixed;
- `UNAVAILABLE` visible;
- no equity order controls;
- source / timestamp/status available at detail level.

## P5 — Results / Lab Gate

- Trading vs Research Results visually and numerically separated;
- sample insufficiency states preserved;
- Shadow cannot auto-promote;
- stored output references model / policy version.

## P6 — Staging Gate

- isolated staging / preview only;
- GET-only read API where applicable;
- Production runtime not proxied;
- branch scope gate green;
- full regression green;
- responsive validation complete;
- provider degradation behavior tested.

## P7 — Production Gate

Production migration requires a separate explicit user approval after P6.

P0/P1/P2 approval never implies Production release.

---

# 24. Architecture Change Control

Any proposal that changes a frozen item must be classified before implementation.

## Class A — In-scope feature detail

Does not change architecture.

Examples:

- add another metric inside an existing Research module;
- improve copy / layout within an existing page responsibility;
- add a new provider that conforms to the current Source Catalog / Canonical Data Contract;
- add a new evidence builder under an existing Early Trend family.

Action: may proceed through normal implementation + tests.

## Class B — Architecture revision

Changes responsibility, boundary or frozen vocabulary.

Examples:

- add automated US/TW execution;
- merge Research and Results pages;
- change the primary navigation;
- change seven-region scope;
- allow Early Trend to directly authorize Crypto execution;
- merge research storage into Crypto ledger;
- alter canonical Data Truth status semantics.

Action: stop implementation, revise architecture specification, approve revision, then resume.

## Class C — Production release

Any change to:

- `main`
- Railway Production root
- Production Runtime routing
- Production execution files
- Production ledger semantics

Action: requires separate explicit Production approval after staging validation.

---

# 25. P0 freeze outcome

FOXYYA v12 now has a single fixed product spine:

```text
Global Intelligence
        ↓
Early Trend Intelligence
        ↓
Market / Asset Research
        ↓
Equity: Human Decision
Crypto: Existing Forward Paper Execution
        ↓
Tracking / Positions
        ↓
Trading Results / Research Results
        ↓
Lab / Versioned Learning
```

All further implementation must map to this spine.

**P0 Architecture Freeze: COMPLETE / FROZEN FOR IMPLEMENTATION**

**Production release authorized: NO**
