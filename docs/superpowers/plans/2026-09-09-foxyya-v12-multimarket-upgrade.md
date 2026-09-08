# FOXYYA v12 Multi-Market Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a non-production FOXYYA v12 preview that presents Crypto, US Stocks and Taiwan Stocks in one coherent decision workflow while preserving the existing Crypto Forward Paper execution core unchanged.

**Architecture:** Add a new modular `v12/` frontend beside the legacy production UI. Normalize all visible information into market-agnostic view contracts, then plug market-specific Crypto / US / TW modules into shared pages. The production root remains unchanged until staging passes and the user explicitly approves release.

**Tech Stack:** Vanilla HTML/CSS/JavaScript ES modules, Node built-in test runner, Python `unittest`, existing Python `ThreadingHTTPServer`, existing FOXYYA Runtime API / SQLite ledger.

**Spec:** `docs/architecture/FOXYYA_v12_multimarket_product_spec.md`

## Global Constraints

- `PAPER_ONLY=true` remains mandatory.
- `REAL_ORDER_LOCK=true` remains mandatory.
- No private exchange credentials or signed order endpoints.
- No Backfill.
- Crypto qualification uses fully closed candles.
- Portfolio planned open risk remains `<= 1.50% NAV`.
- Existing A/B/C/D Control strategy rules are not modified by this UI program.
- US / TW phase 1 is human research support only; no automated stock execution.
- Missing data renders `UNAVAILABLE`; delayed data must not render as `LIVE`.
- Every visible data value must expose timestamp, source and confidence metadata at detail level.
- Production `/` remains the current v11.2 UI until explicit release approval.

---

### Task 1: Freeze v12 view contracts and safety invariants

**Files:**
- Create: `v12/data/contracts.js`
- Create: `v12/data/validate.js`
- Create: `tests/v12_contracts.test.cjs`
- Create: `tests/test_v12_safety.py`

**Interfaces:**
- Produces: `CONFIDENCE_STATES`, `MARKET_IDS`, `validateMarketPulse(value)`, `validateAssetSnapshot(value)`, `validateResearchRead(value)`, `validateExecutionSnapshot(value)`.
- Consumes: Existing `/api/runtime/status` and `/api/runtime/snapshot` payloads only for Crypto execution adaptation.

- [ ] **Step 1: Write failing JavaScript contract tests**

Create tests that require:

```js
assert.deepEqual(MARKET_IDS, ['ALL','CRYPTO','US','TW']);
assert.equal(validateMarketPulse(validPulse).ok, true);
assert.equal(validateMarketPulse({...validPulse, confidence:'MAGIC'}).ok, false);
assert.equal(validateResearchRead({...validRead, market:'US', executionState:'OPEN'}).ok, false);
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --test tests/v12_contracts.test.cjs
```

Expected: FAIL because `v12/data/contracts.js` and validators do not exist.

- [ ] **Step 3: Implement normalized contracts**

Define exact shapes for:

```js
MarketPulse = {
  market, label, asOf, source, confidence,
  regime, primary, secondary, breadth, volumeState, riskState
}

AssetSnapshot = {
  market, symbol, name, price, changePct,
  asOf, source, confidence, trend, momentum, relativeStrength,
  liquidity, researchState
}

ResearchRead = {
  market, symbol, asOf, source, confidence,
  dimensions: {trend, momentum, fundamental, expectation, flow, risk},
  scenarios: {bull, base, bear}
}

ExecutionSnapshot = {
  paperOnly, realOrderLock, strategyVersion,
  qualified, pending, open, ledgerIntegrity, asOf
}
```

Validation must reject stock `OPEN` / `PENDING` execution states in phase 1.

- [ ] **Step 4: Add Python safety regression test**

`tests/test_v12_safety.py` must assert `service.py` still requires `real_order_lock` and reports `paper_only=True`, `real_order_lock=True`.

- [ ] **Step 5: Run tests**

