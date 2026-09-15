# FOXYYA v12 — Next Engineering Actions

Updated: 2026-09-15 — user scope reduction

## Current scope override — 2026-09-15

User requested: 「先取消日本中國歐洲」, with limited budget.

- Active scope: **CRYPTO / US / TW / KR**. The existing combined **CN_HK** group is deferred with JP and EU.
- Remove deferred regions from Home cards, Home coverage API, default bootstrap and current acceptance/activation backlog. The default bootstrap no longer schedules three ECB requests (fixture cycle: 17 → 14 fetches).
- Preserve archived provider adapters, explicit pipeline paths, historical records and lineage. Archived provider tests remain regression protection, not launch requirements.
- No paid upgrade, new service, Production Execution V2 edit, data deletion, restart or deployment is part of this change.
- Railway trial expired at **2026-09-15 13:49:55 UTC**; Production and Staging deployments were removed. Earlier live-health statements below are historical, superseded observations. CI success does not resolve runtime/resource availability or establish that the earlier Production OOM is fixed.
- Current blockers: hosting/runtime availability under the budget constraint, US licensed data/credentials, KR key/service approval. JP/CN_HK/EU purchases and activation are deferred, not current blockers.
- After any separately authorized future Staging deployment, verify `/ready`, lineage trace and **four-market** coverage. Do not infer live readiness from this code change.

Verification for this change: v12 **774/774 PASS**, existing JavaScript **16/16 PASS**, Python **1/1 PASS**, changed-path scope gate and `git diff --check` PASS. Remote CI pending; container smoke not run locally (Docker unavailable); no deployment performed. The evidence below applies only to earlier checkpoints.

## Historical checkpoint and retained implementation notes

All sections below record the prior seven-market plan; current scope and runtime status above take precedence.



## Previously accepted Research Staging

The accepted Railway live deployment is intentionally still the older validated checkpoint:

- deployment `6cedb435-a175-4cb8-85bd-ffa1b70a5fd3`
- product commit `dc56501497bf1095ad0509678889197fe6762f44`
- status: SUCCESS
- runtime: Node/v12
- healthcheck: `/ready`
- `RESEARCH_ONLY=true`
- `EXECUTION_WRITE=false`
- backup helper remains SUCCESS
- Production Execution V2 remains untouched

Do not describe newer provider-governance code as live until Railway creates and accepts a new deployment.

## Latest fully-green product checkpoint

Latest fully-green product commit:

`93ec3895ab8cda90f446de22cff60f777cd421e3`

GitHub Actions run:

`34948123788` — SUCCESS

Fresh verification evidence:

- v12 Node contracts/integration: **772 / 772 PASS**
- existing JavaScript regressions: **16 / 16 PASS**
- Python regression: **1 / 1 PASS**
- Production safety gate: **PASS**
- isolated Staging + backup container smoke: **PASS**
- smoke image: `node:22-alpine`
- smoke runtime: `RESEARCH_ONLY=true`, `EXECUTION_WRITE=false`
- lineage trace probe: PASS
- seven-market Coverage probe: PASS
- Production release authorized: false

This product checkpoint contains all currently implementable provider-governance and fail-closed improvements that do not require new exchange licences, provider credentials/entitlements, Railway deployment capacity, or Production changes.

## JP provider split — DEFERRED / archived code green

JP market-direction governance is now explicit.

- research source remains `jpx-jquants`
  - historical price / fundamentals
  - API key + entitlement gated
- direction source is now `tse-market-information`
  - `INDEX`
  - `MARKET_BREADTH`
  - `LICENSE_REQUIRED`
  - `liveEligible=false`
  - `MARKET_CORE`
- the former JP `NOT_IMPLEMENTED` direction gaps are replaced by explicit TSE licence blockers
- no TSE network loader was added
- no readiness promotion occurred

TDD:

- RED `ecda825007a64ec64373c0f5edd05a0324358d9a`
- GREEN `80d22cb8f08888e21d8871e632d6c1c0e97fb02a`

