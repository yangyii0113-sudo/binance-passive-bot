# FOXYYA v12 Provider Governance Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish every provider-governance and fail-closed code path that can be completed without new external credentials, exchange licences, Railway deployment capacity, or Production Execution V2 changes.

**Architecture:** Keep market-data provider selection, access control, canonical adapters, runtime loaders, Coverage readiness and Home decision-readiness separated. Provider catalog changes must convert ambiguous `NOT_IMPLEMENTED` / `PROVIDER_DECISION_REQUIRED` states into explicit licensing, credential or entitlement blockers without granting capabilities. Runtime wiring must be zero-request when credentials or entitlements are absent. UI/read-model projection must consume backend truth and never recompute or infer readiness.

**Tech Stack:** Node.js 22 CommonJS, `node:test`, existing FOXYYA v12 provider catalog/read models/staging pipeline, GitHub Actions, Railway Research Staging.

**Spec:** `docs/ai/FOXYYA_NEXT.md` and `docs/ai/FOXYYA_STATE.json` are the current operational specs; market Coverage schema remains `foxyya-market-coverage/1`.

## Global Constraints

- Production Execution V2 must not be modified.
- `PAPER_ONLY=true` and `REAL_ORDER_LOCK=true` remain intact.
- Research Staging remains `RESEARCH_ONLY=true` and `EXECUTION_WRITE=false`.
- No fake data, scraping workaround, inferred licence, invented API key, or entitlement bypass.
- No provider may grant a capability until canonical runtime evidence is actually AVAILABLE.
- Full v12 Node + existing JS + Python + Production safety + isolated container smoke must pass before a new product-code checkpoint is called GREEN.
- Railway live deployment remains externally blocked until workspace deployment capacity is available; code-green checkpoints must not be described as live.
- Existing hourly condition watch owns live deployment acceptance once Railway capacity returns.

---

### Task 1: JP Direction Provider Split

**Files:**
- Create: `tests/v12_jp_provider_resolution.test.cjs`
- Modify: `v12/providers/source_catalog.js`
- Possibly modify stale provider-access tests only if they still reference superseded JP direction assumptions.

**Interfaces:**
- Consumes: `SOURCE_STATUS`, `SOURCE_CATALOG`, `buildMarketCoverage()`.
- Produces: catalog source `tse-market-information` with `INDEX` + `MARKET_BREADTH` and explicit external licensing blockers.

- [ ] **Step 1: Write the failing contract**

```js
const test=require('node:test');
const assert=require('node:assert/strict');
const {SOURCE_STATUS,SOURCE_CATALOG}=require('../v12/providers/source_catalog.js');
const {buildMarketCoverage}=require('../v12/read_model/market_coverage.js');

test('JP direction uses licensed TSE Market Information rather than NOT_IMPLEMENTED',()=>{
  const source=SOURCE_CATALOG.find(x=>x.id==='tse-market-information');
  assert.ok(source);
  assert.equal(source.status,SOURCE_STATUS.LICENSE_REQUIRED);
  assert.ok(source.capabilities.includes('INDEX'));
  assert.ok(source.capabilities.includes('MARKET_BREADTH'));
  assert.equal(source.liveEligible,false);
  assert.equal(source.evidenceRole,'MARKET_CORE');
});
```

Add a Coverage assertion that JP remains `BLOCKED`, `directionReadiness='NOT_READY'`, and both direction blockers become `LICENSE_REQUIRED:tse-market-information` while J-Quants credential/entitlement blockers remain unchanged.

- [ ] **Step 2: Verify RED**

Run full v12 CI. Expected: only new JP provider-resolution expectations fail because `tse-market-information` does not exist and JP direction remains `NOT_IMPLEMENTED`.

- [ ] **Step 3: Implement minimal GREEN**

Add only this catalog entry:

```js
source({
  id:'tse-market-information',
  provider:'Tokyo Stock Exchange Market Information',
  status:SOURCE_STATUS.LICENSE_REQUIRED,
  authority:'LICENSED',
  accessClass:'COMMERCIAL_LICENSE',
  markets:['JP'],
  capabilities:['INDEX','MARKET_BREADTH'],
  serverOnly:true,
  secretRequired:false,
  entitlementRequired:false,
  liveEligible:false,
  latencyClass:'LICENSE_DEFINED',
  evidenceRole:'MARKET_CORE',
  marketScope:'TSE_MARKET_DIRECTION',
  externalDistribution:false
})
```

Do not add a loader or promote readiness.

- [ ] **Step 4: Update only stale tests if necessary**

Replace assertions that assumed JP `INDEX` / `MARKET_BREADTH` had no provider path; do not weaken access control.

- [ ] **Step 5: Verify GREEN and commit**

Require full regression suite and container smoke to pass.

---

### Task 2: KR Provider Contract Audit

**Files:**
- Test: existing `tests/v12_provider_activation.test.cjs`, `tests/v12_market_coverage*.test.cjs`, provider catalog tests.
- Modify production code only if the audit proves a missing blocker mapping.

**Interfaces:**
- Consumes: existing `krx-openapi` source.
- Produces: explicit decision that no new KR provider is required while key + per-service approval/entitlement remain fail-closed.

- [ ] **Step 1: Add or confirm contract assertions**

