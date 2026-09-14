# FOXYYA v12 — Next Engineering Actions

Updated: 2026-09-14

## P0 Storage Recovery — CLOSED

P0 remains closed. No accepted deployment in this checkpoint reports `DURABLE_WRITE_FAILED`, `LINEAGE_JOURNAL_CORRUPT`, or research refresh failure.

## Latest accepted Research Staging checkpoint

- Fully GREEN code commit: `219fba96509b24e2d2bbbc397acab3dea440ae50`.
- CI run: `34851744968` — SUCCESS.
  - v12 Node: 716 / 716 passed.
  - existing JavaScript regressions: 16 / 16 passed.
  - Python regression: PASS.
  - Production safety gate: PASS.
  - v12 branch Production release authorized: false.
- Source-trigger deployment `c15d69b7-18fe-48b4-8460-14a314cd3921` captured the correct commit but ran the wrong Production Python / Execution V2 image and is INVALID.
- Accepted native redeploy: `b817a331-a457-41f0-b548-ac856f9892db`, SUCCESS.
- Accepted runtime is Node/v12 with `RESEARCH_ONLY=true`, `EXECUTION_WRITE=false`; healthcheck passed.
- Initial bootstrap published normally: Crypto 346, TW 2, US 1, events 40, TW forward samples 5, US forward status `WAITING_LEGAL_DATA_SOURCE`.
- Live lineage probe: Home 200 / Trace 200 / sourceCount 3 / observationCount 20.
- Live Coverage probe: seven markets, preview/CSS/renderer 200, mobile CSS present, read-only safety flags preserved.

## Provider Coverage Expansion — CFTC POSITIONING LIVE_GREEN

The live CFTC failure `CONTEXT_OBSERVATION_INVALID` was traced to official CFTC consolidated contract codes such as `13874+`. Raw provider codes were previously inserted directly into canonical `entityId`, whose contract correctly forbids `+`.

TDD fix:

1. RED commit `5a2abda2def5f3c606ba17becf02b3d0c3bb0275` added a real plus-suffixed CFTC fixture.
   - 716 tests: 715 pass / 1 expected fail.
   - exact failure: `CONTEXT_OBSERVATION_INVALID:ENTITY_ID_INVALID`.
2. GREEN commit `219fba96509b24e2d2bbbc397acab3dea440ae50` escapes only provider-code characters that are illegal in canonical entity IDs.
   - raw `contractCode` remains unchanged for provenance,
   - existing safe codes keep their existing entity token,
   - global entity-ID rules were not relaxed.
3. Live accepted deployment proves:
   - CFTC provider status: `AVAILABLE`,
   - dataset: `CFTC:TFF:gpe5-46if:EQUITY_INDEX`,
   - US `availableCapabilities` contains `FUTURES_POSITIONING`,
   - CFTC remains weekly confirmation-only evidence,
   - US readiness remains BLOCKED.

## US INDEX + MARKET_BREADTH — EXTERNAL_LICENSE_REQUIRED

Nasdaq Trader daily files are now represented as `LICENSE_REQUIRED`, not `LICENSE_REVIEW_REQUIRED`.

Live US blockers:

- `LICENSE_REQUIRED:INDEX:nasdaq-trader-daily`
- `LICENSE_REQUIRED:MARKET_BREADTH:nasdaq-trader-daily`
- `PROVIDER_DECISION_REQUIRED:QUOTE:us-equity-realtime`
- `PROVIDER_DECISION_REQUIRED:VOLATILITY_CONTEXT:us-options-analytics`

Do not activate Nasdaq Trader merely because files are publicly downloadable. Current authoritative terms/policies do not establish permission for FOXYYA automated server-side use. Cboe / NYSE / SIP research likewise indicates market-data licensing is a real external boundary; do not substitute volume for breadth and do not scrape around licensing.

## Current priority: US QUOTE PROVIDER DECISION

Goal: select a legally usable US quote path without weakening the Coverage Gate or conflating quote access with full-market direction readiness.

### Exact next actions

1. Research current US quote providers and official/licensed distribution paths using authoritative current terms, pricing, latency, redistribution/non-display constraints, API availability, and Taiwan-access feasibility.
2. Classify candidates into:
   - APPROVED_PUBLIC_USE,
   - COMMERCIAL_LICENSE_AVAILABLE,
   - API_KEY_REQUIRED,
   - ENTITLEMENT_REQUIRED,
   - UNSUITABLE.
3. Prefer a provider that supports server-side research API use with explicit terms and predictable cost; do not prioritize nominally free access if licensing is ambiguous.
4. Keep `us-equity-realtime` `PROVIDER_DECISION_REQUIRED` until a provider is explicitly selected.
5. After provider selection, write RED contracts before implementation. Required canonical semantics:
   - provider timestamp / observation timestamp preserved,
   - receive time separate from market time,
   - stale or delayed quotes labelled honestly,
   - no quote source may grant INDEX or MARKET_BREADTH by itself,
   - research-only / no execution authority.
6. Full v12 + JS + Python + Production safety regression before any staging deployment.
7. Deploy only to v12 Research Staging and reject source-trigger deployments that run the Production Python image.

## Subsequent priorities

1. US VOLATILITY_CONTEXT provider decision.
2. Revisit US INDEX + MARKET_BREADTH only when a valid license/data-product path is available.
3. EU INDEX + MARKET_BREADTH.
4. JP / KR activation after key + entitlement requirements are satisfied.
5. CN_HK approved data-product path.
6. Home decision-readiness UX refinement and direction eligibility integration.

## Handoff rule

At every material checkpoint, update `FOXYYA_STATE.json` and this file. When the conversation becomes materially long, proactively checkpoint GitHub/Railway truth and prepare a compact fresh-chat continuation instruction before context exhaustion.
