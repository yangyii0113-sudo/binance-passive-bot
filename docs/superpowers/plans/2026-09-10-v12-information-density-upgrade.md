# FOXYYA v12 Information Density Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current sparse, raw-data-heavy v12 Research Staging experience with a dense Chinese-first decision surface that reuses existing verified data, fixes misleading news status, and expands public official macro coverage without weakening any safety or licensing constraint.

**Architecture:** Keep the existing read-only pipeline and safety boundaries. Add presentation-time aggregation that combines regional snapshots with already-published equity research, Crypto paper-runtime candidates, and verified events; separately expand the approved public BLS/ECB bootstrap inputs. Do not infer a directional market view from partial data: partial coverage must remain explicitly labeled as partial.

**Tech Stack:** Node.js 22, CommonJS, built-in node:test, Railway staging container, existing FOXYYA v12 read models and renderers.

**Spec:** User-reported screenshots on 2026-09-10: seven-region cards are mostly empty, Today Focus is raw English and news rows show misleading unavailable status; visible interface should be Traditional Chinese-first and decision-useful.

## Global Constraints

- `PAPER_ONLY=true`
- `REAL_ORDER_LOCK=true`
- `RESEARCH_ONLY=true`
- `EXECUTION_WRITE=false`
- Production Execution V2 is read-only from v12 and must not be redeployed or mutated.
- No real-order, signed-order, leverage-setting, withdrawal, transfer, or equity execution path.
- No unlicensed realtime US equity quote or fake live labels.
- No scraping substitute for licensed data.
- Missing/partial data must remain explicit and must not be converted into fabricated directional signals.
- Keep raw machine status for diagnostics while visible copy is Traditional Chinese-first.

---

### Task 1: Fix News Truth and Add Chinese Decision Context

**Files:**
- Modify: `v12/staging/live_research_bootstrap.js`
- Modify: `v12/ui/home_renderer.js`
- Test: `tests/v12_information_density.test.cjs`

**Interfaces:**
- Consumes: normalized NEWS event rows with `title`, `summary`, `source`, `tags`, `assets`, `impact`.
- Produces: NEWS rows with explicit snapshot status plus Chinese-first Today Focus cards containing topic, why-it-matters, affected-market tags, and raw source headline as secondary evidence.

- [ ] Write failing tests that a normalized news item with valid data is not labeled unavailable and that Today Focus renders Chinese decision context.
- [ ] Run the focused test and verify RED for missing news status / missing Chinese focus context.
- [ ] Set NEWS status from the upstream payload when available, otherwise `SNAPSHOT`; add deterministic research-only topic classification in the renderer without changing raw source content.
- [ ] Run the focused test and verify GREEN.
- [ ] Commit.

### Task 2: Turn Seven-Region Cards into Content Aggregation Cards

**Files:**
- Modify: `v12/ui/home_renderer.js`
- Modify: `v12/ui/styles.css`
- Test: `tests/v12_information_density.test.cjs`

**Interfaces:**
- Consumes: complete `foxyya-home-view-model/1`, including `regions`, `opportunities`, `marketPulse`, `events`.
- Produces: regional cards that distinguish `可判方向`, `部分可用`, and `尚未接入`, surface verified research/event/candidate counts, show key facts and explicit data gaps, and render truly empty regions compactly.

- [ ] Write failing tests for TW partial coverage from two research assets, US partial coverage from one research asset/events, Crypto coverage from paper candidates/runtime, and compact missing JP/KR/CN-HK cards.
- [ ] Run focused tests and verify RED.
- [ ] Change region rendering to receive the whole Home view model and aggregate only already-verified published content; never derive market bias from counts alone.
- [ ] Add CSS for dense active cards and compact gap cards, including mobile stacking.
- [ ] Run focused tests and verify GREEN.
- [ ] Commit.

### Task 3: Expand Free Official Macro Coverage

**Files:**
- Modify: `v12/staging/live_research_bootstrap.js`
- Test: `tests/v12_live_research_bootstrap.test.cjs`
- Test: `tests/v12_information_density.test.cjs`

**Interfaces:**
- Consumes: existing BLS and ECB public source bindings.
- Produces: US BLS configuration for CPI, unemployment rate, and payroll employment; EU ECB configuration for HICP, main refinancing rate, and deposit facility rate.

- [ ] Write failing tests requiring three BLS series and three ECB series with official HTTPS endpoints and no credentials.
- [ ] Run focused tests and verify RED.
- [ ] Expand `buildBootstrapInput()` using BLS single-series `?latest=true` endpoints and ECB Data Portal series keys; preserve current lineage/source policies.
- [ ] Update bootstrap fixtures so integration tests exercise all six public macro reads.
- [ ] Run focused tests and verify GREEN.
- [ ] Commit.

### Task 4: Full Regression and Staging Deployment

**Files:**
- Verify only; no Production files changed.

**Interfaces:**
- Consumes: branch `v12-platform-completion-20260910`.
- Produces: a verified staging deployment only.

- [ ] Run complete FOXYYA v12 CI and require zero failures.
- [ ] Verify existing JavaScript regression, Python regression, and Production safety string gates.
- [ ] Deploy only `FOXYYA v12 Research Staging` using the known Railway two-step workaround if the source-triggered deploy picks the root Production image.
- [ ] Verify Railway `/health`, runtime log `RESEARCH_ONLY=true EXECUTION_WRITE=false`, and initial research bootstrap publication.
- [ ] Confirm original Production Execution V2 deployment remains unchanged and do not accept the opaque staged patch.