```bash
node --test tests/v12_contracts.test.cjs
python -m unittest tests.test_v12_safety -v
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add v12/data tests/v12_contracts.test.cjs tests/test_v12_safety.py
git commit -m "feat(v12): define multi-market view contracts"
```

---

### Task 2: Build the v12 application shell and navigation

**Files:**
- Create: `v12/index.html`
- Create: `v12/styles.css`
- Create: `v12/app.js`
- Create: `v12/router.js`
- Create: `tests/v12_router.test.cjs`

**Interfaces:**
- Consumes: `MARKET_IDS` from Task 1.
- Produces: `navigate(route)`, `setMarketContext(market)`, `getRoute()`, `getMarketContext()`.

- [ ] **Step 1: Write router tests**

Test these canonical routes:

```text
/home
/markets
/strategies
/positions
/results
/lab
/intelligence
/calendar
/system
```

Unknown routes must normalize to `/home`.

- [ ] **Step 2: Run failing test**

```bash
node --test tests/v12_router.test.cjs
```

- [ ] **Step 3: Implement shell**

Desktop navigation:

```text
Home
Markets
Strategies
Positions
Results
Strategy Lab
---
Global Intelligence
Calendar
Notifications
---
System
Settings
```

Mobile bottom navigation:

```text
Home | Markets | Strategies | Positions | Results
```

Mobile `More` contains Strategy Lab and auxiliary destinations.

- [ ] **Step 4: Implement persistent market selector**

Selector values:

```text
All Markets | Crypto | US Stocks | Taiwan Stocks
```

Save only UI preference to `localStorage` under `foxyya.v12.marketContext`; do not store trade state there.

- [ ] **Step 5: Run tests and syntax checks**

```bash
node --test tests/v12_router.test.cjs
node --check v12/app.js
node --check v12/router.js
```

- [ ] **Step 6: Commit**

```bash
git add v12 tests/v12_router.test.cjs
git commit -m "feat(v12): add multi-market application shell"
```

---

### Task 3: Implement Home as a three-market decision dashboard

**Files:**
- Create: `v12/pages/home.js`
- Create: `v12/components/market-pulse.js`
- Create: `v12/components/leaderboard.js`
- Create: `v12/components/opportunity-list.js`
- Create: `v12/components/intelligence-list.js`
- Create: `v12/data/fixtures/home.json`
- Create: `tests/v12_home.test.cjs`

**Interfaces:**
- Consumes: normalized `MarketPulse`, `AssetSnapshot`, `ResearchRead`, `ExecutionSnapshot`.
- Produces: `renderHome(model)`.

- [ ] **Step 1: Write Home content tests**

Assert Home renders exactly three pulse cards in `ALL` context and does not render full trade-performance tables or full K-line charts.

- [ ] **Step 2: Run failing test**

```bash
node --test tests/v12_home.test.cjs
```

- [ ] **Step 3: Implement three-market pulse**

Crypto pulse fields:

- BTC / ETH
- Regime
- Breadth
- Funding / crowding
- Qualified / Pending / Open counts

US pulse fields:

- S&P 500
- Nasdaq
- VIX
- US 10Y
- Breadth
- Sector rotation
- Earnings focus

TW pulse fields:

- TAIEX
- TPEx
- Turnover
- Advancers / decliners
- Foreign flow
- Investment trust flow
- Sector rotation

Each card has one primary action: `View market`.

- [ ] **Step 4: Implement leaderboard and opportunity sections**

Leaderboard tabs:

```text
Popular | Gainers | Losers | Volume | Favorites
```

Crypto opportunities show A/B/C/D execution state. US/TW opportunities show six-dimension Research Read summary and never display `OPEN` or `PENDING`.

- [ ] **Step 5: Implement Global Intelligence summary**

Show maximum five events and one `View all intelligence` action.

- [ ] **Step 6: Test and commit**

