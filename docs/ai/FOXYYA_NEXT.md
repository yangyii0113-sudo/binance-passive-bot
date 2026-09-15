# FOXYYA v12 — Next Engineering Actions

Updated: 2026-09-15 15:55 +08:00

## Research Staging — current accepted live checkpoint

The currently accepted live Research Staging deployment remains unchanged and healthy:

- Accepted live product commit: `dc56501497bf1095ad0509678889197fe6762f44`.
- Accepted Railway deployment: `6cedb435-a175-4cb8-85bd-ffa1b70a5fd3`, SUCCESS.
- Runtime: Node/v12, `RESEARCH_ONLY=true`, `EXECUTION_WRITE=false`.
- Healthcheck: `/ready`.
- Production Execution V2 was not modified.
- Current Staging resource usage is low: ~0.040 GB RAM / 1 GB limit, disk ~0.060 GB; backup helper RAM ~0.018 GB. The current deploy blocker is not a FOXYYA runtime memory/disk saturation problem.

## EU INDEX + MARKET_BREADTH provider split — CODE GREEN / LIVE DEPLOYMENT PENDING

Exact fully-green product commit:

- `d659c8947524f8bb20139f7be36121d55316acfc`
- GitHub Actions run `34942196866` — SUCCESS.
- v12 Node: 750 / 750 PASS.
- existing JavaScript regressions: 16 / 16 PASS.
- Python regression: PASS.
- Production safety gate: PASS.
- Staging + backup container smoke: PASS.
- Production release authorized: false.

EU catalog/Coverage truth in the green code:

- `cboe-europe-index` → EU `INDEX` → `LICENSE_REQUIRED`, `liveEligible=false`, pan-European index scope.
- `twelve-data-eu-breadth` → EU `MARKET_BREADTH` → `KEY_REQUIRED`, server-only credential, entitlement required, `liveEligible=false`, Cboe Europe pan-European equity scope.
- Generic `eu-equity-realtime` is retired.
- This step does not make any live EU provider request and does not promote EU readiness.

Expected live EU Coverage after deployment remains fail-closed:

- `coverageStatus=BLOCKED`
- `directionReadiness=PARTIAL`
- `researchReadiness=NOT_READY`
- `rankingEligibility=NOT_ELIGIBLE`
- `MACRO` available
- missing `INDEX`, `MARKET_BREADTH`
- blocker `LICENSE_REQUIRED:INDEX:cboe-europe-index`
- blocker `API_KEY_REQUIRED:MARKET_BREADTH:twelve-data-eu-breadth`
- blocker `ENTITLEMENT_REQUIRED:MARKET_BREADTH:twelve-data-eu-breadth`
- no `PROVIDER_DECISION_REQUIRED` blocker for EU breadth.

## Current deploy blocker — external Railway deployment resource/agent limit

Three exact deployment attempts for `d659c894...` were rejected before a deployment ID was created with:

`You have used all your available resources`

Do not classify this as application OOM, storage high-water, or GitHub CI failure. Current live workloads remain SUCCESS and resource usage is low. Railway documentation also states that exhausted billing credits stop workloads; that is not the currently observed state. Treat the precise account-side cause as an external Railway deployment resource/agent allocation blocker unless dashboard billing/plan data proves otherwise.

An hourly condition watch is enabled. While the blocker remains, it must not spam deployment retries or notifications. When deployment capacity is available, it should attempt the exact green commit once and run the full live acceptance below.

## Exact live acceptance once deployment capacity returns

1. Revalidate branch ancestry. Continuity/docs commits may be newer, but product code must still equal `d659c894...` or a newly fully-green descendant.
2. Target the existing `foxyya-v12-staging` service only; do not create a new service.
3. Inspect source-trigger build logs before acceptance.
4. If it uses root Production `python:3.12-slim`, reject the deployment as INVALID. After confirming the captured source snapshot is the intended green code, perform at most one native redeploy of that snapshot.
5. Accepted build must prove `v12/staging/Dockerfile` + `node:22-alpine`.
6. Verify `/ready`, `RESEARCH_ONLY=true`, `EXECUTION_WRITE=false`.
7. Wait for initial bootstrap, lineage trace probe and seven-market Coverage probe.
8. Verify the exact EU blockers listed above.
9. Confirm zero `DURABLE_WRITE_FAILED`, zero `LINEAGE_JOURNAL_CORRUPT`, and zero research refresh failures.
10. Only then mark the EU provider split `LIVE_GREEN` and update continuity.

## Railway Config-as-Code precedence — migration path corrected

Railway's current official documentation states that `railway.json` / `railway.toml` Config as Code is deprecated and existing legacy services stop reading it on 2026-12-01. Legacy CaC still overrides dashboard values during deploy today.

This matches FOXYYA's known conflict:

- root `railway.toml` points to Production `Dockerfile`, `/health`, restart `ALWAYS`.
- `v12/staging/railway.toml` points to `v12/staging/Dockerfile`, `/ready`, `ON_FAILURE`.
- A previous correct source snapshot built the root Production Python image, proving the precedence risk is real.

Do not attempt to set the legacy Railway config-file path again; Railway now rejects that operation as deprecated.

Correct migration target:

- `.railway/railway.ts` using Railway Infrastructure as Code.
- Railway CLI 5.42.1 or newer.
- Single-service migration command: `railway config migrate --service foxyya-v12-staging` without `--apply` first.
- Official docs state a single-service migrate writes a named `partial` export.
- Follow with `railway config plan` and review the exact plan before apply.
- Do not use `--delete-files` during first migration.
- Do not delete root `railway.toml` or modify Production Execution V2 as part of a Staging-only migration.
- Railway agent cannot actually execute the CLI or access a repo checkout; any predicted `railway.json` migration output from the agent is invalid evidence and must not be used.
- The repository currently has no `.railway/` directory.

