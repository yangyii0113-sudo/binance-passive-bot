# FOXYYA v12 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v12 multi-market foundation — Market Core, Market Clock, canonical data contracts and Data Quality Gate — without changing Production or the existing Crypto execution engine.

**Architecture:** Add isolated `v12/core` and `v12/data` modules. These modules are pure, provider-agnostic and read-only with respect to the existing Crypto ledger. External providers, UI integration and execution wiring are deliberately deferred until these contracts are stable.

**Tech Stack:** JavaScript/CommonJS compatible modules, Node built-in `node:test`, existing Python runtime untouched.

**Spec:** `docs/superpowers/specs/2026-09-09-foxyya-v12-architecture-design.md`

## Global Constraints

- `PAPER_ONLY=true` remains mandatory.
- `REAL_ORDER_LOCK=true` remains mandatory.
- No Backfill.
- Crypto qualification remains Fully Closed Bar only.
- Portfolio planned open risk remains `<= 1.50% NAV`.
- US/TW/other equity research has no execution write capability.
- Smart Money / Early Trend / News / AI context cannot write to the Crypto Control execution plane.
- No provider-specific payload may become a frontend contract.
- Missing values use `UNAVAILABLE`; delayed/stored values cannot be labeled `LIVE`.
- No Railway Production deployment in this plan.

---

## File structure

- Create `v12/core/market_core.js` — canonical instrument/exchange identity and regional taxonomy.
- Create `v12/core/market_clock.js` — exchange-local session state with explicit calendar confidence.
- Modify `v12/data/contracts.js` — canonical observation/data envelope validation.
- Create `v12/data/quality_gate.js` — freshness/status validation and canonical quality decision.
- Create `v12/core/index.js` — stable export surface for the foundation.
- Create `tests/v12_market_core.test.cjs`.
- Create `tests/v12_market_clock.test.cjs`.
- Create `tests/v12_data_quality.test.cjs`.
- Create `tests/v12_quality_gate.test.cjs`.

---

### Task 1: Market Core identity

**Files:**
- Create: `v12/core/market_core.js`
- Test: `tests/v12_market_core.test.cjs`

**Interfaces:**
- Produces: `PRIMARY_MARKETS`, `REGION_IDS`, `EXCHANGES`, `instrumentId(exchange, symbol)`, `validateInstrument(value)`.

- [ ] **Step 1: Write failing tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../v12/core/market_core.js');

test('primary markets and regional coverage are explicit', () => {
  assert.deepEqual(M.PRIMARY_MARKETS, ['CRYPTO','US','TW']);
  assert.deepEqual(M.REGION_IDS, ['US','TW','CN_HK','JP','KR','EU','CRYPTO']);
});

test('instrument ids are exchange scoped', () => {
  assert.equal(M.instrumentId('TWSE','2330'), 'TWSE:2330');
  assert.equal(M.instrumentId('NASDAQ','NVDA'), 'NASDAQ:NVDA');
  assert.equal(M.instrumentId('BINANCE','BTCUSDT'), 'BINANCE:BTCUSDT');
});

