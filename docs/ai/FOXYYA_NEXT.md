# FOXYYA v12 — Next Engineering Actions

Updated: 2026-09-14

## P0 Storage Recovery — CLOSED

P0 remains closed. Storage recovery, three refresh cycles, compressed lineage replay and live localhost lineage trace all passed.

## Market Data Coverage Gate — LIVE_GREEN

The latest Coverage Gate build is live and accepted on v12 Research Staging.

### Latest accepted deployment

- Code commit: `6d631bbbb75489ee305f738389731a9f54a37f0f` (`feat(v12): expose live coverage blocker summary`).
- Full CI run `34845358891`: SUCCESS.
- Source-trigger deployment `8c48d81d-e635-4336-a515-c2082bcd5138` captured the correct commit but ran the wrong Production Python / Execution V2 image and was rejected as INVALID.
- Native redeploy on the captured snapshot: `aa6f4827-ddd9-4a63-b5e9-3bd266940086`, status SUCCESS.
- Accepted runtime is Node/v12 with:
  - `RESEARCH_ONLY=true`,
  - `EXECUTION_WRITE=false`,
  - `/health` passed 1/1.

### Live acceptance evidence

- Initial bootstrap:
  - Crypto opportunities: 350,
  - TW opportunities: 1,
  - US opportunities: 1,
  - events: 40,
  - TW forward samples: 5,
  - US forward status: `WAITING_LEGAL_DATA_SOURCE`.
- Live lineage trace probe passed:
  - Home 200,
  - Trace 200,
  - representative lineage ref `out_1809ef626b9803d6db3dadbdc6989858c6166006e3c2d395543d99b4f3f0f51f`,
  - sourceCount 1,
  - observationCount 47,
  - `researchOnly=true`,
  - `executionWrite=false`.
- Live Market Coverage probe passed:
  - `/v12/api/home` 200,
  - `marketCoverage.schemaVersion=foxyya-market-coverage/1`,
  - exactly seven markets: CRYPTO / US / TW / CN_HK / JP / KR / EU,
  - Preview HTML 200,
  - `coverage.css` 200,
  - `market_coverage_renderer.js` 200,
  - responsive/mobile CSS detected.
- Live market state summary:
  - CRYPTO: READY,
  - TW: READY,
  - US: BLOCKED — missing INDEX / MARKET_BREADTH / QUOTE / VOLATILITY_CONTEXT; licensing/provider decisions required,
  - CN_HK: BLOCKED — data-product/licensing plus INDEX / MARKET_BREADTH implementation gaps,
  - JP: BLOCKED — API key / entitlement plus INDEX / MARKET_BREADTH gaps,
  - KR: BLOCKED — API key / entitlement for INDEX / MARKET_BREADTH / QUOTE,
  - EU: BLOCKED with PARTIAL direction evidence — INDEX / MARKET_BREADTH still missing.
- Current staging disk usage remains healthy at about 0.056 GB after storage recovery.
- v12 branch scope continues to report Production release authorized: false. This deployment workflow targeted only v12 Research Staging.

## Current priority: Provider Coverage Expansion

Goal: improve real, legally usable data coverage behind the Coverage Gate without fabricating readiness or bypassing credentials, entitlements, licensing, or commercial data requirements.

### Recommended implementation order

1. **US market coverage first** — highest decision value and currently the largest functional gap.
   - INDEX
   - MARKET_BREADTH
   - QUOTE
   - VOLATILITY_CONTEXT
   - Resolve `LICENSE_REVIEW_REQUIRED` vs `PROVIDER_DECISION_REQUIRED` before activating any source.
2. **EU market coverage**
   - INDEX
   - MARKET_BREADTH
   - preserve macro-only evidence as PARTIAL until broad-market evidence exists.
3. **JP / KR source activation**
   - only after API key / entitlement requirements are satisfied,
   - never bypass provider plans or licensing.
4. **CN_HK**
   - treat HKEX data-product / licensing requirements as external blockers,
   - implement INDEX / MARKET_BREADTH only through approved sources.
5. Re-evaluate TW and Crypto only for evidence-density / reliability improvements; both are already Coverage READY.

### Engineering rules for every provider addition

1. RED contract first.
2. Minimal GREEN implementation.
3. Provider diagnostics evidence.
4. Coverage Gate status/readiness verification.
5. No scraping to bypass licensed market-data restrictions.
6. Preserve blocker distinctions:
   - runtime/provider failure,
   - missing implementation,
   - API-key requirement,
   - entitlement requirement,
   - licensing/data-product requirement,
   - provider decision required.
7. Keep all provider data research-only:
   - `RESEARCH_ONLY=true`,
   - `EXECUTION_WRITE=false`,
   - no execution authority.
8. Full v12 Node + existing JavaScript + Python + Production safety regression before deployment.
9. Deploy only to v12 Research Staging.
10. Reject any source-trigger deployment that runs the wrong Production Python image; after the intended snapshot is captured, use native redeploy and re-run the live probes.

## After Provider Coverage Expansion

1. Home decision-readiness UX refinement.
2. Direction eligibility integration into research surfaces.
3. Continue forward validation and research-quality measurement.
4. Reassess data coverage priorities from measured user value and provider reliability.

## Handoff rule

At every material checkpoint, update `FOXYYA_STATE.json` and this file.

When the conversation becomes materially long, do not wait for context exhaustion. Proactively checkpoint GitHub / Railway truth and prepare a compact fresh-chat continuation instruction.