```js
assert.equal(krx.status,SOURCE_STATUS.KEY_REQUIRED);
assert.equal(krx.secretRequired,true);
assert.equal(krx.entitlementRequired,true);
assert.ok(krx.capabilities.includes('INDEX'));
assert.ok(krx.capabilities.includes('MARKET_STATISTICS'));
```

Coverage must continue to expose `API_KEY_REQUIRED` + `ENTITLEMENT_REQUIRED` for KRX-derived direction capabilities and must not issue requests without both gates.

- [ ] **Step 2: Run targeted and full tests**

If tests already pass, classify this task as `NO_PRODUCTION_CHANGE_REQUIRED`. If a real missing mapping is exposed, use a fresh RED before minimal production change.

- [ ] **Step 3: Record the no-op or green checkpoint in continuity**

---

### Task 3: EU Breadth Credential/Entitlement Wiring

**Files:**
- Create: `v12/providers/twelve_data_eu_breadth.js`
- Extend: `v12/staging/credentialed_source_loader.js`
- Extend: provider binding module used by existing Twelve Data sources.
- Modify: `v12/staging/source_pipeline.js`
- Modify only if needed: `v12/read_model/market_coverage.js` dataset capability mapping.
- Tests: new adapter, loader, binding and pipeline tests.

**Interfaces:**
- Consumes: `twelve-data-eu-breadth` catalog source and existing Twelve Data credential-loader conventions.
- Produces: canonical dataset `TWELVEDATA:BREADTH:EU` only when real credential + entitlement are injected; no live activation in default Staging.

- [ ] **Step 1: RED adapter contract**

Define canonical result with EU breadth counts/ratios derived only from provider-supplied eligible-universe quote rows. Reject empty universe, missing prior close, non-finite prices and mixed/unknown market scope. Preserve provider observation times separately from receive time.

- [ ] **Step 2: GREEN adapter**

Implement only normalization and validation; no network.

- [ ] **Step 3: RED secret-safe loader contract**

Assert:
- no key => zero requests,
- key but no entitlement => zero requests,
- key + entitlement => request allowed,
- secret never appears in URL/result/error/log payload,
- only approved Twelve Data HTTPS origin is allowed.

- [ ] **Step 4: GREEN loader**

Extend existing credentialed loader allowlist without altering US quote/volatility semantics.

- [ ] **Step 5: RED binding + pipeline contract**

With injected key + entitlement and deterministic provider fixture, pipeline publishes `TWELVEDATA:BREADTH:EU` and Coverage gains `MARKET_BREADTH`; without either gate, no dataset and no request. EU remains blocked because `INDEX` is still licence-required.

- [ ] **Step 6: GREEN binding + pipeline wiring**

Wire through existing provider diagnostics and regional facts; never grant execution authority.

- [ ] **Step 7: Full regression and commit**

Default Staging environment has no EU key/entitlement and must remain zero-request/fail-closed.

---

### Task 4: Home Decision-Readiness Projection

**Files:**
- Inspect/modify: Home view-model/projection modules that already expose `marketCoverage`.
- Tests: Home projection/view-model tests.
- UI changes only if an existing renderer can consume backend readiness without recomputation.

**Interfaces:**
- Consumes: backend `marketCoverage.markets[market]` fields.
- Produces: immutable decision-readiness projection for Home, including `coverageStatus`, `directionReadiness`, `researchReadiness`, `rankingEligibility`, `missingCapabilities`, and blocker summaries.

- [ ] **Step 1: RED projection test**

Assert Home preserves backend truth exactly and cannot transform BLOCKED/PARTIAL states into READY/ELIGIBLE.

- [ ] **Step 2: GREEN projection**

Add only a pure projection; no scoring or market inference.

- [ ] **Step 3: RED ranking guard**

Assert a market with `rankingEligibility='NOT_ELIGIBLE'` cannot enter any direction/ranking surface solely from opportunity rows.

- [ ] **Step 4: GREEN ranking guard**

Filter or label Home ranking surfaces according to backend eligibility while preserving research rows for inspection.

- [ ] **Step 5: Full regression and commit**

No Production execution code changes.

---

### Task 5: Continuity, Deployment Queue and External Blockers

**Files:**
- Modify: `docs/ai/FOXYYA_STATE.json`
- Modify: `docs/ai/FOXYYA_NEXT.md`

**Interfaces:**
- Consumes: all completed code-green commits and CI runs.
- Produces: exact ordered deployment queue for when Railway capacity returns.

- [ ] **Step 1: Record every fully-green product commit and CI run**

Keep `deployedSnapshotCommit` pointing only to the actual accepted Railway live commit until live acceptance changes it.

- [ ] **Step 2: Preserve external blockers**

Railway deployment capacity, Railway real CLI IaC migration, Cboe/TSE/HKEX/SSE/SZSE licences, Twelve Data keys/entitlements, J-Quants key/plan, and KRX key/service approval remain external gates.

- [ ] **Step 3: Update hourly deployment condition watch target**

If later code-green descendants supersede `d659c894...`, the watch must deploy only the newest fully-green product descendant after verifying no untested product changes.

- [ ] **Step 4: Verification-before-completion**

Re-check GitHub branch ancestry, latest full CI, current Railway accepted deployment and Production safety before claiming completion.
