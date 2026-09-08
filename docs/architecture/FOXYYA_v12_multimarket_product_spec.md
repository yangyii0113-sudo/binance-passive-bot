# FOXYYA v12 Multi-Market Product Specification

**Status:** Architecture Freeze Candidate v1.0  
**Branch:** `v12-multimarket-architecture`  
**Production impact:** None. `main` / Railway Production remain unchanged until an explicit release approval.  

## 1. Product definition

FOXYYA v12 is a **three-market Capital Intelligence platform** designed to let one user view Crypto, US Equities and Taiwan Equities in one coherent workspace while preserving different decision models for each market.

### Market roles

| Market | Primary role | Execution mode |
|---|---|---|
| Crypto | Market intelligence + A/B/C/D strategy automation + execution review | Existing 24/7 Forward Paper only |
| US Equities | Trend, momentum, earnings, expectations, flow and scenario research | Human decision support; no automated execution in v12 phase 1 |
| Taiwan Equities | Trend, momentum, fundamentals, institutional flow, sector rotation and scenario research | Human decision support; no automated execution in v12 phase 1 |

The platform must never present US/TW research as if it were an automated trading signal or a completed paper fill.

## 2. Non-negotiable safety boundaries

The Crypto execution core keeps the v11.2 production constitution:

- `PAPER_ONLY=true`
- `REAL_ORDER_LOCK=true`
- No private exchange credentials in the frontend
- No signed order endpoints
- No retroactive fills / No Backfill
- Qualification uses fully closed candles
- Portfolio planned open risk remains `<= 1.50% NAV`
- Canonical NAV comes from the persistent ledger, never from editable frontend fields
- Existing A/B/C/D control strategies are not silently modified by UI work
- Control and Shadow research remain separated
- Production deployment requires an explicit release approval

## 3. Primary information architecture

The primary navigation is user-decision oriented rather than engineering-module oriented.

1. **Home** — what is happening today?
2. **Markets** — which assets are moving?
3. **Strategies** — which Crypto strategies / stock research opportunities deserve attention?
4. **Positions** — what is currently Pending or Open in Crypto Forward Paper?
5. **Results** — how have completed trades performed?
6. **Strategy Lab** — how do strategies or research hypotheses perform historically / in Shadow research?

Auxiliary destinations:

- Global Intelligence
- Economic Calendar
- Search
- Notifications
- System Health
- Settings

### Mobile primary navigation

`Home | Markets | Strategies | Positions | Results`

`Strategy Lab` and auxiliary destinations live under `More` on mobile.

### Desktop primary navigation

- Home
- Markets
- Strategies
- Positions
- Results
- Strategy Lab
- Global Intelligence
- Calendar
- Notifications
- System
- Settings

## 4. Global market selector

A persistent market context selector appears near the FOXYYA brand:

`All Markets | Crypto | US Stocks | Taiwan Stocks`

Rules:

- `All Markets` is the default Home context.
- Market context changes content, not the overall navigation architecture.
- The platform must not create separate duplicate page trees such as Crypto Markets / US Markets / TW Markets.
- The same component language is reused, while market-specific data modules remain separate.

## 5. Home page

Home answers only four high-value questions:

1. What is the global market state?
2. Which assets are moving?
3. Which strategy / research opportunities deserve attention?
4. Which global events matter today?

### 5.1 Three-market pulse

Three compact cards are visible together.

#### Crypto Pulse

- BTC
- ETH
- Crypto Regime
- Breadth
- 24h volume state
- Funding / crowding state
- Active Qualified / Pending / Open count

#### US Pulse

- S&P 500
- Nasdaq
- VIX
- US 10Y yield
- Breadth
- Sector rotation
- Earnings focus count

#### Taiwan Pulse

- TAIEX
- TPEx
- Market turnover
- Advancers / decliners
- Foreign institutional flow
- Investment trust flow
- Sector rotation

Each pulse card has exactly one primary action: `View market`.

### 5.2 Market leaderboard

Tabs:

`Popular | Gainers | Losers | Volume | Favorites`

Each row shows only:

- Asset identity / logo
- Symbol / name
- Last price
- Change %
- Secondary liquidity / turnover text

Selecting a row opens Asset Workspace.

### 5.3 Opportunity section

#### Crypto

Shows strategy state, not generic price ranking:

- Symbol
- LONG / SHORT
- A/B/C/D family
- Rank / score
- Regime
- State: WATCH / ARMED / QUALIFIED / PENDING / OPEN

#### US / TW

Shows Research Read rather than auto-trade state:

- Symbol
- Trend
- Momentum
- Fundamental / earnings context
- Expectations
- Flow
- Risk