JP remains fail-closed until a valid TSE Market Information licence and appropriate J-Quants plan exist.

## KR provider audit — NO PRODUCTION CHANGE REQUIRED

Existing governance is already aligned:

- provider: `krx-openapi`
- official KRX Data Marketplace Open API
- Authentication Key required
- per-service usage application / administrator approval represented as entitlement gate
- normalized capabilities already cover:
  - `QUOTE`
  - `INDEX`
  - `MARKET_BREADTH`
- Coverage already exposes `API_KEY_REQUIRED + ENTITLEMENT_REQUIRED`
- no speculative replacement provider was added

KR stays externally blocked until a real key and service approval are available.

## EU provider governance — CODE GREEN / LIVE PENDING

### INDEX

- provider: `cboe-europe-index`
- capability: `INDEX`
- blocker: `LICENSE_REQUIRED`
- no live activation

### MARKET_BREADTH

`twelve-data-eu-breadth` is now implemented end-to-end through the Research Staging code path while remaining fail-closed by default.

Canonical contract:

- dataset: `TWELVEDATA:BREADTH:EU`
- entity: `MARKET:EU:BREADTH:CBOE_EUROPE`
- scope: `PAN_EUROPE_CBOE_EQUITIES`
- canonical schema observations use `foxyya-context-observation/1`
- snapshot derives total / advancers / decliners / unchanged / advance ratio / decline ratio
- breadth `observedAt` is bounded by the oldest constituent quote time

Safety / access control:

- missing API key => zero provider requests
- key without entitlement => zero provider requests
- key + entitlement => read-only request path permitted
- key never appears in URL, public result, lineage or sanitized error output
- only approved Twelve Data HTTPS `/quote` origin/path is accepted
- default Staging has no verified EU breadth key + entitlement, therefore live activation remains false

TDD chain:

- adapter RED `73d66894e1c8cba50251f5aea39f8579901c4517`
- adapter GREEN `dbf4e84bb80e8c31fb0fa54c8623b8e7cb59d470`
- loader RED `9e36e09ad742cb45e3247e82cd4858f32403adce`
- loader GREEN `42b6ddd4192b0c2da578ec040b5ee4ebfc9350cc`
- binding RED `103c05072df404f9a59ed785fe1b3394e548eb7b`
- binding GREEN `85851464eb61735e53f523c177c894a87d379862`
- pipeline RED `77295c3ab42a67850599e9a33047a3b0d7c0f993`
- pipeline wiring `ce94a5e62a214290a01969b0a91caab7cd4ddcbc`
- Coverage mapping `45ff2536e15c2d424b4a67e21cffcf945a69ca44`

When a valid EU breadth key + entitlement is eventually supplied, an AVAILABLE dataset may grant only `MARKET_BREADTH`. EU remains BLOCKED until the separate Cboe `INDEX` licence requirement is satisfied.

## CN_HK provider split — CODE GREEN / LIVE PENDING

Capability-specific governance is complete:

- `hkex-eod-summary`
  - historical price path
  - `DATA_PRODUCT_REQUIRED + LICENSE_REVIEW_REQUIRED`
- `hkex-omd-index`
  - `INDEX`
  - `LICENSE_REQUIRED`
- `sse-market-data`
  - `INDEX + MARKET_BREADTH`
  - product/license-review blocked
- `szse-ssic-market-data`
  - `INDEX + MARKET_BREADTH`
  - product/license-review blocked
- generic `hkex-marketplace` retired
- Stock Connect remains confirmation-only
- no scraping
- no live loaders
- no readiness promotion

Final CN_HK green checkpoint: `efde7c4201a5cc80300120ec811f11a64e00c54b`.

## Home decision-readiness integration — CODE GREEN

Home now consumes backend Coverage truth more safely without recomputing market readiness.

### Backend truth preservation

- `marketCoverage` is still returned by reference from the backend read model.
- Home now exposes an immutable `decisionReadiness` projection containing only:
  - `coverageStatus`
  - `directionReadiness`
  - `researchReadiness`
  - `rankingEligibility`
  - `missingCapabilities`
  - blocker summaries
