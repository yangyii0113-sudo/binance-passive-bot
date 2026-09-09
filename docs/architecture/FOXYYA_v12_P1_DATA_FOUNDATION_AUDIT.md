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
- Corporate Action / Price Series contract exported from Market Core

## Market Clock — P1.2 CLOSED

Present and verified:

- Crypto 24/7 behavior isolated from equity-session rules
- TWSE / TPEx regular session in Taipei local time
- NYSE / NASDAQ pre-market, regular and after-hours phases
- US DST behavior through authoritative exchange timezone conversion rather than fixed UTC offsets
- TSE morning session, lunch break and afternoon reopen
- KRX regular session in Seoul local time
- HKEX lunch break and afternoon reopen
- XETRA representative regular session in Europe/Berlin timezone
- weekend close behavior
- next open / next close boundaries where defined
- verified calendar override with source provenance
- calendar knowledge-time ordering
- local-date scoped overrides
- half-day / exceptional session replacement
- unknown exchange fails `UNAVAILABLE` rather than being guessed

Market Clock remains authoritative. UI and provider modules must not independently derive session state.

## Corporate Action / Adjustment foundation — P1.3 CLOSED

Present and verified:

- explicit action vocabulary: split, reverse split, cash dividend, stock dividend, symbol change, delisting, relisting
- explicit action status vocabulary
- source / source-event provenance
- announced-time / receive-time ordering
- strict effective-date validation
- split and reverse-split ratios derived only from explicit share counts
- cash / stock dividend economic metadata
- symbol-change successor linkage without mutating historical instrument identity
- delisting / relisting lifecycle representation
- explicit `RAW` vs `ADJUSTED` price-series descriptors
- raw series cannot carry adjustment metadata
- adjusted series requires separate adjusted field, raw-field reference, method, version and corporate-action event lineage
- point-in-time-safety and retroactive-adjustment-risk conflict is rejected
- explicit series selection only; raw never falls back to adjusted and adjusted never falls back to raw
- no execution / trading surface

**Scope note:** P1.3 establishes the canonical contract and invariants. Individual provider adapters may later map their own corporate-action feeds or adjusted-series metadata into this contract, but no adapter may bypass these invariants.

## Provider Health / Runtime Governance — P1.4 CLOSED

Present and verified:

- provider-local health state with honest `UNKNOWN` initial state
- last success / last failure / latency / freshness / HTTP status-class tracking
- deterministic retry eligibility and exponential backoff
- bounded retry attempts
- HTTP `429` rate-limit state with `Retry-After` handling
- rate-limit remaining / limit metadata where supplied
- non-retryable 4xx failures are not retried
- HTTP-success parse/data failures are explicit `DATA_FAILURE` and are not retried
- network failures are distinguished from HTTP and data failures
- consecutive transient failures open a provider-local circuit
- circuit cooldown and single half-open recovery probe
- successful half-open probe closes the circuit
- failed recovery reopens the circuit
- one provider failure does not degrade another provider
- freshness can age to `STALE` without inventing a new failure
- provider runtime governance exported as read-only provider infrastructure
- public source loader may opt into runtime governance without changing its external `load`-only surface
- Activation Gate and endpoint allowlist remain before transport / retry logic
- governed transport retries transient HTTP failures and still returns the same safe loader result contract
- final rate-limit / open-circuit / network failures remain explicit `UNAVAILABLE`
- legacy public-source loader behavior remains compatible when governance is not supplied
- Staging Source Pipeline accepts one shared provider-governance instance and passes it to all public loaders
- shared provider circuit / rate-limit / health state survives across Source Pipeline runs
- Source Pipeline exposes immutable `providerHealth` diagnostics only for providers actually used by the run
- `providerHealth` remains research-only and contains no market direction, bias, order or execution semantics
- invalid provider governance is rejected before the first network request
- provider degradation remains isolated: an unhealthy provider does not mark unrelated successful providers unhealthy
- no provider health, runtime governance, public loader or Source Pipeline diagnostic surface exposes execution write

**Responsibility boundary:** Activation determines whether a source is permitted to run. Runtime governance determines whether an already-permitted source should currently execute, retry, wait, or fail unavailable. Adapters and bindings remain responsible only for data semantics. Research and UI do not implement their own retries or health inference.

## Credential / Entitlement Runtime Policy — P1.5 CLOSED

Present and verified:

- source catalog decision remains the canonical access-metadata authority
- source activation, credential presence, entitlement state and provider runtime health remain separate concerns
- credential lookup is server-side only and evaluates presence without retaining secret material in the access result
- public adopted sources do not invoke credential or entitlement resolvers
- KRX and J-Quants require credential presence and entitlement independently
- FINRA requires credential presence without inventing a plan-entitlement requirement
- missing credential is explicit `BLOCKED`
- unknown entitlement is explicit `UNAVAILABLE`, not silently treated as entitled or denied
- explicit non-entitlement is `BLOCKED`
- review-required and decision-required sources fail closed before any credential or entitlement lookup
- unknown source fails `UNAVAILABLE` without consulting runtime secrets
- credential-check and entitlement-check exceptions are sanitized and do not echo provider error text or secret-bearing values
- access results are deeply immutable, access-control-only and expose no provider-health state
- no secret, API key, token, authorization header or credential material appears in the sanitized result contract
- Provider Foundation exports a single authoritative credential / entitlement runtime constructor
- the duplicate parallel credential-policy authority and its duplicate tests were removed rather than maintained as a second source of truth
- no credential / entitlement runtime surface exposes market direction, trading, order or execution authority

