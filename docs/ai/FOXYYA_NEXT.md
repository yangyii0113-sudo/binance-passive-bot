# FOXYYA v12 — Next Engineering Actions

Updated: 2026-09-14

## P0 Storage Recovery — CLOSED

P0 remains closed. Storage recovery, three refresh cycles, compressed lineage replay and live localhost lineage trace all passed.

## Current priority: Market Data Coverage Gate — deployment validation

Source spec:

`docs/superpowers/specs/2026-09-12-foxyya-v12-market-data-coverage-gate-design.md`

### GREEN implementation completed

1. Backend Coverage Gate is the single source of truth for seven markets:
   - CRYPTO
   - US
   - TW
   - CN_HK
   - JP
   - KR
   - EU

2. Deterministic coverage states are implemented:
   - `READY`
   - `PARTIAL`
   - `BLOCKED`
   - `UNAVAILABLE`

3. Each market record exposes:
   - coverage status,
   - activation state,
   - direction readiness,
   - instrument research readiness,
   - research ranking eligibility,
   - available capabilities,
   - missing capabilities,
   - normalized blockers,
   - approved source projections,
   - freshness,
   - evidence counts,
   - `researchOnly=true`,
   - `executionWrite=false`.

4. Guard semantics are GREEN:
   - isolated TW instrument research does not imply TW broad-market readiness,
   - SEC/BLS/NVDA research does not imply US broad-market direction readiness,
   - EU macro-only data does not imply EU broad-market readiness,
   - JP/KR credential or entitlement gaps are `BLOCKED`,
   - CN-HK licensing/data-product gaps are `BLOCKED`,
   - unknown datasets cannot grant normalized capabilities,
   - one provider failure only degrades the mapped capability.

5. Home backend publishes `marketCoverage`.
6. Home View Model preserves backend coverage without browser-side recomputation.
7. Chinese-first Coverage panel is GREEN:
   - market,
   - coverage state,
   - direction eligibility,
   - research availability,
   - ranking eligibility,
   - translated available/missing capabilities,
   - backend blocker reasons.
8. Coverage UI is modular and responsive:
   - `v12/ui/market_coverage_renderer.js`
   - `v12/ui/coverage.css`
   - staging preview server injects these assets into served preview HTML without rewriting the large static index file.
9. Full CI for commit `5b5ddeb6cb4ec99103de46e51984f4a241865503` passed all v12 Node contracts, existing JavaScript regressions, Python regression, and Production safety gate in run `34830322740`.

### Exact next steps

1. Deploy the Coverage Gate build only to `foxyya-v12-staging`.
   - Refresh the target source snapshot.
   - If Railway source-trigger runs the wrong Production Python image, invalidate it and use native redeploy on the captured snapshot.

2. Verify valid v12 runtime:
   - Node/v12 runtime,
   - `/health` passes,
   - `RESEARCH_ONLY=true`,
   - `EXECUTION_WRITE=false`,
   - no `foxyya_runtime_backend/service.py` in the accepted deployment.

3. Validate live Coverage backend:
   - `/v12/api/home` contains `marketCoverage.schemaVersion=foxyya-market-coverage/1`,
   - exactly seven markets exist,
   - no writable/execution field is enabled,
   - market states match live evidence and external gates.

4. Validate live Preview assets:
   - served preview HTML loads `coverage.css`,
   - served preview HTML loads `market_coverage_renderer.js` after `home_dom.js` and before `app.js`,
   - the Home page creates the Coverage target,
   - renderer produces seven Chinese market coverage cards,
   - mobile CSS is available.

5. Confirm existing runtime behavior remains healthy:
   - bootstrap publishes normally,
   - live lineage trace probe passes,
   - no storage regression,
   - no `DURABLE_WRITE_FAILED`,
   - no `LINEAGE_JOURNAL_CORRUPT`.

6. After live validation passes, update `FOXYYA_STATE.json` and this file to mark Market Data Coverage Gate `LIVE_GREEN`.

## After Coverage Gate is live

1. Provider coverage expansion by market.
2. Home decision-readiness UX refinement.
3. Direction eligibility integration into research surfaces.
4. JP/KR/CN-HK source activation as credentials/licensing allow.
5. Continue forward validation and research-quality measurement.

## Handoff rule

At every material checkpoint, update `FOXYYA_STATE.json` and this file. Do not generate a long conversational handoff unless the user specifically asks for one.