```bash
node --test tests/v12_home.test.cjs
git add v12/pages v12/components v12/data/fixtures tests/v12_home.test.cjs
git commit -m "feat(v12): build three-market home dashboard"
```

---

### Task 4: Build Markets and shared Asset Workspace

**Files:**
- Create: `v12/pages/markets.js`
- Create: `v12/pages/asset-workspace.js`
- Create: `v12/components/asset-table.js`
- Create: `v12/components/asset-header.js`
- Create: `v12/components/research-dimensions.js`
- Create: `v12/components/price-scenarios.js`
- Create: `tests/v12_asset_workspace.test.cjs`

**Interfaces:**
- Produces: `renderMarkets(model, marketContext)` and `renderAssetWorkspace(model)`.
- Asset Workspace tabs: `Overview | Chart | Analysis | Market Data | News | History`.

- [ ] **Step 1: Write workspace tests**

Verify:

- Crypto Market Data contains Funding / OI / Long-Short / Mark / Crowding.
- US Market Data does not contain Funding.
- TW Market Data does not contain Funding.
- US/TW Analysis renders six research dimensions.
- Every workspace renders source, timestamp and confidence metadata.

- [ ] **Step 2: Run failing test**

```bash
node --test tests/v12_asset_workspace.test.cjs
```

- [ ] **Step 3: Implement shared shell and market-specific modules**

US/TW six dimensions:

```text
Trend
Momentum
Fundamental
Expectation
Flow
Risk
```

- [ ] **Step 4: Implement scenario cards**

Each Bull / Base / Bear scenario requires:

- trigger condition
- reference zone
- support / resistance
- volatility context
- catalyst
- source timestamp

No unconditional target language is allowed.

- [ ] **Step 5: Test and commit**

```bash
node --test tests/v12_asset_workspace.test.cjs
git add v12/pages v12/components tests/v12_asset_workspace.test.cjs
git commit -m "feat(v12): add shared asset workspace"
```

---

### Task 5: Adapt existing Crypto runtime without changing execution behavior

**Files:**
- Create: `v12/data/adapters/crypto-runtime.js`
- Create: `v12/pages/strategies.js`
- Create: `v12/pages/positions.js`
- Create: `v12/pages/signal-detail.js`
- Create: `tests/v12_crypto_adapter.test.cjs`
- Modify: `service.py`

**Interfaces:**
- Consumes: `/api/runtime/status`, `/api/runtime/snapshot`, `/api/runtime/events`.
- Produces: normalized Crypto market pulse, strategy opportunities, positions and event timelines.

- [ ] **Step 1: Write adapter contract tests using captured fixture payloads**

Fixtures must include:

- Qualified
- Pending Intent
- Open position
- Cancelled intent
- Ledger integrity true

Verify `Ranking != Setup != Qualified != Fill` remains visible in state mapping.

- [ ] **Step 2: Run failing test**

```bash
node --test tests/v12_crypto_adapter.test.cjs
```

- [ ] **Step 3: Implement read-only adapter**

The adapter must never POST, PATCH or DELETE execution state.

State mapping:

```text
WATCH -> WATCH
ARMED -> ARMED
QUALIFIED/EXECUTABLE -> QUALIFIED
PENDING_INTENT -> PENDING
OPEN -> OPEN
EXITED -> EXITED
CANCELLED -> CANCELLED
```

- [ ] **Step 4: Add non-production preview route**

Modify `service.py` so:

- `/` remains existing production UI
- `/v12-preview/` serves `v12/index.html`
- `/v12-preview/<asset>` serves static v12 CSS/JS assets only

No execution API behavior changes.

- [ ] **Step 5: Run safety and adapter tests**

```bash
node --test tests/v12_crypto_adapter.test.cjs
python -m unittest tests.test_v12_safety -v
python -m py_compile service.py
```

- [ ] **Step 6: Commit**

```bash
git add v12/data/adapters v12/pages service.py tests
git commit -m "feat(v12): bridge crypto runtime into preview UI"
```

---

