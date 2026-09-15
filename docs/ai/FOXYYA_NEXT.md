# FOXYYA v12 — Next Engineering Actions

Updated: 2026-09-15 10:20 +08:00

## Research Staging — current accepted checkpoint

- Fully-green product commit: `dc56501497bf1095ad0509678889197fe6762f44`.
- GitHub Actions: `34920432253` — SUCCESS.
  - v12 Node contracts/integration: 748 / 748 passed.
  - existing JavaScript regressions: PASS.
  - Python regression: PASS.
  - Production safety gate: PASS.
  - isolated Staging + backup container smoke: PASS.
  - Production release authorized: false.
- Source-trigger deployment `936b7ba1-4544-451e-9aa5-d212ccb940e3` captured the correct commit but built the root Production Python image (`python:3.12-slim`) and is INVALID/REMOVED.
- Accepted native redeploy: `6cedb435-a175-4cb8-85bd-ffa1b70a5fd3`, SUCCESS.
- Accepted build uses `v12/staging/Dockerfile` and `node:22-alpine`.
- Runtime: `RESEARCH_ONLY=true`, `EXECUTION_WRITE=false`.
- Initial research refresh succeeded with buildRevision `dc565014...`, failedCycles 0, lastFailureAt null.
- Initial bootstrap: Crypto 342, TW 2, US 1, events 40, TW forward samples 6.
- Live lineage trace: Home 200 / Trace 200 / sourceCount 3 / observationCount 112.
- Live Coverage probe: PASSED, seven markets.
- No `DURABLE_WRITE_FAILED`, `LINEAGE_JOURNAL_CORRUPT`, or research refresh failure on the accepted deployment.
- Current resource check: memory ~0.048 GB / 1 GB; disk ~0.05915 GB on the 500 MB `/data` volume.

## P0 Storage Recovery — CLOSED

P0 remains closed. Do not reopen it unless durable write, lineage corruption, uncontrolled growth, backup loss, or storage high-water evidence reappears.

## Railway legacy Config-as-Code precedence — OPEN PLATFORM BLOCKER

The issue is still reproducible: a source-trigger deployment for the correct commit again built the root Production Python Dockerfile. The safe native redeploy of the captured snapshot built the intended Node image.

Rules remain:

1. Never accept source deployment metadata alone.
2. Require exact tested commit + Node 22/v12 build + `/ready` runtime evidence.
3. Native redeploy only after validating the captured source snapshot.
4. Permanent fix requires authenticated Railway CLI migration scoped ONLY to `foxyya-v12-staging`.
5. Never run an unscoped project migration or `--delete-files`.
6. Do not modify Production Execution V2 as part of v12 migration work.

## US Provider Coverage

### CFTC POSITIONING — LIVE_GREEN

- Provider `cftc-cot` is live AVAILABLE.
- Dataset `CFTC:TFF:gpe5-46if:EQUITY_INDEX`.
- Capability `FUTURES_POSITIONING`.
- Weekly confirmation-only evidence; it does not grant direction readiness.

### US QUOTE — IMPLEMENTED / CREDENTIAL-GATED / NOT LIVE ACTIVATED

- Provider: `twelve-data-us-quote`.
- Server-only credential path implemented.
- Missing key causes zero provider requests.
- Secret is never placed in URL/public diagnostics.
- Limited-venue / non-NBBO semantics preserved.
- Live blocker: `API_KEY_REQUIRED:QUOTE:twelve-data-us-quote`.

Do not fabricate a key. Activation requires a real Staging credential.

### US VOLATILITY_CONTEXT — IMPLEMENTED / KEY + ENTITLEMENT GATED / LIVE FAIL-CLOSED

Provider selection and implementation are complete through the Research Staging pipeline:

- Provider ID: `twelve-data-us-volatility`.
- Provider: Twelve Data Global Indices API.
- Role: minimal VIX-like market volatility context, not full options analytics.
- Catalog status: credential + entitlement required; not live-eligible until verified.
- Canonical dataset: `TWELVEDATA:VOLATILITY:US`.
- Canonical entity pattern: `INDEX:US:VOLATILITY:<symbol>`.
- Adapter preserves provider observation time separately from receive time.
- Server-only credential loader:
  - no key => zero network requests,
  - key but no entitlement => zero network requests,
  - key + entitlement => permitted read-only request path,
  - secret never appears in URL/result/log lineage surfaces.