- the browser/view model does not independently decide that a market is READY.

### Ranking guard

- `rankingEligibility=NOT_ELIGIBLE`
  - research rows remain visible for inspection
  - row does **not** enter `Ranking.rankResearch()`
  - `rank`, `researchScore`, priority and ranking metadata are cleared
- `LIMITED`
  - may remain in human-review ranking
- `ELIGIBLE`
  - may remain in human-review ranking
- older snapshots with no `marketCoverage` preserve legacy ranking behavior

TDD:

- RED `bb2394bfdaa2d6173bec898302ed939603278c6e`
- GREEN `93ec3895ab8cda90f446de22cff60f777cd421e3`

## Railway deployment queue — EXTERNAL BLOCKER

New deployment creation is still blocked before Railway produces a deployment ID with:

`You have used all your available resources`

Historical observation before trial expiry: services were healthy at that checkpoint. They are now removed; do not treat this as current runtime evidence.

The hourly condition watch remains active. Its release target must now be the latest fully-green product commit:

`93ec3895ab8cda90f446de22cff60f777cd421e3`

When Railway deployment capacity returns:

1. Revalidate branch ancestry and ensure there are no untested later product-code commits.
2. Target only the existing `foxyya-v12-staging` service.
3. Do not create a new service and do not modify the backup helper or Production Execution V2.
4. Inspect source-trigger build logs.
5. If the source-trigger uses root Production `python:3.12-slim`, reject it as INVALID.
6. Only after verifying the captured snapshot is the intended fully-green code may one native redeploy be used.
7. Accepted build must use `v12/staging/Dockerfile` + `node:22-alpine`.
8. Verify `/ready`, `RESEARCH_ONLY=true`, `EXECUTION_WRITE=false`.
9. Wait for initial bootstrap, lineage trace probe and four-market Coverage probe.
10. Verify live blocker truth for US / TW / CRYPTO / KR.
11. Verify Home decision-readiness projection is present and marketCoverage is still authoritative.
12. Confirm zero `DURABLE_WRITE_FAILED`, zero `LINEAGE_JOURNAL_CORRUPT`, zero research refresh failure.
13. Only then mark the latest checkpoint LIVE_GREEN.

## Railway IaC migration — REAL CLI REQUIRED

Legacy `railway.toml` Config as Code remains deprecated and is still a known precedence risk.

Permanent migration requires a real Railway CLI path:

- target: `.railway/railway.ts`
- `railway config migrate --service foxyya-v12-staging`
- first run without `--apply`
- then `railway config plan`
- single-service migration should use a named partial
- review for zero destructive changes
- preserve variables, `/data` volume, backup-helper reference, Node Dockerfile and `/ready`
- do not use `--delete-files` on the first migration
- do not delete root `railway.toml` as part of a Staging-only migration without an approved complete plan
- Railway agent cannot execute the CLI, so predicted migration output is not evidence

## Current external activation blockers

These are the only major provider paths that cannot be completed autonomously from code alone:

- Railway: trial expired; runtime removed; no paid upgrade authorized
- Railway IaC: real scoped CLI auth / plan
- US INDEX + MARKET_BREADTH: valid licensed market-data path
- US QUOTE: real Twelve Data Staging API key
- US VOLATILITY_CONTEXT: real Twelve Data key + entitlement + symbol verification
- KR: KRX Open API key + service approval

Do not bypass these gates or fabricate availability.

## Current execution status

All provider-governance / fail-closed / Home readiness code-only work currently identified in the completion plan is implemented and fully regression-tested.

Preserve the reduced-scope code without new spending or automatic redeployment. Any condition watch must be read-only under the current cost-saving instruction. Deferred JP/CN_HK/EU work must not be resumed without a new user request.

## Handoff rule

At every material checkpoint, update `FOXYYA_STATE.json` and this file. Before any future code or deployment action, revalidate GitHub branch/CI and Railway live truth. Never conflate branch HEAD, CI success, source metadata, build metadata, deployment health or provider availability.
