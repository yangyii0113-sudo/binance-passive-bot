# FOXYYA v12 Market Data Coverage Gate — Design Spec

Date: 2026-09-12
Branch: `v12-platform-completion-20260910`
Scope: FOXYYA v12 Research Staging only

## 1. Purpose

FOXYYA v12 already has multiple independent data surfaces: provider catalog, provider health diagnostics, market/region read models, equity research, Crypto runtime reads, news/events, and forward-validation results. The current weakness is that these surfaces do not produce one authoritative answer to a simple product question:

> For each market, what data is actually available now, what is missing, why is it missing, and what decisions are safe to make from the current evidence?

This spec introduces a backend **Market Data Coverage Gate** that evaluates seven markets — `CRYPTO`, `US`, `TW`, `CN_HK`, `JP`, `KR`, `EU` — from verified runtime evidence and source activation state. The gate becomes the single source of truth for data readiness displayed in Home / Intelligence / Provider Diagnostics.

The gate is research-only. It never creates, modifies, approves, or routes an order.

## 2. Goals

1. Produce one immutable coverage record for each supported market.
2. Distinguish runtime/data failures from missing implementation and from external activation blockers such as API keys, entitlements, and licensing review.
3. Tell the product whether current data is sufficient for:
   - regional / market direction,
   - individual research,
   - research ranking eligibility.
4. Preserve truthful degradation: partial data remains visible but cannot be promoted to full market-direction readiness.
5. Keep source truth and lineage traceability intact.
6. Present coverage to users primarily in Traditional Chinese while retaining stable machine-readable enums.
7. Preserve all existing Production safety invariants.

## 3. Non-goals

This phase does **not**:

- add a new paid data vendor;
- bypass or scrape around licensed market-data requirements;
- enable US, JP, KR, or HK data without required credentials / entitlement;
- change Crypto A/B/C/D execution logic;
- change `PAPER_ONLY`, `REAL_ORDER_LOCK`, or Production service code;
- change Research Ranking weights;
- backfill historical research outcomes;
- connect equity research to execution;
- claim that a market has direction simply because one macro series or one stock is available.

## 4. Existing inputs

The gate composes existing verified surfaces instead of creating a second provider system.

### 4.1 Source catalog

`v12/providers/source_catalog.js` provides static source metadata:

- market coverage,
- capabilities,
- authority,
- activation status,
- credential / entitlement requirements,
- latency class,
- licensing / review state.

### 4.2 Provider diagnostics

`v12/read_model/provider_diagnostics.js` provides runtime evidence:

- provider health,
- last success / failure,
- latency,
- rate-limit state,
- circuit-breaker state,
- dataset read status,
- observed/received timestamps,
- normalized reason.

### 4.3 Derived read models

Existing Home/read-model data proves that some higher-level capabilities were actually built successfully:

- Crypto execution runtime (read-only), candidates, regime classification;
- TW market pulse / breadth / index / industry context;
- TW and US equity research opportunities;
- US / EU regional context;
- news and calendar events;
- research forward-validation summaries.

Coverage must prefer actual built output over static catalog optimism.

## 5. Coverage model

Add a focused read-model module:

`v12/read_model/market_coverage.js`

Primary API:

```js
buildMarketCoverage({
  asOf,
  sourceCatalog,
  providerDiagnostics,
  home,
  cryptoExecution,
  researchPerformance
})
```

Returns:

```js
{
  schemaVersion: 'foxyya-market-coverage/1',
  asOf,
  markets: {
    CRYPTO: MarketCoverage,
    US: MarketCoverage,
    TW: MarketCoverage,
    CN_HK: MarketCoverage,
    JP: MarketCoverage,
    KR: MarketCoverage,
    EU: MarketCoverage
  },
  researchOnly: true,
  executionWrite: false
}
```

### 5.1 MarketCoverage schema

Each market record contains:

```js
{
  market,
  coverageStatus,          // READY | PARTIAL | BLOCKED | UNAVAILABLE
  activationState,         // ACTIVE | PARTIAL | BLOCKED | NONE
  directionReadiness,      // READY | PARTIAL | NOT_READY
  researchReadiness,       // READY | PARTIAL | NOT_READY
  rankingEligibility,      // ELIGIBLE | LIMITED | NOT_ELIGIBLE
  availableCapabilities: [],
  missingCapabilities: [],
  blockers: [],
  sources: [],
  freshness: {
    status,                // FRESH | AGING | STALE | UNKNOWN
    freshestObservedAt,
    freshestReceivedAt,
    oldestRequiredObservedAt
  },
  evidenceCounts: {
    providerCount,
    availableDatasetCount,
    unavailableDatasetCount,
    researchInstrumentCount,
    regionalFactCount,
    highImpactEventCount
  },
  summaryCode,
  researchOnly: true,
  executionWrite: false
}
```

No mutable references are returned.

## 6. Status semantics

### READY

All capabilities required for the market's current target role are present, fresh enough for that role, and not externally blocked.

### PARTIAL

At least one meaningful required capability is available, but the complete target evidence set is not available. Partial data may support limited research but must not be promoted to full market-direction readiness.

### BLOCKED

The target role cannot be completed without explicit external activation. Typical blockers:

- `API_KEY_REQUIRED`
- `ENTITLEMENT_REQUIRED`
- `LICENSE_REVIEW_REQUIRED`
- `DATA_PRODUCT_REQUIRED`
- `PROVIDER_DECISION_REQUIRED`

A BLOCKED market can still contain useful data. Therefore readiness fields remain independent of `coverageStatus`.

### UNAVAILABLE

No meaningful target capability is currently usable, or all runtime evidence required for the target role failed. Runtime failure is not the same as licensing block.

## 7. Blocker classification

Normalized blocker types:

- `CODE_BUG`
- `PROVIDER_UNAVAILABLE`
- `NOT_IMPLEMENTED`
- `API_KEY_REQUIRED`
- `ENTITLEMENT_REQUIRED`
- `LICENSE_REVIEW_REQUIRED`
- `DATA_PRODUCT_REQUIRED`
- `PROVIDER_DECISION_REQUIRED`
- `DATA_STALE`
- `DATA_INCOMPLETE`

Every blocker contains:

```js
{
  type,
  capability,
  sourceId,
  reason,
  externalActionRequired,
  userFacingLabel
}
```

Unknown raw provider errors are never exposed directly to end users. Raw diagnostics remain available in Provider Diagnostics.

## 8. Capability taxonomy

The gate uses normalized capabilities independent of provider-specific dataset names.

Core capabilities:

- `QUOTE`
- `HISTORICAL_PRICE`
- `INDEX`
- `MARKET_BREADTH`
- `SECTOR_ROTATION`
- `INSTITUTIONAL_FLOW`
- `FUNDAMENTAL`
- `MACRO`
- `VOLATILITY_CONTEXT`
- `DERIVATIVES_CONTEXT`
- `REGIME_CLASSIFICATION`
- `EXECUTION_RUNTIME_READ`
- `CANDIDATE_UNIVERSE`
- `NEWS`
- `EVENT_CALENDAR`
- `FORWARD_VALIDATION`

Capabilities may be provided by either:

1. verified provider datasets, or
2. successfully built derived read models.

Derived capability inference must be explicit and unit-tested. It must never infer a capability from a UI label alone.

## 9. Market requirement profiles

Requirements are declarative and live beside the coverage builder, not inside UI code.

### 9.1 Crypto

Target role: market regime + read-only paper execution observability.

Required for direction readiness:

- `REGIME_CLASSIFICATION`
- `EXECUTION_RUNTIME_READ`
- `CANDIDATE_UNIVERSE`

Supporting:

- `DERIVATIVES_CONTEXT`
- `NEWS`
- `EVENT_CALENDAR`

No coverage state may create execution authority.

### 9.2 Taiwan

Target role: market direction + individual equity research.

Required for direction readiness:

- `INDEX`
- `MARKET_BREADTH`
- `SECTOR_ROTATION`

Required for current individual research:

- `QUOTE`
- `INSTITUTIONAL_FLOW`

Supporting:

- `FUNDAMENTAL`
- `NEWS`
- `FORWARD_VALIDATION`

Market breadth cannot be inferred from 2330 / 6488 research cards.

### 9.3 United States

Target role: regional direction + equity research.

Required for full direction readiness:

- `INDEX`
- `MARKET_BREADTH`
- `VOLATILITY_CONTEXT`

Research-supporting capabilities:

- `FUNDAMENTAL`
- `MACRO`
- `NEWS`
- `FORWARD_VALIDATION`

Current SEC/BLS coverage may support partial research but must not make the US region direction-ready while licensed / reviewed breadth data is missing.

### 9.4 European Union

Target role: regional direction context.

Current `MACRO` is useful but insufficient by itself.

Required for full direction readiness:

- `MACRO`
- `INDEX`
- `MARKET_BREADTH`

Until equity breadth/index evidence is available, EU remains PARTIAL or BLOCKED depending on source activation state.

### 9.5 Japan

Target role: regional direction + future equity research.

Required source path currently depends on JPX J-Quants activation.

Missing credentials / entitlement produce BLOCKED, not provider failure.

### 9.6 Korea

Target role: regional direction + future equity research.

KRX API key / entitlement requirements produce BLOCKED until activated.

### 9.7 China / Hong Kong

Target role: regional direction + future equity research.

If the selected HKEX dataset requires a commercial data product or redistribution approval, the market remains BLOCKED with `DATA_PRODUCT_REQUIRED` / `LICENSE_REVIEW_REQUIRED` rather than using scraping as a substitute.

## 10. Freshness rules

Coverage must not treat old successful reads as current readiness.

Freshness is capability-specific rather than globally hard-coded:

- runtime / regime / candidate universe: short-horizon;
- TW EOD market data: latest completed trading session;
- macro releases: release-driven;
- SEC filings: filing-driven;
- weekly positioning: weekly cadence;
- static reference data: dataset-defined.

The first implementation may reuse existing provider freshness diagnostics and market-session timestamps. It must not invent a universal "24h = stale" rule for all providers.

## 11. Coverage derivation order

For each market:

1. Load static source candidates from `SOURCE_CATALOG`.
2. Map activated/adopted sources to normalized capabilities.
3. Overlay runtime provider/dataset diagnostics.
4. Overlay built read-model evidence from Home snapshot.
5. Mark freshness state.
6. Calculate missing required capabilities by market profile.
7. Classify missing reasons into runtime failure, implementation gap, or external blocker.
8. Calculate `directionReadiness`, `researchReadiness`, and `rankingEligibility` separately.
9. Derive final `coverageStatus`.
10. Freeze output.

## 12. Ranking gate integration

This spec does not change ranking weights, but it defines the future integration contract.

After Coverage Gate is deployed and validated:

- `ELIGIBLE`: ranking may use the opportunity normally.
- `LIMITED`: ranking may show the research item but must display the market coverage limitation and may not present it as high-confidence solely from score.
- `NOT_ELIGIBLE`: research item is excluded from "priority review" lists but remains visible in diagnostics if it exists.

No ranking state can create execution authority.

## 13. Home/read-model integration

`v12/read_model/home_snapshot.js` gains a `marketCoverage` field generated after core Home evidence is available.

The field is part of the backend read model:

```js
{
  ...,
  marketCoverage: { ... },
  researchOnly: true,
  executionWrite: false
}
```

`v12/ui/home_view_model.js` only projects this backend state. It must not recompute readiness from raw UI data.

This prevents duplicated rules between server and browser.

## 14. UI design

Add a "市場資料覆蓋" matrix to Home / Intelligence.

Columns:

- 市場
- 資料覆蓋
- 市場方向
- 個股研究
- 排名資格
- 資料新鮮度
- 主要缺口

Example labels:

- `READY` → `可用`
- `PARTIAL` → `部分可用`
- `BLOCKED` → `外部條件阻擋`
- `UNAVAILABLE` → `目前不可用`

Blockers appear in Chinese, for example:

- `需要 API 金鑰`
- `需要資料方案權限`
- `授權審查中`
- `Provider 本輪失敗`
- `尚未完成程式接線`
- `資料已過期`

Technical source IDs remain available under an expandable "來源診斷" section.

## 15. Provider Diagnostics integration

Existing detailed provider cards remain unchanged as the low-level troubleshooting surface.

Coverage adds a summary layer above them:

- market-level status,
- missing capability,
- blocker category,
- affected product feature.