### Task 6: Build US / TW research adapters behind explicit provider boundaries

**Files:**
- Create: `v12/data/adapters/us-research.js`
- Create: `v12/data/adapters/tw-research.js`
- Create: `v12/data/providers/provider-contract.js`
- Create: `v12/data/fixtures/us-research.json`
- Create: `v12/data/fixtures/tw-research.json`
- Create: `tests/v12_stock_research.test.cjs`

**Interfaces:**
- Produces `AssetSnapshot` and `ResearchRead` only.
- Explicitly does not produce `ExecutionSnapshot`, `PENDING`, `OPEN` or order objects.

- [ ] **Step 1: Write stock research safety tests**

Verify any provider payload attempting to set stock execution state is rejected.

- [ ] **Step 2: Run failing test**

```bash
node --test tests/v12_stock_research.test.cjs
```

- [ ] **Step 3: Implement provider contract**

Required normalized provider methods:

```js
getQuote(symbol)
getDailyHistory(symbol, range)
getFundamentals(symbol)
getExpectations(symbol)
getFlow(symbol)
getEvents(symbol)
```

Provider responses must include `asOf`, `source`, `confidence`.

- [ ] **Step 4: Implement fixture-backed US / TW adapters**

US adapter maps trend, momentum, earnings/fundamental, expectation, flow and risk.

TW adapter maps trend, momentum, monthly revenue/fundamental, expectation, institutional flow, sector and risk.

These fixtures are development-only and must render `SNAPSHOT`, never `LIVE`.

- [ ] **Step 5: Test and commit**

```bash
node --test tests/v12_stock_research.test.cjs
git add v12/data tests/v12_stock_research.test.cjs
git commit -m "feat(v12): define US and TW research adapter boundary"
```

---

### Task 7: Normalize Global Intelligence, calendar and briefs

**Files:**
- Create: `v12/data/adapters/intelligence.js`
- Create: `v12/pages/intelligence.js`
- Create: `v12/pages/calendar.js`
- Create: `v12/components/morning-brief.js`
- Create: `v12/components/evening-brief.js`
- Create: `tests/v12_intelligence.test.cjs`

**Interfaces:**
- Consumes existing `/api/intel/news` and `/api/intel/calendar` plus normalized provider events when available.
- Produces facts, expectations and scenario analysis as separate fields.

- [ ] **Step 1: Write truth-separation tests**

Assert the model rejects an event that places scenario text into the published-fact field without a source.

- [ ] **Step 2: Implement normalized event schema**

```js
{
  id, title, category, importance, publishedAt,
  eventAt, sources, relatedMarkets, relatedAssets,
  fact, expectation, scenarios, confidence
}
```

- [ ] **Step 3: Implement Morning / Evening Brief components**

Morning order:

```text
US overnight -> Crypto overnight -> Macro -> Taiwan context -> Events -> Watchlist
```

Evening order:

```text
Taiwan close -> US preview -> Earnings -> Crypto strategy state -> Events
```

- [ ] **Step 4: Test and commit**

```bash
node --test tests/v12_intelligence.test.cjs
git add v12/data/adapters v12/pages v12/components tests/v12_intelligence.test.cjs
git commit -m "feat(v12): add global intelligence and daily briefs"
```

---

### Task 8: Separate Results from Strategy Lab

**Files:**
- Create: `v12/pages/results.js`
- Create: `v12/pages/trade-detail.js`
- Create: `v12/pages/strategy-lab.js`
- Create: `v12/components/performance-kpis.js`
- Create: `tests/v12_results.test.cjs`

**Interfaces:**
- Results consumes canonical completed Crypto Forward Paper trades.
- Strategy Lab consumes research / backtest / shadow datasets and must label them `Research Only`.

- [ ] **Step 1: Write sample-integrity tests**

Verify:

- open trades do not count toward win rate
- partial exits do not count as multiple independent wins
- sample count `<20` renders `Sample Insufficient`
- Strategy Lab research metrics never overwrite Results metrics