- Canonical binding and source-pipeline wiring are implemented and fully tested.
- Accepted live Staging currently has no configured key/verified entitlement, therefore it performs no volatility provider request and honestly reports:
  - `API_KEY_REQUIRED:VOLATILITY_CONTEXT:twelve-data-us-volatility`
  - `ENTITLEMENT_REQUIRED:VOLATILITY_CONTEXT:twelve-data-us-volatility`
- US remains `BLOCKED`, direction `NOT_READY`; no fake `VOLATILITY_CONTEXT` is published.

Do NOT mark this source `LIVE_GREEN` or AVAILABLE until a real Staging key, plan entitlement, exact VIX-like symbol support and a successful live canonical dataset are verified.

### US INDEX + MARKET_BREADTH — EXTERNAL_LICENSE_REQUIRED

- `LICENSE_REQUIRED:INDEX:nasdaq-trader-daily`
- `LICENSE_REQUIRED:MARKET_BREADTH:nasdaq-trader-daily`

Do not scrape or reinterpret public downloads as server-side usage permission.

## Current live US Coverage truth

Available research capabilities:

- FUNDAMENTAL
- FUTURES_POSITIONING
- MACRO
- NEWS

Missing / blocked:

- INDEX — licensed data path required.
- MARKET_BREADTH — licensed data path required.
- QUOTE — real Twelve Data Staging key required.
- VOLATILITY_CONTEXT — real Twelve Data key + entitlement verification required.

US must remain BLOCKED until the Coverage Gate requirements are actually met.

## Current engineering priority: EU INDEX + MARKET_BREADTH provider decision

US engineering paths that can proceed without external credentials/licenses are now exhausted. Move to the next region rather than weakening US gates.

Exact next actions:

1. Research authoritative/current EU equity index and breadth data providers and official/licensed distribution paths.
2. Separate INDEX from MARKET_BREADTH; do not assume one provider legally or technically covers both.
3. For each candidate verify:
   - server-side/non-display research rights,
   - API/download mechanism,
   - exchange/index licensing constraints,
   - latency,
   - coverage breadth,
   - historical/live availability,
   - Taiwan access feasibility,
   - predictable cost.
4. Classify each candidate as `APPROVED_PUBLIC_USE`, `COMMERCIAL_LICENSE_AVAILABLE`, `API_KEY_REQUIRED`, `ENTITLEMENT_REQUIRED`, `LICENSE_REQUIRED`, or `UNSUITABLE`.
5. Prefer explicit licensed/API contracts over scraping or ambiguous public pages.
6. After provider selection, write RED contracts before any production code.
7. No EU provider may affect Production Execution V2 or gain execution authority.
8. Full v12 + JS + Python + Production safety + container smoke before any Research Staging deployment.

## External blockers parked for activation

- Railway Config-as-Code permanent migration requires authenticated scoped CLI access.
- US QUOTE requires a real Twelve Data Staging key.
- US VOLATILITY_CONTEXT requires real Twelve Data key + entitlement/symbol verification.
- US INDEX/MARKET_BREADTH require a valid licensed market-data path.

## Subsequent priorities

1. EU INDEX + MARKET_BREADTH provider decision and TDD implementation.
2. JP / KR activation after key + entitlement requirements are satisfied.
3. CN_HK approved data-product path.
4. Home decision-readiness UX refinement and direction eligibility integration.
5. Activate US credential-gated providers only when real credentials/entitlements are supplied and independently verified.

## Handoff rule

At every material checkpoint, update `FOXYYA_STATE.json` and this file. When the conversation becomes materially long, proactively checkpoint GitHub/Railway truth and prepare a fresh-chat continuation instruction before context exhaustion. Never conflate branch HEAD, CI success, Railway build metadata, deployment health, and live provider availability.
