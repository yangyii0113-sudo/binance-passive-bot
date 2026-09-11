# FOXYYA v12 — P1 Data Gate Closeout

**Status:** GO / FOUNDATION COMPLETE  
**Date:** 2026-09-12  
**Branch:** `v12-p1-data-gate`  
**Base:** `v12-multimarket-architecture` @ `ee29e965446d23df0c130820b608158dbc3ebff1`  
**Production release authorized:** NO

---

## 1. Closeout decision

P1 Data Foundation is closed as **GO** for architecture and research-data foundation purposes.

This closeout does **not** authorize:

- Production deployment;
- real-money Crypto execution;
- US equity execution;
- purchase of a market-data subscription;
- addition of Alpaca API credentials;
- external redistribution of licensed US quote data.

`PAPER_ONLY`, `REAL_ORDER_LOCK`, the existing Crypto Runtime boundary, and the v12 research-only separation remain unchanged.

---

## 2. P1.7 Source Lineage Persistence — CLOSED / GREEN

The lineage layer now satisfies the original P1.7 requirements:

- stable source lineage ID;
- dataset ID;
- fetch-start / receive timestamps;
- binding version;
- adapter version;
- canonical schema version;
- explicit source status;
- deterministic observation references;
- deterministic research-output lineage references;
- append-only durable lineage journal;
- checksum + monotonic sequence replay;
- idempotent duplicate behavior;
- conflicting rewrite rejection;
- corruption fail-closed behavior;
- incomplete trailing-fragment recovery;
- durable-write failure does not advance live lineage state;
- research output can be traced back to the exact persisted source observations after restart;
- lineage surfaces remain research-only and expose no execution command.

### Canonical identity persistence

Verified identity rules include:

- `TWSE:<symbol>` remains TWSE through canonical observations, durable lineage, research output and Home;
- `TPEX:<symbol>` remains TPEX through the same path and is never converted to TWSE identity;
- US SEC factual research preserves the canonical US instrument identity while remaining separate from market-price data;
- source and observation identity survive durable replay.

### Existing regression coverage

P1.7 closure is covered by the existing test families including:

- `tests/v12_source_lineage_contract.test.cjs`
- `tests/v12_source_lineage_persistence.test.cjs`
- `tests/v12_source_pipeline_lineage_trace.test.cjs`
- `tests/v12_staging_lineage_runtime.test.cjs`
- `tests/v12_lineage_read_api.test.cjs`
- TPEx / TWSE durable pipeline parity tests

The latest verified v12 Integration baseline on the parent architecture branch is green and includes the `tests/v12_*.test.cjs` suite.

---

## 3. P1.8 US Quote Provider Decision / Activation Gate — CLOSED / GREEN

### Provider decision

FOXYYA selects **Alpaca Market Data SIP** as the US consolidated real-time equity market-data provider for the v12 research platform.

Canonical catalog identity remains:

```text
sourceId = us-equity-realtime
provider = Alpaca Market Data SIP
feed = sip
coverage = ALL_US_EXCHANGES
subscription = ALGO_TRADER_PLUS
```

The provider is classified as:

```text
authority = LICENSED
accessClass = API_KEY
secretRequired = true
entitlementRequired = true
serverOnly = true
liveEligible = true
latencyClass = REALTIME
redistributionStatus = NOT_REVIEWED
```

### Activation semantics

`liveEligible = true` means the selected provider/feed is capable of delivering live consolidated data. It does **not** mean the current runtime is active.

Activation remains fail-closed:

```text
No credential
  -> CREDENTIAL_REQUIRED
  -> canActivate = false

Credential present, entitlement unknown/missing
  -> ENTITLEMENT_REQUIRED / UNAVAILABLE
  -> canActivate = false

Credential present, entitlement explicitly denied
  -> BLOCKED
  -> canActivate = false

Credential present + entitlement explicitly granted
  -> READY
  -> canActivate = true
```

