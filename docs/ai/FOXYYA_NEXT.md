# FOXYYA v12 — Next Engineering Actions

Updated: 2026-09-15 16:05 +08:00

## Research Staging — accepted live checkpoint remains unchanged

- Accepted live product commit: `dc56501497bf1095ad0509678889197fe6762f44`.
- Accepted Railway deployment: `6cedb435-a175-4cb8-85bd-ffa1b70a5fd3`, SUCCESS.
- Runtime: Node/v12, `/ready`, `RESEARCH_ONLY=true`, `EXECUTION_WRITE=false`.
- Production Execution V2 remains untouched.
- Runtime resources remain healthy and well below limits.

Railway new-deployment capacity remains externally blocked by `You have used all your available resources`. The hourly EU deployment condition watch remains active. Do not spam deploy retries while the blocker persists.

## EU provider split — CODE GREEN / LIVE PENDING

Fully-green product commit: `d659c8947524f8bb20139f7be36121d55316acfc`.
CI run `34942196866`: 750/750 v12, 16/16 JS, Python PASS, Production safety PASS, container smoke PASS.

Expected fail-closed EU truth after a future accepted staging deployment:

- `INDEX` → `cboe-europe-index` → `LICENSE_REQUIRED`.
- `MARKET_BREADTH` → `twelve-data-eu-breadth` → `API_KEY_REQUIRED + ENTITLEMENT_REQUIRED`.
- EU stays BLOCKED / direction PARTIAL with MACRO available.

Do not mark LIVE_GREEN until Railway capacity returns and live acceptance passes.

## CN_HK provider split — CODE GREEN / LIVE PENDING

TDD is complete.

RED:
- commit `865eca29aade49aa680db5954240567cb6de1ace`
- 752 tests / 750 pass / 2 expected failures, only the new CN_HK provider-resolution contracts.

Initial GREEN:
- commit `4f2ccf6619e31c40147b3aa7421cd337305041dc`
- product catalog split implemented; only two stale tests still referred to retired `hkex-marketplace`.

Final GREEN:
- commit `efde7c4201a5cc80300120ec811f11a64e00c54b`
- GitHub Actions run `34944945541` — SUCCESS.
- v12 Node: 752 / 752 PASS.
- existing JavaScript regressions: 16 / 16 PASS.
- Python regression: PASS.
- Production safety gate: PASS.
- Staging + backup container smoke: PASS.
- Production release authorized: false.

### CN_HK catalog truth

Generic `hkex-marketplace` is retired and replaced with capability-specific fail-closed sources:

- `hkex-eod-summary`
  - HKEX Data Marketplace End of Day / End of Session Summary.
  - normalizes to `HISTORICAL_PRICE` through `HISTORICAL_DATA`.
  - `REVIEW_REQUIRED`, `PRODUCT_DEPENDENT`.
  - expected blockers: `DATA_PRODUCT_REQUIRED` + `LICENSE_REVIEW_REQUIRED`.
  - no live loader.

- `hkex-omd-index`
  - HKEX OMD Index Datafeed.
  - `INDEX`.
  - `LICENSE_REQUIRED`.
  - no live loader.

- `sse-market-data`
  - official Shanghai Stock Exchange market data interfaces.
  - `INDEX` + `MARKET_BREADTH`.
  - `REVIEW_REQUIRED`, `PRODUCT_DEPENDENT`.
  - expected blockers: `DATA_PRODUCT_REQUIRED` + `LICENSE_REVIEW_REQUIRED`.
  - no public-page scraping or live loader.

- `szse-ssic-market-data`
  - Shenzhen Securities Information Co. / SZSE Market Data Services.
  - `INDEX` + `MARKET_BREADTH`.
  - `REVIEW_REQUIRED`, `PRODUCT_DEPENDENT`.
  - expected blockers: `DATA_PRODUCT_REQUIRED` + `LICENSE_REVIEW_REQUIRED`.
  - no live loader.

CN_HK remains intentionally:
- `coverageStatus=BLOCKED`
- `directionReadiness=NOT_READY`
- `researchReadiness=NOT_READY`
- `rankingEligibility=NOT_ELIGIBLE`
- missing `HISTORICAL_PRICE`, `INDEX`, `MARKET_BREADTH`
- no `NOT_IMPLEMENTED` blocker for those capabilities in the green code.

Stock Connect statistics remain confirmation-only and cannot satisfy market breadth.

Do not attempt to activate these sources until a valid licensed/product path exists.

## Railway Config-as-Code / IaC migration

Legacy `railway.toml` remains a known staging precedence risk and is deprecated by Railway. Correct migration target is `.railway/railway.ts` through a real Railway CLI `config migrate --service foxyya-v12-staging` followed by `config plan` review.

- No `.railway/` directory exists yet.
- Do not trust prior agent-predicted `railway.json` output; the Railway agent cannot execute CLI.
- Do not use `--delete-files` on first migration.
- Do not delete root `railway.toml` or change Production Execution V2 in a Staging-only migration.
- Apply only after a real scoped CLI plan shows zero unexpected destructive changes and preserves variables, `/data` volume and backup-helper reference.

## US Provider Coverage — parked external activation

US remains fail-closed:

- `INDEX`: `LICENSE_REQUIRED:nasdaq-trader-daily`
- `MARKET_BREADTH`: `LICENSE_REQUIRED:nasdaq-trader-daily`
- `QUOTE`: `API_KEY_REQUIRED:twelve-data-us-quote`
- `VOLATILITY_CONTEXT`: `API_KEY_REQUIRED + ENTITLEMENT_REQUIRED:twelve-data-us-volatility`

CFTC `FUTURES_POSITIONING` remains LIVE_GREEN, confirmation-only.

## Current code-only priority while Railway deploy capacity is blocked

### JP INDEX + MARKET_BREADTH provider resolution

J-Quants already covers individual research (`HISTORICAL_PRICE`, `FUNDAMENTAL`) behind key + entitlement, but the JP direction profile still lacks verified `INDEX` and `MARKET_BREADTH` source paths.

Next actions:

1. Research current official/licensed JP market-data products and APIs for TOPIX / broad index context and advances-declines or equivalent breadth.
2. Separate individual J-Quants research from market-direction data rights.
3. Verify server-side/non-display rights, delivery mechanism, latency, historical/live availability and predictable cost.
4. Prefer JPX official / licensed distribution paths; do not scrape public market pages.
5. Classify each source using existing blocker vocabulary (`API_KEY_REQUIRED`, `ENTITLEMENT_REQUIRED`, `LICENSE_REQUIRED`, `DATA_PRODUCT_REQUIRED`, `LICENSE_REVIEW_REQUIRED`).
6. Once source resolution is complete, present a bounded catalog/Coverage design before TDD implementation.
7. No live network loader or readiness promotion until explicit external rights/credentials exist.

## Execution order

1. Keep EU deployment condition watch active.
2. Resolve JP INDEX + MARKET_BREADTH provider path next.
3. Then resolve KR gaps not already covered by KRX OpenAPI.
4. Continue Home decision-readiness UX only after provider-governance truth is stable.
5. Railway IaC migration remains blocked on real scoped CLI access.
6. Never weaken Coverage gates to make a market appear READY.

## Handoff rule

At every material checkpoint, update `FOXYYA_STATE.json` and this file. Revalidate GitHub and Railway truth before execution. Never conflate branch HEAD, CI success, Railway source metadata, deployment health, provider availability, or agent predictions with live evidence.
