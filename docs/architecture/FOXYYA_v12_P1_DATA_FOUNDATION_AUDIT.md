# FOXYYA v12 — P1 Data Foundation Audit

**Status:** ACTIVE  
**Date:** 2026-09-09  
**Depends on:** `FOXYYA_v12_P0_ARCHITECTURE_FREEZE.md`  
**Production release authorized:** NO

---

# 1. P1 objective

P1 establishes the factual, point-in-time-safe, provider-neutral data foundation required before Global Intelligence, Early Trend and Equity Research may be treated as authoritative product outputs.

P1 is not a UI phase and does not authorize additional execution capability.

---

# 2. Verified foundation already present

## Market Core

Present:

- canonical instrument identity
- primary market / region vocabulary
- exchange-scoped IDs
- currency / timezone metadata
- shared cross-market contracts

## Market Clock

Present:

- Crypto 24/7 behavior
- Taiwan regular session
- holiday override behavior
- unknown exchange fails unavailable rather than guessed

Further exchange-calendar depth remains a P1 gap.

## Canonical Data / Context Contracts

Present:

- asset observations
- context observations
- context events
- source / timing provenance
- received-time knowledge semantics
- `UNAVAILABLE` behavior
- quality / freshness downgrade behavior

## Source Catalog / Activation

Present:

- explicit source catalog
- provider readiness classification
- public vs credentialed source distinction
- server-only secret boundary
- decision-required / review-required blocking
- no scraped source as canonical authority

## Provider / Adapter foundation

Present adapters / contracts include:

- TWSE
- TPEx
- TWSE T86 institutional flow
- Taiwan monthly revenue
- SEC EDGAR
- BLS
- Federal Reserve event adapter
- ECB
- CFTC COT
- FINRA
- JPX / J-Quants
- KRX

These are read-only provider surfaces and do not expose execution write.

## Public Source Loader

Present:

- HTTPS allowlist
- fixed approved origin
- GET-only behavior
- no credential-in-URL
- fail-closed source readiness
- HTTP / parse failures become explicit unavailable

## Official Source Binding

Present:

- named source-to-adapter bindings
- TWSE Quote exact-symbol selection
- TWSE T86 exact-symbol selection
- Taiwan monthly-revenue exact-company selection
- SEC Company Fact binding
- BLS / ECB semantic definition binding
- transport source ID validation
- writable transport rejection

## Research History foundation

Present:

- forward-only in-memory history store
- Taiwan monthly revenue history
- Taiwan Quote + institutional session history
- idempotent identical duplicate behavior
- conflicting rewrite rejection
- backfill rejection
- time-regression rejection
- instrument isolation
- no execution / trade surface

## Staging Source Pipeline

Present:

- Provider loader -> Official Binding -> Domain Input -> Orchestrator -> Home Publisher
- TWSE Quote + T86 -> Taiwan Research Asset
- optional current monthly revenue
- explicit prior canonical revenue support
- SEC -> US factual read model
- BLS / ECB -> regional factual context
- provider degradation isolation
- no direct execution command

---

# 3. P1 gaps to close

The following are P1 work items. They are ordered by foundation risk, not visual priority.

## P1-A — Durable Research History

Current history store is in-memory only.

Required before authoritative staging accumulation:

- persistent research-only storage separate from Crypto ledger
- atomic append / conflict detection
- restart reconstruction
- schema version
- model / policy version references where research output is stored
- no historical backfill by default
- explicit correction protocol design before corrections are allowed

**Rule:** do not reuse the Crypto execution ledger for research history.

## P1-B — Market Clock completeness

Required:

- US regular / pre-market / after-hours
- US DST transitions
- Taiwan holiday calendar source
- Japan session calendar
- Korea session calendar
- Europe representative session model
- half-day / exceptional close representation where supported

Market Clock must remain authoritative; UI may not calculate sessions independently.

## P1-C — Corporate Action / Adjustment contract

Required before long-horizon equity price history is treated as comparable:

- split
- reverse split
- cash / stock dividend metadata
- symbol change
- delisting / relisting
- adjusted vs unadjusted price-series distinction

No adjusted value may silently replace raw market price.

## P1-D — Provider Health / Rate Governance

Required:

- last success
- last failure
- latency
- freshness
- HTTP status class
- rate-limit state
- retry / backoff policy
- circuit-breaker / temporary disable semantics

Provider health is domain-local; one provider failure must not turn the whole platform red.

## P1-E — Credential / Entitlement runtime policy

Required for credentialed sources such as KRX / J-Quants / FINRA where applicable:

- server-only credential presence check
- entitlement / plan check distinct from API-key presence
- zero secret material in read models or frontend
- explicit `BLOCKED` / `UNAVAILABLE` state when not entitled

## P1-F — US market-price source decision

Current SEC data is factual filing data, not a licensed real-time US quote feed.

Required decision:

- delayed official / licensed research quote source, and/or
- licensed real-time quote provider

Until adopted:

- US live price remains unresolved;
- no provider may fabricate `LIVE` eligibility;
- SEC facts must not be presented as market-price data.

## P1-G — TPEx end-to-end Source Pipeline parity

Adapters exist; end-to-end staging Source Pipeline parity must be verified for OTC Taiwan equities:

- TPEx Quote
- TPEx institutional flow
- TPEx monthly revenue
- TPEX instrument identity
- same Research / Early Trend semantics without converting identity to TWSE

## P1-H — Source lineage persistence

Required:

- stable source ID
- dataset ID
- fetch / receive timestamp
- binding / adapter version
- canonical schema version
- source status
- research-output lineage references

The system must answer: “which source observation produced this research state?”

---

# 4. Explicitly deferred from P1

The following do not block P1 Data Foundation unless later promoted by architecture revision:

- options-flow provider selection
- full news provider implementation
- social sentiment
- on-chain analytics provider
- cross-market Knowledge Graph expansion
- real-time US stock execution
- real-money Crypto execution
- high-fidelity UI

---

# 5. P1 implementation order

```text
P1.1 Durable Research History Contract
     ↓
P1.2 Market Clock completeness
     ↓
P1.3 Corporate Action / Adjustment Contract
     ↓
P1.4 Provider Health / Retry / Rate Governance
     ↓
P1.5 Credential / Entitlement Policy
     ↓
P1.6 TPEx Pipeline Parity
     ↓
P1.7 Source Lineage Persistence
     ↓
P1.8 US Quote Provider Decision / Activation Gate
     ↓
P1 Data Gate
```

The order intentionally puts data correctness and restart safety before adding more market features.

---

# 6. P1 Go / No-Go acceptance

P1 is GO only when all required foundation items satisfy:

- [ ] canonical instrument identity survives restart / storage use;
- [ ] research history persists independently of Crypto ledger;
- [ ] research history remains forward-only by default;
- [ ] supported market sessions / DST / holidays are explicit;
- [ ] raw vs adjusted equity prices are distinguishable;
- [ ] provider failures / rate limits are observable and isolated;
- [ ] credentialed sources remain server-only;
- [ ] entitlement state is distinct from credential presence;
- [ ] TPEx has end-to-end pipeline parity;
- [ ] source lineage can trace research output to canonical observations;
- [ ] unresolved US quote data remains honestly unavailable;
- [ ] no provider / research history surface exposes execution write;
- [ ] Branch Scope Gate is green;
- [ ] existing Crypto Runtime regression is green;
- [ ] `PAPER_ONLY` and `REAL_ORDER_LOCK` remain present;
- [ ] Production release remains unauthorized.

---

# 7. Current P1 decision

**P1 status: ACTIVE / NOT YET COMPLETE**

Immediate next implementation unit:

**P1.1 — Durable Research History Contract**

The current in-memory store is suitable for contract verification but not sufficient for restart-safe staging accumulation.

No Production migration is authorized by this audit.
