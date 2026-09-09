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

Further exchange-calendar depth remains the active P1.2 gap.

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

## Research History foundation — P1.1 CLOSED

Present and verified:

- forward-only in-memory contract store
- dedicated durable research journal separate from Crypto SQLite ledger
- Taiwan monthly revenue history
- Taiwan Quote + institutional session history
- append-only durable JSONL journal
- event schema / monotonic sequence / SHA-256 checksum
- restart reconstruction by validated replay
- idempotent identical duplicate behavior
- conflicting rewrite rejection
- backfill rejection
- knowledge-time regression rejection
- instrument isolation
- model / policy version references on durable events
- incomplete trailing fragment recovery
- complete journal corruption fails closed
- disk-write failure does not advance in-memory state
- Source Pipeline reads only prior durable history for the current research cycle
- current revenue / Quote+T86 are appended only after Home publication succeeds
- failed Home publication does not advance research history
- manual `previousRevenue` / `institutionalSessions` override is forbidden when durable history is active
- no correction / execution / trade surface

**Known reliability boundary:** Home snapshot publication and research-journal append are two separate durability resources, not one cross-resource transaction. Current ordering guarantees that a failed Home publication cannot advance history. A journal write failure after a successful Home publication can still leave Home newer than durable history. This must be addressed by later reliability / outbox design before claiming cross-resource atomicity.

## Staging Source Pipeline

Present:

- Provider loader -> Official Binding -> Domain Input -> Orchestrator -> Home Publisher
- TWSE Quote + T86 -> Taiwan Research Asset
- optional current monthly revenue
- durable prior research-history lookup
- SEC -> US factual read model
- BLS / ECB -> regional factual context
- provider degradation isolation
- no direct execution command

---

# 3. P1 gaps to close

The following are P1 work items. They are ordered by foundation risk, not visual priority.

## P1-A — Durable Research History — COMPLETE

Verified completion:

- persistent research-only storage separate from Crypto ledger
- append / conflict detection
- restart reconstruction
- schema version
- model / policy version references
- no historical backfill by default
- no correction protocol exposed
- Source Pipeline integration preserves point-in-time ordering

**Rule remains:** do not reuse the Crypto execution ledger for research history.

## P1-B — Market Clock completeness — ACTIVE

Required:

- US regular / pre-market / after-hours
- US DST transitions
- Taiwan holiday calendar contract / source metadata
- Japan session calendar
- Korea session calendar
- Europe representative session model
- half-day / exceptional close representation where supported
- next open / next close boundaries
- explicit distinction between market-data availability and trading-session phase

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
P1.1 Durable Research History Contract       COMPLETE
     ↓
P1.2 Market Clock completeness              ACTIVE
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
- [x] research history persists independently of Crypto ledger;
- [x] research history remains forward-only by default;
- [ ] supported market sessions / DST / holidays are explicit;
- [ ] raw vs adjusted equity prices are distinguishable;
- [ ] provider failures / rate limits are observable and isolated;
- [ ] credentialed sources remain server-only;
- [ ] entitlement state is distinct from credential presence;
- [ ] TPEx has end-to-end pipeline parity;
- [ ] source lineage can trace research output to canonical observations;
- [x] unresolved US quote data remains honestly unavailable;
- [x] no provider / research history surface exposes execution write;
- [x] Branch Scope Gate is green;
- [x] existing Crypto Runtime regression is green;
- [x] `PAPER_ONLY` and `REAL_ORDER_LOCK` remain present;
- [x] Production release remains unauthorized.

---

# 7. Current P1 decision

**P1 status: ACTIVE / NOT YET COMPLETE**

**P1.1 status: CLOSED / GREEN**

Verified P1.1 CI baseline at closure:

- v12 contract / integration: `387 / 387`
- existing Runtime JS regression: `10 / 10`
- Python runtime regression: `1 / 1`
- Branch Scope Gate: green
- `PAPER_ONLY` / `REAL_ORDER_LOCK`: green
- Production release authorized: `false`

Immediate next implementation unit:

**P1.2 — Market Clock completeness**

P1.2 must complete session-phase, DST, calendar-override and exceptional-close contracts before any UI or provider independently derives “market open” state.

No Production migration is authorized by this audit.