- [ ] **Step 2: Implement Results filters**

```text
Today | 7D | 30D | All
A | B | C | D
LONG | SHORT
Regime
```

- [ ] **Step 3: Implement Trade Detail actions**

Exactly three main actions:

- View chart
- View strategy conditions
- View event timeline

- [ ] **Step 4: Implement Strategy Lab shell**

Tabs:

```text
Backtest | Strategy Compare | Shadow Research | Version Compare
```

- [ ] **Step 5: Test and commit**

```bash
node --test tests/v12_results.test.cjs
git add v12/pages v12/components tests/v12_results.test.cjs
git commit -m "feat(v12): separate results and strategy research"
```

---

### Task 9: Responsive design system and button discipline

**Files:**
- Create: `v12/design/tokens.css`
- Create: `v12/design/components.css`
- Modify: `v12/styles.css`
- Create: `tests/v12_ui_rules.test.cjs`

**Interfaces:**
- Defines visual roles: LONG/profit green, SHORT/risk red, warning amber, institutional dark navy/black.

- [ ] **Step 1: Write UI rule tests**

Static DOM fixtures must verify:

- a content card has at most one `.action-primary`
- a content card has at most two `.action-secondary`
- mobile primary navigation has exactly five destinations
- controls intended for touch use a minimum 44px block size token

- [ ] **Step 2: Implement tokens and shared components**

Define:

- spacing scale
- typography scale
- surface / border tokens
- semantic status tokens
- button classes
- table-to-card mobile behavior

- [ ] **Step 3: Run tests and commit**

```bash
node --test tests/v12_ui_rules.test.cjs
git add v12/design v12/styles.css tests/v12_ui_rules.test.cjs
git commit -m "feat(v12): add responsive institutional design system"
```

---

### Task 10: Preview integration gate

**Files:**
- Create: `tests/test_v12_preview.py`
- Create: `docs/architecture/FOXYYA_v12_release_gate.md`
- Modify: `README.md`

**Interfaces:**
- Preview URL: `/v12-preview/`
- Production URL: `/` remains v11.2 until release approval.

- [ ] **Step 1: Add preview server tests**

Verify:

- `/` still serves existing production UI
- `/v12-preview/` serves v12 shell
- `/api/runtime/status` still reports `paper_only=true`
- `/api/runtime/status` still reports `real_order_lock=true`
- `/api/runtime/snapshot` remains readable
- no new stock execution endpoint exists

- [ ] **Step 2: Create release gate document**

Required gate:

```text
[ ] Main production root unchanged during preview
[ ] Desktop navigation passes
[ ] Mobile navigation passes
[ ] Crypto runtime parity passes
[ ] Ledger continuity passes
[ ] No Backfill regression passes
[ ] No duplicate fill regression passes
[ ] US/TW research labeled non-execution
[ ] All missing data shows UNAVAILABLE
[ ] All delayed fixture data shows SNAPSHOT/STALE, never LIVE
[ ] System Health separates Frontend / Market Data / Paper Engine / Ledger
[ ] Explicit user approval received before production root switch
```

- [ ] **Step 3: Run the complete suite**

```bash
node --test tests/v12_*.test.cjs
python -m unittest discover -s tests -p 'test_v12*.py' -v
python -m py_compile service.py runtime_view.py
```

Expected: all PASS.

- [ ] **Step 4: Commit preview-ready state**

```bash
git add tests docs README.md
git commit -m "test(v12): add multi-market preview release gate"
```

---

## Execution order

The first implementation milestone is Tasks 1–5: a working v12 preview shell with full Crypto runtime parity and no production changes.

The second milestone is Tasks 6–7: US/TW research contracts and Global Intelligence.

The third milestone is Tasks 8–10: performance separation, responsive polish and release gating.

## Release rule

Do **not** merge the v12 branch into `main` and do **not** update the Railway production root until the user explicitly approves production release after reviewing the v12 preview.