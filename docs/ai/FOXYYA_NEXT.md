# FOXYYA v12 — Next Engineering Actions

Updated: 2026-09-15 15:51 +08:00

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

## US Provider Coverage — parked external activations

US remains intentionally fail-closed:

- `INDEX`: `LICENSE_REQUIRED:nasdaq-trader-daily`
- `MARKET_BREADTH`: `LICENSE_REQUIRED:nasdaq-trader-daily`
- `QUOTE`: `API_KEY_REQUIRED:twelve-data-us-quote`
- `VOLATILITY_CONTEXT`: `API_KEY_REQUIRED + ENTITLEMENT_REQUIRED:twelve-data-us-volatility`

CFTC `FUTURES_POSITIONING` remains LIVE_GREEN as weekly confirmation-only evidence.

## After EU split live acceptance

Recommended order:

1. EU breadth adapter + credential/entitlement-gated loader/binding/runtime wiring using the same fail-closed pattern as US Twelve Data sources.
2. EU INDEX remains license-blocked until a valid Cboe license exists.
3. Railway IaC migration may proceed only from a real CLI `migrate` + `plan` review, preferably with a project token scoped only to Research Staging if moved into GitHub Actions.
4. JP / KR activation after real key + entitlement requirements are available.
5. CN_HK approved data-product path.
6. Home decision-readiness UX refinement and direction eligibility integration.
7. Activate US credential-gated providers only with real credentials/entitlements and independent live verification.

## Handoff rule

At every material checkpoint, update `FOXYYA_STATE.json` and this file. When the conversation becomes materially long, proactively checkpoint GitHub/Railway truth and prepare a fresh-chat continuation instruction before context exhaustion. Never conflate branch HEAD, CI success, Railway build metadata, deployment health, provider availability, or an agent prediction with live evidence.
