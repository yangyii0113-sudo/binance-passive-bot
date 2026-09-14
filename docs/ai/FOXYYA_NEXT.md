# FOXYYA v12 — Next Engineering Actions

Updated: 2026-09-14

## P0 Storage Recovery — CLOSED

P0 remains closed. Storage recovery, three refresh cycles, compressed lineage replay and live localhost lineage trace all passed.

## Market Data Coverage Gate — LIVE_GREEN

The Coverage Gate is now live and accepted on v12 Research Staging.

Acceptance evidence:

- Final Coverage live-validation code commit: `ea6c896ab08405cb8023f5a0a2867f3fda3bc8f3`.
- Full CI run `34844303400` is GREEN:
  - all `tests/v12_*.test.cjs`: 710 / 710 passed,
  - existing runtime JavaScript regressions: 16 / 16 passed,
  - Python runtime regression passed,
  - Production safety-string gate passed,
  - v12 branch scope reported Production release authorized: false.
- Source-trigger deployment `e79fdee4-2090-405a-80b4-66b4d8805b52` captured the correct commit but ran the wrong Production Python / Execution V2 image and was rejected as INVALID.
- One native redeploy was then used on the captured snapshot. Accepted deployment: `6b59a3a7-758a-494a-909f-1e2043e6f279`, status SUCCESS.
- Accepted runtime is Node/v12 with `RESEARCH_ONLY=true` and `EXECUTION_WRITE=false`.
- Initial bootstrap published normally:
  - Crypto opportunities: 350,
  - TW opportunities: 2,
  - US opportunities: 1,
  - events: 40,
  - TW forward samples: 5,
  - US forward status: `WAITING_LEGAL_DATA_SOURCE`.
- Live lineage trace probe passed on the accepted deployment:
  - Home 200,
  - Trace 200,
  - representative lineage ref `out_1090ed3dfb9a85e6d631ddf199facaeba1f5a697712a1761d59c99fc8948dd3d`,
  - sourceCount 2,
  - observationCount 12,
  - `researchOnly=true`,
  - `executionWrite=false`.
- Live Market Coverage probe passed through localhost HTTP:
  - `/v12/api/home` 200,
  - `marketCoverage.schemaVersion=foxyya-market-coverage/1`,
  - exactly seven markets: CRYPTO / US / TW / CN_HK / JP / KR / EU,
  - Preview HTML 200,
  - `coverage.css` 200,
  - `market_coverage_renderer.js` 200,
  - responsive/mobile CSS detected,
  - `researchOnly=true`,
  - `executionWrite=false`.
- Accepted deployment has zero matching logs for:
  - `DURABLE_WRITE_FAILED`,
  - `LINEAGE_JOURNAL_CORRUPT`,
  - `FOXYYA v12 research refresh failed`,
  - startup validation failure.
- Persistent backup helper remains SUCCESS with durable `/backup` storage.
- Production Execution V2 was not modified.

## Current priority: Provider Coverage Expansion

Goal: improve real, legally usable data coverage behind the Coverage Gate without fabricating readiness or bypassing credentials, entitlements, licensing, or commercial data requirements.

### Implementation order

1. Read the current live Coverage Gate as the authority for missing capabilities and blocker categories.
2. Expand provider inputs one market/capability at a time using TDD and official/approved data paths only.
3. Prioritize gaps that materially improve market-direction or research readiness rather than adding low-value feeds.
4. Preserve deterministic distinction between:
   - runtime/provider failure,
   - missing implementation,
   - API-key / credential requirement,
   - entitlement requirement,
   - licensing / commercial data-product requirement,
   - provider decision required.
5. Do not use scraping to bypass licensed market-data restrictions.
6. Keep all new provider data research-only and immutable:
   - `RESEARCH_ONLY=true`,
   - `EXECUTION_WRITE=false`,
   - no execution authority,
   - no changes to Production `PAPER_ONLY=true` / `REAL_ORDER_LOCK=true`.
7. For each provider/capability addition:
   - RED contract first,
   - minimal GREEN implementation,
   - provider diagnostics evidence,
   - Coverage Gate status/readiness verification,
   - full v12 + JS + Python + Production safety regression before deployment.
8. Deploy provider expansions only to v12 Research Staging and repeat the accepted deployment pattern:
   - reject any source-trigger deployment that runs the wrong Production Python image,
   - use one native redeploy only after the intended snapshot is captured,
   - verify Node/v12 runtime and safety flags live.

## After Provider Coverage Expansion

1. Home decision-readiness UX refinement.
2. Direction eligibility integration into research surfaces.
3. JP/KR/CN-HK source activation as credentials / entitlement / licensing allow.
4. Continue forward validation and research-quality measurement.
5. Reassess data coverage priorities from measured user value and provider reliability.

## Handoff rule

At every material checkpoint, update `FOXYYA_STATE.json` and this file.

When the conversation becomes materially long, do not wait for context exhaustion. Proactively:

1. checkpoint the latest GitHub / Railway truth into `FOXYYA_STATE.json` and `FOXYYA_NEXT.md`,
2. prepare a compact fresh-chat continuation instruction containing the active branch, accepted deployment, safety invariants, completed work, blockers, and exact next action,
3. tell the user to open a new chat and paste that continuation instruction if a fresh conversation is needed.

The ChatGPT interface itself is not programmatically opened by this workflow; continuity must not depend on the current chat remaining available.
