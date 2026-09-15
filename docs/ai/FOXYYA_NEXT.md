# FOXYYA v12 — Next Engineering Actions

Updated: 2026-09-15 16:08 +08:00

## Live Research Staging

Current accepted live deployment remains unchanged:

- deployment `6cedb435-a175-4cb8-85bd-ffa1b70a5fd3`
- product commit `dc56501497bf1095ad0509678889197fe6762f44`
- SUCCESS
- Node/v12, `/ready`
- `RESEARCH_ONLY=true`
- `EXECUTION_WRITE=false`
- Production Execution V2 untouched

New deployment creation remains externally blocked by Railway's `You have used all your available resources`. Runtime RAM/disk saturation has been ruled out. An hourly condition watch is active for the EU release candidate and must not spam retries while blocked.

## Fully-green product code ahead of live

Latest fully-green product commit:

`efde7c4201a5cc80300120ec811f11a64e00c54b`

CI run `34944945541`:

- v12 Node: 752 / 752 PASS
- existing JS regressions: 16 / 16 PASS
- Python regression: PASS
- Production safety gate: PASS
- Staging + backup container smoke: PASS
- Production release authorized: false

This commit includes both the EU and CN_HK provider-governance improvements. Do not call them live until a new Research Staging deployment is accepted.

## EU provider split — CODE GREEN / LIVE PENDING

- `cboe-europe-index` → `INDEX` → `LICENSE_REQUIRED`
- `twelve-data-eu-breadth` → `MARKET_BREADTH` → `API_KEY_REQUIRED + ENTITLEMENT_REQUIRED`
- generic `eu-equity-realtime` retired
- no live provider request added
- no readiness promotion

Expected EU live truth remains BLOCKED / direction PARTIAL with MACRO available.

## CN_HK provider split — CODE GREEN / LIVE PENDING

TDD evidence:

- RED `865eca29aade49aa680db5954240567cb6de1ace`: 752 tests / 750 pass / 2 expected new failures.
- initial GREEN `4f2ccf6619e31c40147b3aa7421cd337305041dc`: new contracts passed; only two stale `hkex-marketplace` tests remained.
- final GREEN `efde7c4201a5cc80300120ec811f11a64e00c54b`: full CI success.

Capability-specific sources:

- `hkex-eod-summary` → `HISTORICAL_PRICE` via `HISTORICAL_DATA` → `DATA_PRODUCT_REQUIRED + LICENSE_REVIEW_REQUIRED`
- `hkex-omd-index` → `INDEX` → `LICENSE_REQUIRED`
- `sse-market-data` → `INDEX + MARKET_BREADTH` → product/license-review blocked
- `szse-ssic-market-data` → `INDEX + MARKET_BREADTH` → product/license-review blocked
- generic `hkex-marketplace` retired
- Stock Connect remains confirmation-only
- no live network loaders added
- no scraping
- no readiness promotion

CN_HK remains `BLOCKED / NOT_READY / NOT_READY / NOT_ELIGIBLE` until real licensed paths exist.

## JP provider resolution — RESEARCH COMPLETE / BOUNDED DESIGN READY

Current individual research source remains separate:

- `jpx-jquants` covers individual research such as historical price and fundamentals behind key + entitlement.
- JPX states J-Quants API is for individuals; corporate machine-readable distribution is J-Quants Pro via API/SFTP. Do not silently reuse an individual licence for corporate use.

For JP market-direction data, the authoritative path is TSE Market Information:

- official TSE Market Information contains JPX indices including TOPIX.
- its periodic statistic data includes the number of issues rising/declining.
- therefore it is a technically valid source family for both `INDEX` and `MARKET_BREADTH`.
- direct/indirect acquisition is governed by TSE information-provision/licensing procedures.
- the 15-minute Last Sales API is not a substitute: JPX explicitly states `Index and Statistics: Not included`.

### Proposed bounded JP catalog/Coverage design

Do not add a live loader yet.

1. Add `tse-market-information` for market `JP`.
2. Capabilities: `INDEX`, `MARKET_BREADTH`.
3. Status: `LICENSE_REQUIRED`.
4. Authority: `OFFICIAL` or `LICENSED` with `accessClass=COMMERCIAL_LICENSE`; `serverOnly=true`, `liveEligible=false`, `evidenceRole=MARKET_CORE`.
5. Preserve `jpx-jquants` as the separate research source for `HISTORICAL_PRICE` + `FUNDAMENTAL` behind key + entitlement.
6. Replace JP `NOT_IMPLEMENTED` direction blockers with `LICENSE_REQUIRED:tse-market-information` blockers.
7. JP must remain `coverageStatus=BLOCKED`, `directionReadiness=NOT_READY`, and no ranking/readiness promotion occurs.
8. No TSE public-page scraping, no network request, no Production change.
9. Implement with RED → minimal catalog GREEN → full v12/JS/Python/Production safety/container smoke.

This is the next bounded code change and requires design approval before implementation.

## KR provider resolution — EXISTING GOVERNANCE IS ALIGNED

No provider replacement is currently needed.

- `krx-openapi` is the appropriate official source family.
- KRX terms require an Authentication Key.
- API usage requires selecting a service, applying for use, and administrator approval.
- official service list includes KRX/KOSPI/KOSDAQ index daily price data and KOSPI/KOSDAQ/KONEX stock daily trading data.
- current `API_KEY_REQUIRED + ENTITLEMENT_REQUIRED` governance therefore remains appropriate.
- real-time/professional KRX market data is a separate contracted distribution path through KRX/Koscom; do not infer real-time rights from Open API.

KR stays externally activation-blocked until a real key/service approval is supplied. Do not add speculative provider code now.

## Railway IaC migration

Legacy `railway.toml` is deprecated and remains a known source-trigger precedence risk. Correct target is `.railway/railway.ts` through a real scoped Railway CLI migration and plan.

- do not trust agent-predicted migration output
- Railway agent cannot run CLI
- no `.railway/` directory exists yet
- no `--delete-files` on first migration
- do not delete root `railway.toml` or modify Production Execution V2 in a staging-only migration
- apply only after a real plan proves variables, `/data` volume, backup-helper reference, Node Dockerfile and `/ready` are preserved without unrelated deletes

## Parked external activations

US:
- INDEX / MARKET_BREADTH require a licensed path
- QUOTE requires real Twelve Data key
- VOLATILITY_CONTEXT requires real Twelve Data key + entitlement

EU:
- INDEX requires Cboe licence
- MARKET_BREADTH requires Twelve Data key + Cboe Europe entitlement

CN_HK:
- historical/index/breadth require licensed HKEX/SSE/SZSE data-product paths

JP:
- direction requires TSE Market Information licensed path

KR:
- KRX Open API key + service approval required

## Execution order

1. Keep the hourly EU deployment condition watch active.
2. On explicit approval of the bounded JP design above, implement JP catalog/Coverage blocker truth with TDD only; no live loader.
3. Keep KR code unchanged until real key/approval exists.
4. Do not begin Home decision-readiness UX changes until provider-governance truth is stable across all seven markets.
5. Railway IaC migration requires real scoped CLI access.
6. Never weaken Coverage gates just to make a market READY.

## Handoff rule

At every material checkpoint, update `FOXYYA_STATE.json` and this file. Revalidate GitHub and Railway truth before execution. Never conflate branch HEAD, CI success, Railway source metadata, deployment health, provider availability, or agent predictions with live evidence.
