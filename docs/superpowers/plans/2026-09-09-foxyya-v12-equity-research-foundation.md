# FOXYYA v12 Equity Research Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build provider-agnostic US and Taiwan equity Research Engines that convert verified evidence into auditable Research Reads and conditional price scenarios without execution capability.

**Architecture:** A shared Research contract defines direction, confidence, data quality and evidence traceability. US and TW engines use separate dimension sets. Earnings/expectation and scenario helpers remain pure functions. Early Trend output may be attached as research context but cannot authorize a trade.

**Tech Stack:** JavaScript/CommonJS, Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-09-foxyya-v12-architecture-design.md`

## Global Constraints

- US/TW output is `researchOnly:true`.
- No `BUY`, `SELL`, `OPEN`, `PENDING_INTENT`, order or execution authorization fields.
- Research Read != trading signal.
- Price Scenario is conditional and always has invalidation.
- Missing/stale evidence cannot improve confidence.
- US and TW use separate market-specific dimensions.
- Taiwan institutional evidence preserves foreign / investment trust / dealer distinctions.
- Provider selection remains outside this phase.

---

### Task 1: Shared equity research contract

**Files:**
- Create: `v12/research/contracts.js`
- Test: `tests/v12_research_contracts.test.cjs`

**Produces:**
- `RESEARCH_DIRECTIONS = POSITIVE | NEUTRAL | NEGATIVE | MIXED | UNAVAILABLE`
- `US_DIMENSIONS = TREND | MOMENTUM | FUNDAMENTAL | EXPECTATION | FLOW | RISK`
- `TW_DIMENSIONS = TREND | MOMENTUM | REVENUE | FUNDAMENTAL | INSTITUTIONAL | MARGIN_SHORT | SECTOR | OVERSEAS_LINK | RISK`
- `validateResearchRead(value)`

Required output fields: market, instrumentId, direction, confidence, dimensions, evidence, contradictions, missingDimensions, asOf, researchOnly.

### Task 2: Shared evidence aggregator

**Files:**
- Create: `v12/research/evidence.js`
- Test: `tests/v12_research_evidence.test.cjs`

**Produces:** `aggregateDimensions(expectedDimensions, evidence, nowMs)`.

Evidence item fields: dimension, score (-1..1), confidence (0..1), status, source, asOf, label, optional metadata.

Rules:
- one strongest record per source+dimension may contribute;
- stale/unavailable evidence excluded;
- output preserves contradictions and missing dimensions;
- no-data yields UNAVAILABLE, never guessed neutral.

### Task 3: US Research Engine + Earnings/Expectation helper

**Files:**
- Create: `v12/research/us_engine.js`
- Create: `v12/research/earnings.js`
- Test: `tests/v12_us_research.test.cjs`

**Produces:** `buildUSResearch(input)`, `surprise(actual, consensus)`, `revision(current, prior)`.

US Research must expose Trend, Momentum, Fundamental, Expectation, Flow and Risk separately. Positive actual growth and positive expectation surprise are not the same field.

### Task 4: Taiwan Research Engine

**Files:**
- Create: `v12/research/tw_engine.js`
- Test: `tests/v12_tw_research.test.cjs`

**Produces:** `buildTWResearch(input)`.

TW engine dimensions include Revenue, Institutional, Margin/Short, Sector and Overseas Link. Institutional metadata must preserve `foreign`, `investmentTrust`, and `dealer` when present; the engine must not collapse them into an anonymous flow value.

### Task 5: Conditional Price Scenario

**Files:**
- Create: `v12/research/price_scenario.js`
- Test: `tests/v12_price_scenario.test.cjs`

**Produces:** `buildPriceScenarios(input)`.

Required scenarios: BULL_CASE, BASE_CASE, BEAR_CASE. Each scenario requires conditions, zone, invalidation, volatilityContext, catalystContext, provenance and asOf. No unconditional target is accepted.

### Task 6: Stable exports + full regression

**Files:**
- Create: `v12/research/index.js`
- Modify: `v12/core/index.js`
- Test: `tests/v12_research_foundation.test.cjs`

Acceptance:
- all `tests/v12_*.test.cjs` pass;
- Research module exposes no execution methods;
- GitHub diff remains limited to v12/tests/docs;
- Production/runtime/ledger/UI files remain unchanged.