### 5.4 Global Intelligence

Tabs:

`Top Stories | Economy | Geopolitics | Policy | Crypto`

Home displays 3–5 high-importance events only.

Each event follows the same structure:

- What happened
- Why it matters
- Related assets / markets
- Next observation time
- Source
- Timestamp

The detailed page may include scenario analysis, but not an unconditional price prediction.

## 6. Markets page

Purpose: **discover assets**, not authorize a trade.

Shared filters:

- All
- Popular
- Gainers
- Losers
- Volume / Turnover
- Favorites

Market-specific columns are allowed.

### Crypto columns

- Price
- 24h %
- Volume
- Funding
- Open Interest
- Daily trend
- RS/RW
- Strategy state

### US columns

- Price
- Daily %
- Volume / relative volume
- Sector
- Trend
- Relative strength
- Earnings timing
- Research state

### Taiwan columns

- Price
- Daily %
- Turnover
- Sector
- Trend
- Relative strength
- Foreign / investment trust flow
- Research state

## 7. Asset Workspace

Every asset, regardless of market, opens the same workspace shell:

`Overview | Chart | Analysis | Market Data | News | History`

The shell is shared. Data modules are market-specific.

### 7.1 Overview

Common:

- Price
- Trend
- Momentum
- Relative strength
- Volume / turnover
- Market context
- Data confidence

Crypto adds:

- Daily / 4H / 1H context
- A/B/C/D state
- Funding
- OI
- Crowding

US adds:

- Earnings date
- Revenue / EPS expectations
- Guidance context
- Analyst revision context
- Sector strength
- Institutional / ETF context when available

Taiwan adds:

- Monthly revenue MoM / YoY
- EPS / margin context
- Foreign / investment trust / dealer flow
- Margin financing / short interest context when available
- Sector rotation

### 7.2 Chart

Shared chart experience with market-appropriate session calendars.

Crypto primary strategy timeframes remain:

`Daily -> 4H -> 1H`

Overlays may include:

- Structure
- Break
- Retest
- Entry
- Stop
- Partial TP
- Trail
- Volume

The chart must not create synthetic values for unavailable data.

### 7.3 Analysis

#### Crypto

A/B/C/D state with auditable conditions and execution state.

#### US / TW six-dimension research model

1. Trend
2. Momentum
3. Fundamental
4. Expectation
5. Flow
6. Risk

The stock model produces a **Research Read**, not a buy/sell command.

### 7.4 Market Data

Crypto:

- Funding
- OI
- Long/Short ratio
- Mark price
- Crowding

US:

- Relative volume
- Market cap
- Sector / industry
- Beta / volatility context
- Earnings data
- Options / IV only when a verified provider is available

Taiwan:

- Turnover
- Institutional flow
- Margin financing
- Short interest / securities lending when available
- Monthly revenue
- Sector / industry

## 8. Price Scenario model for US / TW research

FOXYYA must not display a single unconditional AI target.

Research price output is scenario-based:

- **Bull Case** — trigger conditions + reference zone
- **Base Case** — consolidation / continuation conditions + reference zone
- **Bear Case** — invalidation conditions + reference zone

Each scenario must contain:

- Trigger condition
- Structural support / resistance
- Volatility context
- Catalyst / event risk
- Timestamp
- Source / calculation provenance

## 9. Strategies page

### Crypto

Filters:

`All | A | B | C | D`

States:

`WATCH | ARMED | QUALIFIED | PENDING | OPEN`

The platform must preserve:

`Ranking != Setup != Qualified != Fill`

### US / TW

The Strategies page becomes a Research Opportunities view using:

- Trend continuation
- Structure pullback
- Breakout
- Compression
- Relative strength
- Earnings / fundamental catalyst overlays when applicable

No stock research state is mapped to Crypto `PENDING` or `OPEN` unless a future separate paper engine is explicitly implemented.

## 10. Signal Detail / Research Detail

### Crypto Signal Detail

- Symbol
- Side
- Strategy family
- Regime
- Rank / score
- Daily context
- 4H context
- 1H confirmation
- Entry plan
- Structure stop
- Risk
- Cost estimate
- Execution state
- Rejection / cancellation reason
- Event timeline

### US / TW Research Detail

- Trend
- Momentum
- Fundamental
- Expectations
- Flow
- Risk
- Price scenarios
- Upcoming catalysts
- Sources

## 11. Positions

Positions is a **Crypto Forward Paper execution page** in v12 phase 1.

Tabs:

`Open | Pending | Cancelled`

Open Position Card:

- Symbol / side / strategy
- Entry
- Mark
- Stop
- Floating P&L
- Planned risk
- Current R
- Partial / trail state
- Funding state

Pending Card:

- Intended future legal open
- Revalidation state
- Structure
- ATR / gap
- Liquidity
- Regime
- Correlation
- Portfolio risk

US/TW do not fabricate positions in phase 1.

## 12. Results

Results is independent from Home and Positions.

Time filters:

`Today | 7D | 30D | All`

KPIs:

- Closed trades
- Sample count
- Win rate
- Net P&L
- Net R
- Profit Factor
- Expectancy
- Average R
- Max Drawdown
- Fees
- Funding
- MFE
- MAE
- Capture Ratio

If the valid completed sample count is below 20, display `Sample Insufficient` next to performance interpretation.

Segment filters:

- Strategy A/B/C/D
- LONG / SHORT
- Regime
- Period

A single Trade Detail provides:

- Original Signal
- Intent
- Fill
- Stop
- Partial / trail
- Funding
- Exit
- Net R / P&L
- MFE / MAE / Capture

Primary actions are limited to:

- `View chart`
- `View strategy conditions`
- `View event timeline`

## 13. Strategy Lab

Strategy Lab is explicitly labeled `Research Only`.

Tabs:

- Backtest
- Strategy Compare
- Shadow Research
- Version Compare

Crypto Control and Shadow results must remain separated.

US / TW Strategy Lab supports research and historical comparison without implying automatic execution.

## 14. Global Intelligence and calendar

### Global Intelligence

Cross-market relationship examples:

- US yields -> Nasdaq / growth / BTC
- DXY -> risk assets
- Nvidia / semiconductor earnings -> US semiconductor chain -> Taiwan semiconductor / AI supply chain
- Oil / geopolitical risk -> inflation / rates / risk sentiment

Outputs must distinguish:

- Published fact
- Market expectation
- FOXYYA scenario analysis

### Economic Calendar

Filters:

`Today | Tomorrow | This Week`

Fields:

- Time in Asia/Taipei
- Country
- Event
- Importance
- Previous
- Forecast
- Actual
- Related assets

## 15. Morning / Evening Brief

### Morning Brief

- Overnight US market
- Crypto overnight state
- Macro: DXY / yields / gold / oil when available
- Taiwan market outlook context
- Today’s major events
- Watchlist

### Evening Brief

- Taiwan close
- US pre-market context
- Earnings tonight
- Crypto strategy state
- Major events / risks

Briefs summarize existing verified data; they do not create unsupported predictions.

## 16. Notifications

Notify only material events:

### Market

- CPI / NFP / FOMC / material policy
- Major geopolitical shock
- Material earnings / guidance event for followed assets

### Crypto execution

- New Paper Entry
- Partial Exit
- Full Exit
- Risk Limit
- Critical Execution Error
- Ledger Integrity Error
- Material Strategy Health Change

Do not notify normal scans, normal rejects or heartbeat cycles.

## 17. System Health

Four first-class health states:

- Frontend Health
- Market Data Health
- Paper Engine Health
- Ledger Health

Every data value follows the truth chain:

`Value -> Timestamp -> Source -> Confidence`

Confidence values:

`LIVE | DELAYED | SNAPSHOT | STALE | UNAVAILABLE`

## 18. Button system

Every content card may have:

- maximum 1 Primary Action
- maximum 2 Secondary Actions
- filters are visually separate from actions
- utility actions live in overflow or context menus when possible

Button classes:

1. Primary — advance to the main next step
2. Secondary — inspect supporting detail
3. Filter — modify visible data
4. Utility — favorite, export, reminder, settings

Avoid simultaneous action clusters such as Start / Execute / Load / Advance / Refresh / Read / View / Analyze on the same card.

## 19. Data architecture boundary

The frontend consumes normalized domain objects rather than provider-specific payloads.

Required domains:

- `market_pulse`
- `market_rankings`
- `asset_snapshot`
- `asset_chart`
- `asset_research`
- `global_intelligence`
- `economic_calendar`
- `crypto_execution`
- `crypto_positions`
- `results`
- `strategy_lab`
- `system_health`

Provider adapters are responsible for mapping raw external data into these normalized contracts.

## 20. Release policy

Development sequence:

1. Architecture / contract freeze
2. Static low-fidelity shell
3. Responsive navigation and page hierarchy
4. Crypto runtime adapter parity
5. US / TW research adapters
6. Global Intelligence
7. Results / Strategy Lab
8. Integration tests
9. Staging validation
10. Explicit production release approval

No step automatically updates Railway Production.