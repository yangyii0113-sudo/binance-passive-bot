# FOXYYA v12 — Next Engineering Actions

Updated: 2026-09-14

## P0 Storage Recovery — CLOSED

P0 remains closed. Storage recovery, three refresh cycles, compressed lineage replay and live localhost lineage trace all passed.

## Market Data Coverage Gate — LIVE_GREEN

Latest verified staging checkpoint:

- Code head before continuity docs: `2eb21456e6243ce02c6fb0d7fa97e8e396e72493`.
- Full CI run `34848606637`: SUCCESS.
- Accepted Railway deployment: `4413e607-5792-49d3-a3b1-9c90df4224b9`, status SUCCESS.
- Accepted runtime is Node/v12 with `RESEARCH_ONLY=true` and `EXECUTION_WRITE=false`.
- `/health` passed 1/1.
- Initial bootstrap published:
  - Crypto opportunities: 346,
  - TW opportunities: 2,
  - US opportunities: 1,
  - events: 40,
  - TW forward samples: 5,
  - US forward status: `WAITING_LEGAL_DATA_SOURCE`.
- Live lineage trace probe passed: Home 200 / Trace 200 / sourceCount 2 / observationCount 12.
- Live Coverage probe passed: seven markets, preview/assets 200, mobile CSS present, read-only safety flags preserved.

### Current live coverage truth

- CRYPTO: READY.
- TW: READY.
- US: BLOCKED.
  - missing: INDEX, MARKET_BREADTH, QUOTE, VOLATILITY_CONTEXT.
  - blockers:
    - Nasdaq Trader daily INDEX: LICENSE_REVIEW_REQUIRED,
    - Nasdaq Trader daily MARKET_BREADTH: LICENSE_REVIEW_REQUIRED,
    - US realtime quote: PROVIDER_DECISION_REQUIRED,
    - US volatility/options context: PROVIDER_DECISION_REQUIRED.
- CN_HK: BLOCKED.
- JP: BLOCKED.
- KR: BLOCKED.
- EU: BLOCKED with PARTIAL direction evidence.

## Provider Coverage Expansion — IN PROGRESS

### Completed first expansion: CFTC positioning

CFTC TFF public reporting is now part of the official read-only research pipeline:

- provider: `cftc-cot`,
- dataset: `CFTC:TFF:gpe5-46if:EQUITY_INDEX`,
- source: CFTC public reporting,
- role: confirmation / positioning context only,
- latency: weekly,
- provider diagnostics + regional US facts + lineage are covered,
- no credential or secret is required,
- no execution authority is granted.

Important: CFTC positioning does **not** grant US INDEX, MARKET_BREADTH, QUOTE, or VOLATILITY_CONTEXT. US coverage must remain BLOCKED until those capabilities have independent approved evidence.

## Current priority: US INDEX + MARKET_BREADTH source resolution

Goal: close the highest-value US direction-readiness gap without bypassing licensing or inventing market state.

### Exact next actions

1. Re-verify current official Nasdaq Trader daily-market source terms and availability using authoritative current sources.
2. Decide one of these outcomes explicitly:
   - APPROVED_PUBLIC_USE — source can be activated under documented terms,
   - LICENSE_REQUIRED — keep Coverage BLOCKED and record the exact external requirement,
   - UNSUITABLE — remove it from candidate readiness and select another official/approved provider.
3. Do not treat a public webpage as redistribution permission by default.
4. If Nasdaq Trader is approved for the intended server-side research use:
   - write RED contracts for INDEX + MARKET_BREADTH binding/runtime semantics,
   - use the existing `nasdaq_daily_market_adapter.js` only after confirming its dataset assumptions against the actual official payload,
   - minimal GREEN wiring into the regional US context,
   - preserve original observation/report times and source lineage,
   - verify Coverage changes only from actual capabilities delivered.
5. If Nasdaq Trader remains license-blocked:
   - keep `LICENSE_REVIEW_REQUIRED`,
   - investigate another official/legal source for INDEX + MARKET_BREADTH,
   - prefer zero-secret public official feeds before commercial feeds,
   - never scrape around licensing restrictions.
6. QUOTE and VOLATILITY_CONTEXT remain separate provider decisions; do not conflate them with daily direction coverage.

### Engineering rules

- RED contract first for every code capability change.
- Minimal GREEN implementation.
- Provider diagnostics + lineage evidence required.
- `RESEARCH_ONLY=true`, `EXECUTION_WRITE=false` always.
- Production `PAPER_ONLY=true` / `REAL_ORDER_LOCK=true` unchanged.
- Full v12 Node + existing JS + Python + Production safety regression before deployment.
- Deploy only to v12 Research Staging.
- Reject Railway source-trigger deployments that run the Production Python image even if the commit SHA is correct; use native redeploy only after the intended snapshot has been captured.

## After US INDEX + MARKET_BREADTH

1. US QUOTE provider decision.
2. US VOLATILITY_CONTEXT provider decision.
3. EU INDEX + MARKET_BREADTH.
4. JP / KR activation after key and entitlement requirements are satisfied.
5. CN_HK approved data-product path.
6. Home decision-readiness UX refinement and direction eligibility integration.

## Handoff rule

At every material checkpoint, update `FOXYYA_STATE.json` and this file.

When the conversation becomes materially long, proactively checkpoint GitHub / Railway truth and prepare a compact fresh-chat continuation instruction before context exhaustion.