Authoritative IaC SDK schema confirms low-level service build configuration supports `build.dockerfilePath`, but no hand-written migration should be applied until a real CLI `migrate/plan` confirms existing variables and the `/data` volume will be preserved without destructive changes.

## CN_HK provider resolution — RESEARCH COMPLETE / CODE NOT STARTED

The next provider path has now been resolved without weakening current Coverage semantics.

### Hong Kong historical price

Recommended source family:

- `hkex-eod-summary`
- HKEX Data Marketplace End of Day / End of Session Summary products.
- Capability target: `HISTORICAL_PRICE`.
- Coverage: HKEX Main Board + GEM.
- Treat as `DATA_PRODUCT_REQUIRED` plus license-controlled use.
- Delivery is product-dependent through S3, SFTP, direct download/email-style delivery.
- Do not scrape HKEX public display pages as a substitute.

### Hong Kong / China index context

Recommended source family:

- `hkex-omd-index`
- HKEX OMD Index Datafeed.
- Capability target: `INDEX`.
- OMD carries HK and China-related third-party indices, including Hang Seng family and selected CSI/SSE index families.
- Index compiler licences remain separately required; this is therefore `LICENSE_REQUIRED`, not public-use data.

### Mainland Shanghai market data

Recommended source family:

- `sse-market-data`
- Official Shanghai Stock Exchange market data interfaces.
- Capability targets: `INDEX`, `MARKET_BREADTH`.
- Technical interfaces exist, but public website/interface specifications do not constitute permission for automated server-side research consumption.
- Keep fail-closed as `LICENSE_REVIEW_REQUIRED` / `DATA_PRODUCT_REQUIRED` until an authorized distribution path is contracted.

### Mainland Shenzhen market data

Recommended source family:

- `szse-ssic-market-data`
- Shenzhen Securities Information Co. / SZSE Data Services.
- Capability targets: `INDEX`, `MARKET_BREADTH`.
- SZSE states SSIC is exclusively authorized to manage and distribute SZSE securities information and offers Level-1, Level-2 and end-of-day market data services.
- Treat as `LICENSE_REQUIRED` / `DATA_PRODUCT_REQUIRED`; public quote pages are not an approved server-side feed.

### Stock Connect

HKEX Shanghai-Hong Kong and Shenzhen-Hong Kong Stock Connect daily statistics can be useful as confirmation/flow context only. They must not satisfy `MARKET_BREADTH` or complete CN_HK direction readiness.

### Recommended bounded code change

Do not add any live CN_HK network loader yet.

The next code change should only improve provider governance and blocker truth:

1. Retire or narrow the generic `hkex-marketplace` catalog entry.
2. Add capability-specific fail-closed catalog entries:
   - `hkex-eod-summary` → `HISTORICAL_PRICE` → product/license blocked.
   - `hkex-omd-index` → `INDEX` → license blocked.
   - `sse-market-data` → `INDEX` + `MARKET_BREADTH` → product/license-review blocked.
   - `szse-ssic-market-data` → `INDEX` + `MARKET_BREADTH` → product/license blocked.
3. Replace CN_HK `NOT_IMPLEMENTED` direction blockers with explicit external license/data-product blockers.
4. Preserve `coverageStatus=BLOCKED`, `directionReadiness=NOT_READY`, `researchReadiness=NOT_READY`, `rankingEligibility=NOT_ELIGIBLE`.
5. No live API requests, no scraping, no readiness promotion, no Production Execution V2 changes.
6. Use RED → minimal GREEN → full v12/JS/Python/Production safety/container smoke before any deployment attempt.

## US Provider Coverage — parked external activations

US remains intentionally fail-closed:

- `INDEX`: `LICENSE_REQUIRED:nasdaq-trader-daily`
- `MARKET_BREADTH`: `LICENSE_REQUIRED:nasdaq-trader-daily`
- `QUOTE`: `API_KEY_REQUIRED:twelve-data-us-quote`
- `VOLATILITY_CONTEXT`: `API_KEY_REQUIRED + ENTITLEMENT_REQUIRED:twelve-data-us-volatility`

CFTC `FUTURES_POSITIONING` remains LIVE_GREEN as weekly confirmation-only evidence.

## Current execution order while Railway deploy is externally blocked

1. Keep the hourly EU deployment condition watch active; do not spam deploy attempts.
2. CN_HK capability-specific provider split is the next code-only task once its bounded design is approved.
3. Railway IaC migration may proceed only from a real CLI `migrate` + `plan` review, preferably with a project token scoped only to Research Staging if moved into GitHub Actions.
4. EU breadth adapter + credential/entitlement-gated loader/binding/runtime wiring remains parked until the EU provider split is live-accepted.
5. JP / KR activation remains parked until real key + entitlement requirements are available.
6. Home decision-readiness UX refinement and direction eligibility integration can follow provider-governance cleanup.
7. Activate US credential-gated providers only with real credentials/entitlements and independent live verification.

## Handoff rule

At every material checkpoint, update `FOXYYA_STATE.json` and this file. When the conversation becomes materially long, proactively checkpoint GitHub/Railway truth and prepare a fresh-chat continuation instruction before context exhaustion. Never conflate branch HEAD, CI success, Railway build metadata, deployment health, provider availability, or an agent prediction with live evidence.