Provider Diagnostics remains the place for HTTP status, latency, rate limits, circuit breakers, dataset IDs, observed time, and received time.

## 16. Error handling

### Provider runtime failure

Coverage degrades the affected capability only. One failed provider must not erase unrelated successful market data.

### Stale data

The capability remains visible but cannot satisfy a freshness-sensitive readiness requirement.

### Static catalog / runtime mismatch

Runtime evidence wins for availability. Static catalog wins for known activation blockers and authority constraints.

### Unknown dataset

Unknown datasets may appear in raw diagnostics but cannot automatically grant a normalized capability.

### Missing coverage input

Fail closed for readiness:

- no invented capability,
- no market-direction readiness,
- no exception that takes down Home publication.

## 17. Safety invariants

Every new coverage structure must assert:

- `researchOnly === true`
- `executionWrite === false`

No module in this phase may:

- import or call Production order placement;
- change leverage;
- set private exchange keys;
- mutate the Production ledger;
- change `PAPER_ONLY` / `REAL_ORDER_LOCK`;
- convert coverage readiness into a Buy/Sell instruction.

Production `main` remains untouched.

## 18. Testing strategy

TDD is mandatory.

### 18.1 Unit tests

Test:

- status derivation;
- blocker classification;
- capability mapping;
- freshness handling;
- immutable output;
- ranking eligibility rules;
- each market requirement profile.

### 18.2 Contract tests

Assert:

- seven markets always exist in output;
- no market can be READY without required capabilities;
- US SEC/BLS-only state is not full direction READY;
- EU macro-only state is not full direction READY;
- JP/KR credential blockers are BLOCKED, not PROVIDER_UNAVAILABLE;
- HK licensing/data-product blockers are BLOCKED;
- TW market breadth cannot be inferred from individual stocks;
- Crypto coverage remains read-only and paper-only.

### 18.3 Integration tests

Extend Home snapshot tests to confirm:

- coverage survives publication;
- UI view-model preserves backend coverage exactly;
- one provider failure degrades only affected capabilities;
- provider diagnostics and coverage agree on runtime availability;
- lineage/read-model publication is not broken.

### 18.4 UI tests

Verify Chinese labels and that no empty clickable shell is rendered.

A blocked source must display the reason instead of a blank card.

### 18.5 Regression gates

Full existing gates remain required:

- all `tests/v12_*.test.cjs`;
- existing JavaScript regressions;
- Python regressions;
- Production safety string checks;
- branch scope gate.

## 19. Deployment / rollout

1. Implement only on `v12-platform-completion-20260910`.
2. Run full CI.
3. Deploy only to `FOXYYA v12 Research Staging`.
4. Because Railway source-trigger has repeatedly selected the wrong root image, accept success only when runtime logs show the v12 Node staging service and `/health` passes.
5. Verify live `/v12/api/home` contains `marketCoverage`.
6. Verify the coverage matrix matches live Provider Diagnostics.
7. Do not merge or deploy to Production `main` in this phase.

## 20. Acceptance criteria

The phase is complete only when all of the following are true:

1. All seven markets have one deterministic coverage record.
2. Users can distinguish `READY`, `PARTIAL`, `BLOCKED`, and `UNAVAILABLE` without opening raw diagnostics.
3. Every missing required capability has a classified reason.
4. Market-direction readiness and individual-research readiness are separate.
5. US macro / SEC data cannot incorrectly imply full US market-direction readiness.
6. TW individual research cannot substitute for TW market breadth.
7. JP/KR/HK external activation requirements are explicit.
8. Coverage output is immutable, research-only, and execution-write false.
9. Existing Research Ranking weights are unchanged in this phase.
10. Full CI and Production safety gates pass.
11. Live v12 Staging displays the same coverage state returned by backend Home API.
12. Production Execution V2 is not redeployed or modified.

## 21. Follow-on phases

Only after this spec is implemented and validated:

1. Coverage-aware Research Ranking gate.
2. Home decision-summary confidence tied to market coverage.
3. Forward-validation confidence tiers by sample count / regime.
4. Expansion of licensed / credentialed providers where explicitly approved.

These are separate implementation phases and must not be silently folded into this one.
