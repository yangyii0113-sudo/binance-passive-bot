# FOXYYA v12 — Next Engineering Actions

Updated: 2026-09-15 15:39 +08:00

## Research Staging — current accepted live checkpoint

The currently accepted live Research Staging deployment remains unchanged and healthy:

- Accepted live product commit: `dc56501497bf1095ad0509678889197fe6762f44`.
- Accepted Railway deployment: `6cedb435-a175-4cb8-85bd-ffa1b70a5fd3`, SUCCESS.
- Runtime: Node/v12, `RESEARCH_ONLY=true`, `EXECUTION_WRITE=false`.
- Healthcheck: `/ready`.
- Production Execution V2 was not modified.

Do not claim the EU provider split is live yet. The new code is fully green but Railway has not created a deployment for it because the workspace resource quota is exhausted.

## EU INDEX + MARKET_BREADTH provider split — CODE GREEN / DEPLOYMENT BLOCKED

Approved provider split is implemented in code and fully tested.

### Exact release candidate

- Green commit: `d659c8947524f8bb20139f7be36121d55316acfc`.
- GitHub Actions run: `34942196866` — SUCCESS.
- v12 Node tests: 750 / 750 passed.
- existing JavaScript regressions: 16 / 16 passed.
- Python regression: 1 / 1 PASS.
- Production safety gate: PASS.
- isolated Staging + backup container smoke: PASS.
- Production release authorized: false.

### TDD evidence

RED commit:

- `c3be271cd295f9a3bce09640e615999e5947b804`
- 750 tests / 748 passed / 2 expected failures.
- Both failures were only the new EU provider-decision expectations.

GREEN provider implementation:

- `4074e16758f9f7f19aaf4556fcc1b5afb2d3141c`
- Retired generic `eu-equity-realtime`.
- Added `cboe-europe-index` for EU `INDEX`.
- Added `twelve-data-eu-breadth` for EU `MARKET_BREADTH`.

Four stale tests still referred to the retired generic source. They were updated without weakening access control or safety semantics, producing final green commit `d659c894...`.

### New EU source truth

`cboe-europe-index`:

- Provider: Cboe Europe Indices / Cboe Global Indices Feed.
- Capability: `INDEX`.
- Market: EU.
- Status: `LICENSE_REQUIRED`.
- `liveEligible=false`.
- Market scope: `PAN_EUROPE_INDEX`.
- No credential can bypass the licensing gate.

`twelve-data-eu-breadth`:

- Provider: Twelve Data × Cboe Europe Equities.
- Capability: `MARKET_BREADTH`.
- Market: EU.
- Status: `KEY_REQUIRED`.
- server-only credential required.
- Cboe Europe entitlement required.
- `liveEligible=false` until a verified provider path exists.
- Market scope: `PAN_EUROPE_CBOE_EQUITIES`.

This step adds only catalog/Coverage blocker semantics. It does NOT add live EU provider requests and does NOT promote EU readiness.

### Expected live EU Coverage after deployment

EU must remain:

- `coverageStatus=BLOCKED`
- `directionReadiness=PARTIAL`
- `researchReadiness=NOT_READY`
- `rankingEligibility=NOT_ELIGIBLE`
- available capability includes `MACRO`
- missing capabilities: `INDEX`, `MARKET_BREADTH`

Expected blockers:

- `LICENSE_REQUIRED:INDEX:cboe-europe-index`
- `API_KEY_REQUIRED:MARKET_BREADTH:twelve-data-eu-breadth`
- `ENTITLEMENT_REQUIRED:MARKET_BREADTH:twelve-data-eu-breadth`

There must be no `PROVIDER_DECISION_REQUIRED` blocker remaining for EU breadth.

## Current deployment blocker — Railway workspace resource quota

Attempts to deploy exact commit `d659c894...` on the existing `foxyya-v12-staging` service were rejected before a deployment was created with:

`You have used all your available resources`

This occurred twice. Stop retrying until the Railway workspace quota/capacity clears.

Important distinctions:

- This is not a GitHub CI failure.
- This is not an application runtime failure.
- This is not the known Python-image Config-as-Code bug because no new source deployment was created.
- The currently accepted deployment `6cedb435...` remains live and healthy.
- No Production Execution V2 change occurred.

### Exact next deployment action once quota clears

1. Revalidate branch ancestry and confirm the release candidate is still the latest fully-green descendant. If only continuity/docs commits are newer, `d659c894...` product code remains valid.
2. Trigger a source snapshot for the existing `foxyya-v12-staging` service only.
3. Require captured product code to contain `d659c894...` or a fully-green descendant with no later product changes.
4. Inspect build logs before acceptance.
5. If source-trigger builds `python:3.12-slim`, reject it as INVALID. Only after confirming the captured snapshot is the intended green commit, perform exactly one native redeploy so service-level `v12/staging/Dockerfile` is honored.
6. Accepted build must prove `v12/staging/Dockerfile` + `node:22-alpine`.
7. Verify `/ready`, `RESEARCH_ONLY=true`, `EXECUTION_WRITE=false`.
8. Wait for initial bootstrap, lineage trace probe and seven-market Coverage probe.
9. Verify EU blocker truth exactly as listed above.
10. Search accepted-deployment logs for zero `DURABLE_WRITE_FAILED`, zero `LINEAGE_JOURNAL_CORRUPT`, and zero research refresh failures.
11. Only then change EU provider split status to `LIVE_GREEN`.

## Railway legacy Config-as-Code precedence — OPEN PLATFORM BLOCKER

The existing source-trigger precedence bug remains separate from the current workspace quota blocker.

Rules:

1. Never accept source deployment metadata alone.
2. Require exact tested product code + Node 22/v12 build + `/ready` runtime evidence.
3. Native redeploy only after validating the captured source snapshot.
4. Permanent repair requires authenticated Railway CLI migration scoped only to `foxyya-v12-staging`.
5. Never run an unscoped project migration or `--delete-files`.
6. Do not modify Production Execution V2.

## US Provider Coverage — parked external activations

US remains intentionally fail-closed:

- `INDEX`: `LICENSE_REQUIRED:nasdaq-trader-daily`
- `MARKET_BREADTH`: `LICENSE_REQUIRED:nasdaq-trader-daily`
- `QUOTE`: `API_KEY_REQUIRED:twelve-data-us-quote`
- `VOLATILITY_CONTEXT`: `API_KEY_REQUIRED + ENTITLEMENT_REQUIRED:twelve-data-us-volatility`

CFTC `FUTURES_POSITIONING` remains LIVE_GREEN as weekly confirmation-only evidence.

## After EU split live acceptance

Do not start these before the provider split is live-accepted unless the Railway quota remains externally blocked for an extended period and a separate code-only task is deliberately chosen.

Recommended order:

1. EU breadth adapter + credential/entitlement-gated loader/binding/runtime wiring, following the same fail-closed pattern used for US Twelve Data sources.
2. EU INDEX stays license-blocked until a valid Cboe data license exists.
3. JP / KR activation after real key + entitlement requirements are available.
4. CN_HK approved data-product path.
5. Home decision-readiness UX refinement and direction eligibility integration.
6. Activate US credential-gated providers only with real credentials/entitlements and independent live verification.

## Handoff rule

At every material checkpoint, update `FOXYYA_STATE.json` and this file. When the conversation becomes materially long, proactively checkpoint GitHub/Railway truth and prepare a fresh-chat continuation instruction before context exhaustion. Never conflate branch HEAD, CI success, Railway build metadata, deployment health, and live provider availability.
