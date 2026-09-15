# FOXYYA v12 — Next Engineering Actions

Updated: 2026-09-15 09:42 +08:00

## Research Staging — LIVE_ACCEPTED

The current accepted Research Staging checkpoint has passed the runtime acceptance gate.

- Product commit: `c547909ad9baea7cbdd13416b82976b86b5b685a`.
- GitHub Actions: `34872550419` — SUCCESS.
  - v12 Node: 730 / 730 passed.
  - existing JavaScript regressions: 16 / 16 passed.
  - Python regression: 1 / 1 PASS.
  - Production safety gate: PASS.
  - isolated Staging + backup container smoke/default-CMD/persistent restart checks: PASS.
  - Production release authorized: false.
- Accepted Railway deployment: `4798edd3-7ef6-4dbb-93ce-adb6331aa036`, SUCCESS.
- Runtime: Node/v12, `RESEARCH_ONLY=true`, `EXECUTION_WRITE=false`.
- Healthcheck: `/ready`.
- Same deployment observed from bootstrap through scheduled refreshes:
  - `successfulCycles`: 18,
  - `failedCycles`: 0,
  - `consecutiveSuccesses`: 18,
  - `lastFailureAt`: null,
  - publication timestamps increased continuously.
- This exceeds the required bootstrap + 3 scheduled refresh acceptance gate.
- 12-hour resource check remains healthy: memory current ~0.040 GB / 1.0 GB limit, max ~0.125 GB; disk current ~0.05895 GB on the 500 MB `/data` volume.
- P0 storage recovery remains CLOSED.

## Railway legacy Config-as-Code precedence — OPEN PLATFORM BLOCKER

Current service dashboard configuration is correct:

- Dockerfile path: `v12/staging/Dockerfile`.
- healthcheck path: `/ready`.
- `/data` volume remains attached.

However, prior source-trigger deployments proved the root `railway.toml` can still override Staging and build the Production Python image. Therefore:

1. Do not claim the platform-level issue is permanently fixed.
2. For every future source release, accept only a deployment whose build/runtime prove Node 22/v12 and whose `/ready.buildRevision` equals the tested commit.
3. A native redeploy is allowed only after confirming the captured snapshot is the intended fully-green commit.
4. Permanent repair requires an authenticated, service-scoped Railway CLI migration for `foxyya-v12-staging` only.
5. Never run an unscoped project migration, never use `--delete-files`, and never modify the Production Execution V2 Dockerfile/service as part of v12 work.

## Provider Coverage Expansion

### CFTC positioning — LIVE_GREEN

- `cftc-cot` is AVAILABLE live.
- Dataset: `CFTC:TFF:gpe5-46if:EQUITY_INDEX`.
- Capability: `FUTURES_POSITIONING`.
- Weekly confirmation-only evidence.
- Does not grant US direction readiness.

### US QUOTE — IMPLEMENTED, CREDENTIAL-GATED

Twelve Data has already been selected and wired as `twelve-data-us-quote`.

- Server-only credential path implemented.
- Missing key performs zero provider requests.
- API key is not placed in URLs or public diagnostics.
- Quote semantics remain limited-venue / non-NBBO.
- A quote does not grant INDEX or MARKET_BREADTH and does not make US direction READY.
- Live Staging currently has no Twelve Data key, so live Coverage correctly reports:
  - `API_KEY_REQUIRED:QUOTE:twelve-data-us-quote`.

Do not fabricate or infer a key. Live activation can occur only after a real Staging credential is supplied through the approved secret path.

### US INDEX + MARKET_BREADTH — EXTERNAL_LICENSE_REQUIRED

- `LICENSE_REQUIRED:INDEX:nasdaq-trader-daily`
- `LICENSE_REQUIRED:MARKET_BREADTH:nasdaq-trader-daily`

Public download availability is not sufficient permission for FOXYYA automated server-side use. Keep both fail-closed until a valid licensed data-product path exists.

### US VOLATILITY_CONTEXT — CURRENT ENGINEERING PRIORITY AFTER PLATFORM CONFIG BLOCKER

Current live blocker:

- `PROVIDER_DECISION_REQUIRED:VOLATILITY_CONTEXT:us-options-analytics`

Next provider work:

1. Research current legally usable US volatility/options context sources using authoritative terms, non-display/server-side use rights, API availability, latency, Taiwan access and predictable pricing.
2. Classify candidates as `APPROVED_PUBLIC_USE`, `COMMERCIAL_LICENSE_AVAILABLE`, `API_KEY_REQUIRED`, `ENTITLEMENT_REQUIRED`, or `UNSUITABLE`.
3. Do not equate VIX-like public display pages with reusable automated data rights.
4. Select a provider only when the permission boundary is explicit.
5. Write RED contracts before implementation.
6. Required semantics: provider timestamp preserved, receive time separate, stale/delayed state honest, no execution authority, no automatic US direction promotion from a single volatility source.
7. Full v12 + JS + Python + Production safety regression before Staging deployment.

## Live US Coverage truth

US remains intentionally BLOCKED / research PARTIAL with these missing capabilities:

- INDEX — license required.
- MARKET_BREADTH — license required.
- QUOTE — Twelve Data API key required.
- VOLATILITY_CONTEXT — provider decision required.

Available US research capabilities include FUNDAMENTAL, FUTURES_POSITIONING, MACRO and NEWS. Do not promote direction readiness until the Coverage Gate requirements are actually satisfied.

## Subsequent priorities

1. Resolve Railway Staging Config-as-Code migration when authenticated CLI access is available.
2. US VOLATILITY_CONTEXT provider decision and TDD implementation.
3. Activate Twelve Data QUOTE only when a real Staging API key is provided.
4. Revisit US INDEX + MARKET_BREADTH only with a valid license/data-product path.
5. EU INDEX + MARKET_BREADTH.
6. JP / KR activation after key + entitlement requirements are satisfied.
7. CN_HK approved data-product path.
8. Home decision-readiness UX refinement and direction eligibility integration.

## Handoff rule

At every material checkpoint, update `FOXYYA_STATE.json` and this file. Revalidate GitHub and Railway truth before execution. Branch HEAD, CI success, dashboard config and Railway deployment health are separate facts and must never be conflated.
