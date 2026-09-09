# FOXYYA v12 Results + Lab Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate Crypto Trading Results from equity Research Results and establish Control/Shadow lab version governance.

**Architecture:** Results are two explicit domains with incompatible semantics. Crypto metrics derive only from closed Forward Paper trades. Equity Research Tracking stores research stages and future observed outcomes without treating them as fills. Lab registry enforces Control/Shadow separation and sample sufficiency.

**Tech Stack:** JavaScript/CommonJS, Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-09-foxyya-v12-architecture-design.md`

## Constraints

- Trading Results and Research Results are never merged into one win rate.
- Crypto results use only completed Paper trades.
- Research tracking never creates a position/fill.
- Sample count <20 => `SAMPLE_INSUFFICIENT` for strategy interpretation.
- Missing Max DD/history remains unavailable rather than fabricated.
- Shadow cannot overwrite Control.
- A version must be explicit and immutable once registered.

### Task 1: Results contracts
Create `v12/results/contracts.js` with `TRADING_RESULTS` / `RESEARCH_RESULTS` and validation; tests enforce semantic separation.

### Task 2: Crypto trading result projector
Create `v12/results/crypto_results.js`. Consume v12 Crypto read adapter closed trades; compute count, win rate, net P&L, realized R sum/expectancy, profit factor where available, fees/funding where present, sample status. Metrics lacking source history are `null` / unavailable.

### Task 3: Equity research tracking
Create `v12/results/research_tracking.js`. States: WATCH, EARLY, ACCUMULATING, READY, TRACKING, INVALIDATED. Create/update immutable research tracks with baseline observation and optional +1D/+5D/+20D outcomes; never create execution fields.

### Task 4: Lab contracts + version registry
Create `v12/lab/contracts.js`, `v12/lab/version_registry.js`. Modes: CONTROL, SHADOW. Version IDs immutable; Control replacement requires a new version and explicit review metadata. Shadow registration cannot alter active Control.

### Task 5: Lab report and compare
Create `v12/lab/report.js`. Standard metrics include sampleCount, winRate, expectancy, profitFactor, maxDrawdown, capture where available. `sampleCount <20` marks `SAMPLE_INSUFFICIENT`. Compare returns deltas but never auto-promotes Shadow.

### Task 6: Stable exports and full regression
Create `v12/results/index.js`, `v12/lab/index.js`, update `v12/core/index.js`, test full v12 suite and GitHub diff boundary.