**Responsibility boundary:** Source Catalog declares whether credentials or entitlement are required. Credential / Entitlement Runtime evaluates server-side access readiness. Activation remains a separate catalog-decision gate. Provider Runtime Governance remains responsible for health, retry, rate limiting and circuit state after access is permitted.

## TPEx Source Pipeline Parity — P1.6 CLOSED

Present and verified:

- TPEx Quote, institutional flow and monthly revenue have explicit Official Source Bindings
- one Taiwan Source Pipeline accepts `exchange: 'TWSE' | 'TPEX'` rather than maintaining separate research engines
- omitted Taiwan exchange remains backward-compatible with `TWSE`
- unsupported Taiwan exchange fails closed with `TW_EXCHANGE_INVALID` before network access
- TPEx Quote / institutional flow / monthly revenue preserve exact `TPEX:<symbol>` canonical identity
- TPEx research travels through the same TW Research / Early Trend semantics without conversion to TWSE identity
- TPEx market probes are reported under `sources.TPEX`, separate from `sources.TWSE`
- TPEx provider health is provider-local under `tpex-openapi`
- missing TPEx target is explicit unavailable and never falls back to another OTC or TWSE symbol
- TPEx source failure removes only the affected TPEx research asset while preserving independent TWSE market probes
- durable history remains keyed by canonical instrument ID, preserving TWSE / TPEX identity separation
- no TPEx binding, pipeline or health surface exposes execution authority

**Identity rule:** `TPEX:<symbol>` is immutable across Provider -> Binding -> Canonical Data -> Research -> Home. TPEx data must never impersonate `TWSE:<symbol>`.

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
- optional provider runtime governance for retry / rate-limit / circuit handling
- external surface remains `load` only

## Official Source Binding

Present:

- named source-to-adapter bindings
- TWSE Quote exact-symbol selection
- TWSE T86 exact-symbol selection
- TWSE monthly-revenue exact-company selection
- TPEx Quote exact-symbol selection
- TPEx institutional-flow exact-symbol selection
- TPEx monthly-revenue exact-company selection
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
- current revenue / Quote+institutional flow are appended only after Home publication succeeds
- failed Home publication does not advance research history
- manual `previousRevenue` / `institutionalSessions` override is forbidden when durable history is active
- no correction / execution / trade surface

**Known reliability boundary:** Home snapshot publication and research-journal append are two separate durability resources, not one cross-resource transaction. Current ordering guarantees that a failed Home publication cannot advance history. A journal write failure after a successful Home publication can still leave Home newer than durable history. This must be addressed by later reliability / outbox design before claiming cross-resource atomicity.

## Staging Source Pipeline

Present:

- Provider loader -> Official Binding -> Domain Input -> Orchestrator -> Home Publisher
- TWSE Quote + T86 -> Taiwan Research Asset
- TPEx Quote + institutional flow -> Taiwan Research Asset
- optional current monthly revenue for TWSE / TPEx
- durable prior research-history lookup keyed by canonical instrument ID
- SEC -> US factual read model
- BLS / ECB -> regional factual context
- shared optional Provider Runtime Governance
- immutable provider-local health diagnostics
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

## P1-B — Market Clock completeness — COMPLETE

Verified completion:

- US regular / pre-market / after-hours
- US DST transitions
- Taiwan session contract and verified calendar-override metadata
- Japan split session model
- Korea session model
- Hong Kong split session model
- Europe representative session model
- half-day / exceptional close representation
- next open / next close boundaries
- explicit distinction between market-data availability and trading-session phase

Market Clock remains authoritative; UI may not calculate sessions independently.

## P1-C — Corporate Action / Adjustment contract — COMPLETE

Verified completion:

- split
- reverse split
- cash / stock dividend metadata
- symbol change
- delisting / relisting
- adjusted vs unadjusted price-series distinction
- explicit adjustment provenance / version / action lineage
- raw-series no-fallback invariant

No adjusted value may silently replace raw market price.

## P1-D — Provider Health / Rate Governance — COMPLETE

Verified completion:

- last success / last failure
- latency / freshness
- HTTP status class
- explicit provider-local health
- rate-limit state and bounded `Retry-After`
- deterministic retry / backoff
- circuit-breaker / cooldown / half-open recovery
- data, HTTP and network failure distinction
- public-source loader integration
- Source Pipeline shared-governance integration
- immutable provider-health diagnostics
- domain-local failure isolation
- no execution authority

## P1-E — Credential / Entitlement runtime policy — COMPLETE

Verified completion:

- server-only credential presence check
- entitlement / plan check distinct from API-key presence
- zero secret material in read models, access diagnostics or frontend-facing contracts
- explicit `BLOCKED` / `UNAVAILABLE` states for missing credential, unknown entitlement and denied entitlement
- runtime access contract never echoes secret values or provider error details
- review / decision source decisions remain fail-closed before secret access
- credential / entitlement runtime remains independent from Provider Health / Runtime Governance
- one authoritative runtime contract is exported; duplicate authority removed
- no execution or directional authority

## P1-F — US market-price source decision

Current SEC data is factual filing data, not a licensed real-time US quote feed.

Required decision:

- delayed official / licensed research quote source, and/or
- licensed real-time quote provider

Until adopted:

- US live price remains unresolved;
- no provider may fabricate `LIVE` eligibility;
- SEC facts must not be presented as market-price data.

## P1-G — TPEx end-to-end Source Pipeline parity — COMPLETE

Verified completion:

- TPEx Quote binding and staging transport
- TPEx institutional-flow binding and staging transport
- TPEx monthly-revenue binding and staging transport
- exact `TPEX:<symbol>` identity across the full research path
- same TW Research / Early Trend semantics as TWSE without identity conversion
- `sources.TPEX` market-probe separation
- TPEx provider-health isolation
- target-missing no-substitution behavior
- TPEx failure isolation from independent TWSE probes
- unsupported exchange preflight rejection

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
P1.1 Durable Research History Contract            COMPLETE
     ↓
P1.2 Market Clock completeness                   COMPLETE
     ↓
P1.3 Corporate Action / Adjustment Contract      COMPLETE
     ↓
P1.4 Provider Health / Retry / Rate Governance   COMPLETE
     ↓
P1.5 Credential / Entitlement Policy             COMPLETE
     ↓
P1.6 TPEx Pipeline Parity                        COMPLETE
     ↓
P1.7 Source Lineage Persistence                  ACTIVE
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
- [x] supported market sessions / DST / calendar exceptions are explicit;
- [x] raw vs adjusted equity prices are distinguishable;
- [x] provider failures / rate limits are observable and isolated;
- [x] credentialed sources remain server-only;
- [x] entitlement state is distinct from credential presence;
- [x] TPEx has end-to-end pipeline parity;
- [ ] source lineage can trace research output to canonical observations;
- [x] unresolved US quote data remains honestly unavailable;
- [x] no provider / research history / corporate-action / provider-governance / credential-entitlement surface exposes execution write;
- [x] Branch Scope Gate is green;
- [x] existing Crypto Runtime regression is green;
- [x] `PAPER_ONLY` and `REAL_ORDER_LOCK` remain present;
- [x] Production release remains unauthorized.

---

# 7. Current P1 decision

**P1 status: ACTIVE / NOT YET COMPLETE**

**P1.1 status: CLOSED / GREEN**  
Verified closure baseline: v12 `387 / 387`, Runtime JS `10 / 10`, Python `1 / 1`.

**P1.2 status: CLOSED / GREEN**  
Verified closure baseline: v12 `398 / 398`, Runtime JS `10 / 10`, Python `1 / 1`.

**P1.3 status: CLOSED / GREEN**  
Verified closure baseline: v12 `409 / 409`, Runtime JS `10 / 10`, Python `1 / 1`.

**P1.4 status: CLOSED / GREEN**  
Verified final closure baseline: v12 `442 / 442`, Runtime JS `10 / 10`, Python `1 / 1`.

**P1.5 status: CLOSED / GREEN**  
Verified final closure baseline: v12 `456 / 456`, Runtime JS `10 / 10`, Python `1 / 1`.

**P1.6 status: CLOSED / GREEN**  
Verified final closure baseline: v12 `463 / 463`, Runtime JS `10 / 10`, Python `1 / 1`.

At all six closure gates:

- Branch Scope Gate: green
- `PAPER_ONLY` / `REAL_ORDER_LOCK`: green
- Production release authorized: `false`

P1.5 cleanup note:

- a parallel duplicate `credential_entitlement_policy.js` authority and its duplicate test suite were removed after root-cause analysis;
- the canonical `credential_entitlement_runtime.js` contract and its RED/GREEN test suite remain authoritative;
- Source Catalog remains the sole access-metadata authority.

P1.6 identity note:

- TPEx uses the existing Taiwan research semantics rather than a second engine;
- `TPEX:<symbol>` remains the canonical identity through bindings, Source Pipeline, Research, Home Opportunity and provider diagnostics;
- TPEx failures and provider-health state remain isolated from TWSE;
- no Production migration or execution capability was introduced.

Immediate next implementation unit:

**P1.7 — Source Lineage Persistence**

P1.7 must make research outputs traceable to the exact canonical source observations that produced them, including stable source / dataset identity, receive time, adapter / binding version, canonical schema version and persisted research-output lineage references. Lineage remains read-only and cannot become execution authority.

**Known reliability boundary remains:** Home publication and durable research-history append are separate resources. P1.7 must not falsely claim cross-resource atomicity.

No Production migration is authorized by this audit.
