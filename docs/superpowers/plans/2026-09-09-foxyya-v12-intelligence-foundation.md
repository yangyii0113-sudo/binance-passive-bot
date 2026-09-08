# FOXYYA v12 Intelligence Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build provider-agnostic Global Intelligence and Early Trend engines that summarize evidence without producing trade orders or modifying Crypto Control execution.

**Architecture:** Intelligence consumes already-normalized observations/evidence. Regional and Context engines produce market bias/context; Early Trend consumes independent evidence families and produces staged research readiness. All outputs carry evidence, contradictions, confidence and timestamps.

**Tech Stack:** JavaScript/CommonJS, Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-09-foxyya-v12-architecture-design.md`

## Constraints

- No BUY/SELL or execution authorization outputs.
- Seven regional contexts: US, TW, CN_HK, JP, KR, EU, CRYPTO.
- Bias vocabulary: STRONG_BULLISH, BULLISH, NEUTRAL, BEARISH, STRONG_BEARISH.
- Early Trend stages: DETECT, EARLY_WATCH, ACCUMULATION, CONFIRMING, READY.
- Stale/unavailable evidence cannot increase confidence.
- Every output preserves evidence provenance and as-of time.
- Early Trend remains `researchOnly:true`.

### Task 1: Intelligence contracts
Create `v12/intelligence/contracts.js` and tests for regional coverage, bias vocabulary and research-only output.

### Task 2: Regional Trend Engine
Create `v12/intelligence/regional_engine.js` and tests. Input evidence items contain `family`, `direction` (-1..1), `confidence` (0..1), `status`, `asOf`, `source`. Output weighted score, bias, confidence, supporting/contradicting evidence. No data returns `UNAVAILABLE` context instead of guessed neutral.

### Task 3: Context Engine
Create `v12/intelligence/context_engine.js` and tests. Merge Regional, Macro, Rotation, Catalyst and Risk evidence into a traceable context snapshot while keeping published facts / expectations / scenario interpretations separated.

### Task 4: Early Trend contracts and fusion
Create `v12/early_trend/contracts.js`, `v12/early_trend/fusion.js` and tests. Evidence families: SMART_MONEY, INSTITUTIONAL, EXPECTATION, OPTIONS, BREADTH, ROTATION, LEAD_LAG, VOLATILITY, DIVERGENCE, ONCHAIN. Output stage, direction, confidence, evidence family count, supports, contradictions, invalidations, next confirmations, `researchOnly:true`.

### Task 5: Stable exports and regression
Create `v12/intelligence/index.js`, `v12/early_trend/index.js`, update `v12/core/index.js`, run all `tests/v12_*.test.cjs`, and verify diff remains confined to v12/tests/docs.