test('instrument validates market identity and currency', () => {
  const result = M.validateInstrument({
    instrumentId:'TWSE:2330', symbol:'2330', exchange:'TWSE', market:'TW',
    region:'TW', currency:'TWD', timezone:'Asia/Taipei', assetType:'EQUITY'
  });
  assert.equal(result.ok, true);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/v12_market_core.test.cjs`
Expected: FAIL because `v12/core/market_core.js` does not exist.

- [ ] **Step 3: Implement minimal Market Core**

```js
const PRIMARY_MARKETS = Object.freeze(['CRYPTO','US','TW']);
const REGION_IDS = Object.freeze(['US','TW','CN_HK','JP','KR','EU','CRYPTO']);
const EXCHANGES = Object.freeze({
  BINANCE:{market:'CRYPTO',region:'CRYPTO',currency:'USDT',timezone:'UTC'},
  NASDAQ:{market:'US',region:'US',currency:'USD',timezone:'America/New_York'},
  NYSE:{market:'US',region:'US',currency:'USD',timezone:'America/New_York'},
  TWSE:{market:'TW',region:'TW',currency:'TWD',timezone:'Asia/Taipei'},
  TPEX:{market:'TW',region:'TW',currency:'TWD',timezone:'Asia/Taipei'},
  KRX:{market:'KR',region:'KR',currency:'KRW',timezone:'Asia/Seoul'},
  TSE:{market:'JP',region:'JP',currency:'JPY',timezone:'Asia/Tokyo'},
  HKEX:{market:'CN_HK',region:'CN_HK',currency:'HKD',timezone:'Asia/Hong_Kong'},
  XETRA:{market:'EU',region:'EU',currency:'EUR',timezone:'Europe/Berlin'}
});
```

Implement strict symbol/exchange validation and require `instrumentId === exchange + ':' + symbol`.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/v12_market_core.test.cjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add v12/core/market_core.js tests/v12_market_core.test.cjs
git commit -m "feat: add v12 market core identity"
```

---

### Task 2: Canonical Data Contract

**Files:**
- Modify: `v12/data/contracts.js`
- Test: `tests/v12_data_quality.test.cjs`

**Interfaces:**
- Consumes: Market Core market/exchange vocabulary.
- Produces: `DATA_STATUSES`, `validateObservation(value)` in addition to existing contract exports.

- [ ] **Step 1: Write failing tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../v12/data/contracts.js');

test('canonical observation carries provenance and timing', () => {
  const value = {
    schemaVersion:'foxyya-observation/1', instrumentId:'NASDAQ:NVDA', market:'US',
    field:'last_price', value:182.4, unit:'USD', currency:'USD',
    observedAt:1000, receivedAt:1010, source:'provider-fixture',
    status:'SNAPSHOT', confidence:0.9
  };
  assert.equal(C.validateObservation(value).ok, true);
});

test('LIVE cannot be accepted when received before observed or provenance is missing', () => {
  const value = {
    schemaVersion:'foxyya-observation/1', instrumentId:'TWSE:2330', market:'TW',
    field:'last_price', value:1000, unit:'TWD', currency:'TWD',
    observedAt:2000, receivedAt:1999, source:'', status:'LIVE', confidence:1
  };
  assert.equal(C.validateObservation(value).ok, false);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/v12_data_quality.test.cjs`
Expected: FAIL because `validateObservation` is not exported.

- [ ] **Step 3: Implement canonical observation validator**

Required fields:

```text
schemaVersion, instrumentId, market, field, value, unit, currency,
observedAt, receivedAt, source, status, confidence
```

Rules:
- `schemaVersion === 'foxyya-observation/1'`.
- `status` in `LIVE|DELAYED|SNAPSHOT|STALE|UNAVAILABLE`.
- `0 <= confidence <= 1`.
- `receivedAt >= observedAt`.
- non-`UNAVAILABLE` observations require non-null `value`.
- every observation requires a non-empty `source`.

- [ ] **Step 4: Run all contract tests**

Run: `node --test tests/v12_contracts.test.cjs tests/v12_data_quality.test.cjs`
Expected: PASS with existing v12 contract behavior unchanged.

- [ ] **Step 5: Commit**

```bash
git add v12/data/contracts.js tests/v12_data_quality.test.cjs
git commit -m "feat: define v12 canonical observation contract"
```

---

### Task 3: Market Clock

**Files:**
- Create: `v12/core/market_clock.js`
- Test: `tests/v12_market_clock.test.cjs`

**Interfaces:**
- Consumes: exchange metadata from `market_core.js`.
- Produces: `sessionState(exchange, epochMs, calendarOverride)`.

- [ ] **Step 1: Write failing tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {sessionState} = require('../v12/core/market_clock.js');

test('crypto is 24/7', () => {
  assert.equal(sessionState('BINANCE', Date.UTC(2026,8,9,0,0)).state, 'OPEN');
});

test('TWSE regular session is recognized in Taipei time', () => {
  const open = Date.UTC(2026,8,9,1,30); // 09:30 Asia/Taipei
  assert.equal(sessionState('TWSE', open).state, 'OPEN');
});

test('explicit holiday override wins over base session', () => {
  const open = Date.UTC(2026,8,9,1,30);
  assert.equal(sessionState('TWSE', open, {closed:true, reason:'HOLIDAY'}).state, 'CLOSED');
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/v12_market_clock.test.cjs`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement exchange session evaluation**

Rules:
- Crypto `BINANCE` is `OPEN` 24/7.
- Equity sessions are evaluated in exchange-local time using `Intl.DateTimeFormat`.
- The base implementation supports regular-session windows only.
- Without an external holiday calendar, return `calendarConfidence:'BASE_SESSION_ONLY'`.
- `calendarOverride.closed === true` returns `CLOSED` with `calendarConfidence:'EXPLICIT_OVERRIDE'`.
- Unknown exchange returns `UNAVAILABLE`, never guessed.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/v12_market_clock.test.cjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add v12/core/market_clock.js tests/v12_market_clock.test.cjs
git commit -m "feat: add provider-independent market clock"
```

---

### Task 4: Data Quality Gate

**Files:**
- Create: `v12/data/quality_gate.js`
- Test: `tests/v12_quality_gate.test.cjs`

**Interfaces:**
- Consumes: canonical observation contract.
- Produces: `assessObservation(observation, nowMs, policy)` returning canonical quality status.

- [ ] **Step 1: Write failing tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../v12/data/quality_gate.js');

const base = {
  schemaVersion:'foxyya-observation/1', instrumentId:'NASDAQ:NVDA', market:'US',
  field:'last_price', value:182.4, unit:'USD', currency:'USD', observedAt:1000,
  receivedAt:1010, source:'fixture', status:'LIVE', confidence:1
};

test('fresh live value stays LIVE', () => {
  assert.equal(Q.assessObservation(base, 1500, {liveMaxAgeMs:1000, staleMaxAgeMs:5000}).status, 'LIVE');
});

test('aged value is downgraded rather than remaining LIVE', () => {
  assert.equal(Q.assessObservation(base, 3000, {liveMaxAgeMs:1000, staleMaxAgeMs:5000}).status, 'DELAYED');
});

test('too-old value becomes STALE', () => {
  assert.equal(Q.assessObservation(base, 7000, {liveMaxAgeMs:1000, staleMaxAgeMs:5000}).status, 'STALE');
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/v12_quality_gate.test.cjs`
Expected: FAIL because `quality_gate.js` does not exist.

- [ ] **Step 3: Implement quality assessment**

Return shape:

```js
{
  ok: true,
  status: 'LIVE',
  freshnessMs: 500,
  confidence: 1,
  reasons: []
}
```

Rules:
- Invalid canonical observations return `ok:false`, status `UNAVAILABLE`.
- A source-declared `UNAVAILABLE` remains `UNAVAILABLE`.
- Age is calculated from `observedAt`, not page-load time or `receivedAt`.
- `LIVE` is downgraded to `DELAYED` after `liveMaxAgeMs`.
- values older than `staleMaxAgeMs` become `STALE`.
- The gate may downgrade status but never upgrade `SNAPSHOT` or `UNAVAILABLE` to `LIVE`.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/v12_quality_gate.test.cjs tests/v12_data_quality.test.cjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add v12/data/quality_gate.js tests/v12_quality_gate.test.cjs
git commit -m "feat: add v12 data quality gate"
```

---

### Task 5: Stable foundation export and regression gate

**Files:**
- Create: `v12/core/index.js`
- Test: existing and all new tests.

**Interfaces:**
- Produces a stable import surface for Phase 2 provider adapters.

- [ ] **Step 1: Create export surface**

```js
module.exports = Object.freeze({
  market: require('./market_core.js'),
  clock: require('./market_clock.js'),
  contracts: require('../data/contracts.js'),
  quality: require('../data/quality_gate.js'),
});
```

- [ ] **Step 2: Run full JavaScript regression suite**

Run: `node --test tests/*.test.cjs`
Expected: all tests PASS.

- [ ] **Step 3: Run existing Python regression suite**

Run: `python -m unittest discover -s tests -p 'test_*.py'`
Expected: all tests PASS; existing Runtime View is unchanged.

- [ ] **Step 4: Verify no Production surface changed**

Run:

```bash
git diff --name-only main...HEAD
```

Expected Phase 1 product changes are restricted to `v12/**`, `tests/v12_*`, and v12 documentation. `service.py`, `runtime_view.py`, `live_ui.html`, `runtime_ui.js`, execution bundles, `railway.toml`, and `Dockerfile` must be unchanged by this plan.

- [ ] **Step 5: Commit**

```bash
git add v12/core/index.js
git commit -m "feat: expose v12 foundation core"
```

---

## Phase 1 acceptance gate

Phase 2 provider work may begin only when all conditions hold:

1. All existing and v12 JavaScript tests pass.
2. Existing Python runtime-view tests pass.
3. No Production/runtime/ledger file changed.
4. US/TW research cannot express Crypto execution states.
5. Market Clock never guesses unknown exchange/holiday state.
6. Data Quality Gate never upgrades stale/snapshot/unavailable data to LIVE.
7. Canonical observations always carry source and timestamps.
8. `main` and Railway Production remain untouched.