No secret value is returned by the access-control surface.

### Licensed-LIVE safety invariant

The Source Catalog validator now rejects a licensed `liveEligible` provider unless all three conditions hold:

- credential required;
- entitlement required;
- server-only access.

This prevents a future catalog edit from turning a licensed live feed into a public or ungated source by mistake.

### No silent fallback

For `us-equity-realtime`:

- IEX is not an acceptable silent substitute for consolidated SIP data;
- delayed SIP is not an acceptable silent substitute for LIVE SIP;
- SEC EDGAR facts are never treated as quote data;
- missing credentials or subscription entitlement keep the capability blocked / unavailable.

### Scope boundary

P1.8 adds **provider selection and access policy only**.

It does not add:

- Alpaca network transport;
- websocket subscription;
- REST quote polling;
- API credentials;
- paid subscription;
- Production environment variables;
- frontend secret material;
- order routing or US equity execution.

---

## 4. P1 Data Gate acceptance

- [x] canonical instrument identity survives durable storage / replay use;
- [x] research history persists independently of the Crypto execution ledger;
- [x] research history remains forward-only by default;
- [x] supported market sessions, DST and calendar exceptions are explicit;
- [x] raw vs adjusted equity prices are distinguishable;
- [x] provider failures and rate limits are observable and isolated;
- [x] credentialed sources remain server-only;
- [x] entitlement state is distinct from credential presence;
- [x] TPEx has end-to-end Source Pipeline parity;
- [x] source lineage traces research outputs to canonical observations;
- [x] US consolidated quote provider decision is explicit;
- [x] US live quote activation fails closed when key / entitlement is absent;
- [x] licensed LIVE sources cannot bypass credential / entitlement / server-only gates;
- [x] no IEX or delayed-SIP fallback may impersonate consolidated LIVE SIP;
- [x] no provider / lineage / research-history surface exposes execution write;
- [x] Production release remains unauthorized.

---

## 5. Verification evidence for this closeout branch

TDD evidence for the new US quote decision:

1. A provider-contract test was written first and verified RED against the prior unresolved catalog entry.
2. The catalog was changed minimally to select Alpaca SIP and the provider-contract test verified GREEN.
3. A second safety test was written first for licensed-LIVE gating and verified RED against the prior validator.
4. The validator was hardened and the safety test verified GREEN.
5. Activation-gate coverage verifies credential -> entitlement -> ready state transitions.
6. Credential / entitlement focused verification confirms no credential value is exposed and `executionWrite` remains false.

No Production Runtime file is modified by the P1.8 provider decision.

---

## 6. Deferred after P1

The following remain future work and do not reopen P1 Data Foundation:

- implement the Alpaca SIP read-only adapter after explicit key / plan approval;
- bind quote/trade/minute-bar payloads into `foxyya-observation/1`;
- add provider health / retry / rate-limit integration for Alpaca;
- add explicit SIP freshness and timestamp Quality Gate rules;
- validate provider failure isolation from Crypto Runtime under live transport;
- review external redistribution rights before any multi-user / SaaS distribution;
- select US consensus / estimate-revision provider;
- select US options analytics provider;
- select Europe real-time equity provider.

---

## 7. Final P1 state

```text
P1.1 Durable Research History                 CLOSED / GREEN
P1.2 Market Clock                             CLOSED / GREEN
P1.3 Corporate Action / Adjustment            CLOSED / GREEN
P1.4 Provider Health / Rate Governance        CLOSED / GREEN
P1.5 Credential / Entitlement Policy          CLOSED / GREEN
P1.6 TPEx Pipeline Parity                     CLOSED / GREEN
P1.7 Source Lineage Persistence               CLOSED / GREEN
P1.8 US Quote Provider Decision / Gate        CLOSED / GREEN
------------------------------------------------------------
P1 DATA FOUNDATION                           GO
PRODUCTION RELEASE                           NOT AUTHORIZED
```
