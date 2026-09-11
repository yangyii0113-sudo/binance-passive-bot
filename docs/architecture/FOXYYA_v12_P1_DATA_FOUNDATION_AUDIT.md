# FOXYYA v12 — P1 Data Foundation Audit

**Status:** CLOSED / GREEN  
**Date:** 2026-09-12  
**Depends on:** `FOXYYA_v12_P0_ARCHITECTURE_FREEZE.md`  
**Detailed closeout:** `FOXYYA_v12_P1_DATA_GATE_CLOSEOUT.md`  
**Production release authorized:** NO

---

# 1. P1 objective

P1 establishes the factual, point-in-time-safe, provider-neutral data foundation required before Global Intelligence, Early Trend and Equity Research may be treated as authoritative product outputs.

P1 is not a UI phase and does not authorize additional execution capability. Closing P1 does not authorize Production deployment, real-money Crypto execution, US equity execution, purchase of market-data subscriptions, addition of provider credentials, or external redistribution of licensed market data.

---

# 2. Verified foundation

## P1.1 — Durable Research History — CLOSED / GREEN

Verified:

- persistent research-only storage is separate from the Crypto execution ledger;
- append-only durable JSONL journal;
- schema / sequence / checksum validation;
- restart reconstruction by validated replay;
- idempotent duplicate behavior and conflicting rewrite rejection;
- backfill and knowledge-time regression rejection;
- instrument isolation and model / policy version references;
- incomplete trailing-fragment recovery and complete-corruption fail-closed behavior;
- durable-write failure does not advance in-memory state;
- Source Pipeline uses only prior durable history for the current research cycle;
- no correction / execution / trade surface.

**Known reliability boundary:** Home snapshot publication and research-history append remain two separate durability resources. P1 does not claim cross-resource atomicity; later reliability / outbox work may address this.

## P1.2 — Market Clock — CLOSED / GREEN

Verified:

- Crypto 24/7 behavior remains isolated from equity-session rules;
- TWSE / TPEx regular session in Taipei local time;
- NYSE / NASDAQ pre-market, regular and after-hours phases;
- US DST behavior through exchange timezone conversion rather than fixed UTC offsets;
- Japan split session, KRX regular session, HKEX split session and XETRA representative session;
- weekend close, next-open / next-close boundaries and verified calendar overrides;
- half-day / exceptional session replacement;
- unknown exchange fails `UNAVAILABLE` rather than being guessed.

Market Clock remains authoritative. UI and provider modules must not independently derive session state.

## P1.3 — Corporate Action / Adjustment Contract — CLOSED / GREEN

Verified:

- split, reverse split, cash dividend, stock dividend, symbol change, delisting and relisting vocabulary;
- source / event provenance and knowledge-time ordering;
- strict effective-date validation;
- explicit `RAW` vs `ADJUSTED` price-series descriptors;
- adjusted series requires method / version / raw-field reference / corporate-action lineage;
- raw values never silently fall back to adjusted values and adjusted values never silently fall back to raw values;
- no execution / trading surface.

## P1.4 — Provider Health / Rate Governance — CLOSED / GREEN

Verified:

- provider-local health with honest `UNKNOWN` initial state;
- last success / failure, latency, freshness and HTTP status-class tracking;
- deterministic retry / exponential backoff and bounded attempts;
- explicit 429 / `Retry-After` handling;
- retryable HTTP, non-retryable HTTP, network and data failures remain distinguishable;
- provider-local circuit breaker, cooldown and half-open recovery;
- one provider failure does not degrade unrelated providers;
- public-source loader and Source Pipeline governance integration;
- immutable provider-health diagnostics;
- no provider-health surface exposes execution write.

## P1.5 — Credential / Entitlement Runtime Policy — CLOSED / GREEN

Verified:

- Source Catalog is the canonical access-metadata authority;
- activation, credential presence, entitlement state and provider health remain separate concerns;
- credential lookup is server-side only and retains only presence state;
- missing credential is explicit `BLOCKED`;
- unknown entitlement is explicit `UNAVAILABLE`;
- explicit non-entitlement is `BLOCKED`;
- review-required and decision-required sources fail closed before secret lookup;
- credential / entitlement errors are sanitized and never echo secret-bearing values;
- no key, token, authorization header or credential material appears in frontend-facing contracts;
- access-control surfaces expose `executionWrite:false`.

## P1.6 — TPEx Source Pipeline Parity — CLOSED / GREEN

Verified:

- TPEx Quote, institutional flow and monthly revenue have explicit Official Source Bindings;
- one Taiwan Source Pipeline supports `TWSE` and `TPEX` without a second research engine;
- unsupported exchange fails closed before network access;
- `TPEX:<symbol>` identity is preserved across Provider -> Binding -> Canonical Data -> Research -> Home;
- TPEx identity never impersonates `TWSE:<symbol>`;
- TPEx market probes and provider health remain isolated from TWSE;
- missing TPEx target never falls back to another OTC or TWSE symbol;
- no TPEx surface exposes execution authority.

## P1.7 — Source Lineage Persistence — CLOSED / GREEN

Verified:

- stable source ID and dataset ID;
- fetch-start / receive timestamps;
- binding / adapter version;
- canonical schema version;
- explicit source status;
- deterministic observation references and research-output lineage references;
- append-only durable lineage journal with monotonic sequence and SHA-256 checksum;
- restart reconstruction, idempotent duplicate behavior and conflicting rewrite rejection;
- corruption fails closed while an incomplete trailing append can recover safely;
- durable-write failure does not advance live lineage state;
- research output traces to the exact persisted source observations after restart;
- canonical instrument identity survives durable storage / replay use;
- TWSE and TPEx identities remain exchange-scoped and do not drift;
- US SEC factual lineage remains distinct from market-price data;
- lineage surfaces remain research-only and expose no execution command.

The system can now answer: **“which canonical source observations produced this research state?”**

## P1.8 — US Quote Provider Decision / Activation Gate — CLOSED / GREEN

Selected provider for the v12 US consolidated real-time equity research feed:

```text
sourceId = us-equity-realtime
provider = Alpaca Market Data SIP
feed = sip
coverage = ALL_US_EXCHANGES
authority = LICENSED
accessClass = API_KEY
secretRequired = true
entitlementRequired = true
serverOnly = true
liveEligible = true
latencyClass = REALTIME
subscription = ALGO_TRADER_PLUS
redistributionStatus = NOT_REVIEWED
```

`liveEligible = true` describes the selected feed's capability; it does **not** mean the current runtime is activated.

Activation is fail-closed:

```text
No credential
  -> CREDENTIAL_REQUIRED
  -> canActivate = false

Credential present, entitlement missing / unknown
  -> ENTITLEMENT_REQUIRED / UNAVAILABLE
  -> canActivate = false

Credential present, entitlement denied
  -> BLOCKED
  -> canActivate = false

Credential present + entitlement granted
  -> READY
  -> canActivate = true
```

Safety invariants:

- licensed LIVE sources must require credential, entitlement and server-only access;
- IEX may not silently impersonate consolidated SIP coverage;
- delayed SIP may not silently impersonate LIVE SIP;
- SEC EDGAR facts may not be presented as market-price observations;
- no Alpaca key, paid plan, transport adapter, websocket subscription or Production environment change is included in P1.8;
- external redistribution remains disabled until rights are separately reviewed.

---

# 3. Source / data boundary after P1

The verified foundation now includes:

- canonical instrument identity and cross-market vocabulary;
- Market Clock and corporate-action / price-series invariants;
- asset observations, context observations and context events;
- source / timing provenance and received-time knowledge semantics;
- explicit `UNAVAILABLE` and freshness downgrade behavior;
- Source Catalog / Activation Gate;
- Provider Health / Runtime Governance;
- Credential / Entitlement Runtime;
- Official Source Bindings;
- Public Source Loader;
- durable Research History;
- durable Source Lineage;
- TWSE / TPEx research pipeline parity;
- SEC / BLS / Fed / ECB / CFTC / FINRA provider foundations;
- KRX / JPX authenticated-source foundations;
- Alpaca SIP selected as the gated US consolidated quote provider.

These remain read-only research/data capabilities unless a later phase explicitly adds a separately reviewed execution surface.

---

# 4. Explicitly deferred from P1

The following do not reopen P1 Data Foundation:

- Alpaca SIP transport implementation, websocket / REST quote ingestion and provider-specific normalization;
- provision of Alpaca credentials or paid subscription;
- external redistribution rights review;
- US earnings consensus / estimate-revision provider selection;
- US options-flow / IV / unusual-options provider selection;
- Europe real-time equity provider selection;
- full news provider implementation;
- social sentiment;
- on-chain analytics provider;
- cross-market Knowledge Graph expansion;
- real-time US stock execution;
- real-money Crypto execution;
- high-fidelity UI;
- cross-resource Home / research-history atomicity improvement.

---

# 5. P1 implementation order — FINAL

```text
P1.1 Durable Research History Contract            COMPLETE
     ↓
P1.2 Market Clock completeness                    COMPLETE
     ↓
P1.3 Corporate Action / Adjustment Contract       COMPLETE
     ↓
P1.4 Provider Health / Retry / Rate Governance    COMPLETE
     ↓
P1.5 Credential / Entitlement Policy              COMPLETE
     ↓
P1.6 TPEx Pipeline Parity                         COMPLETE
     ↓
P1.7 Source Lineage Persistence                   COMPLETE
     ↓
P1.8 US Quote Provider Decision / Activation Gate COMPLETE
     ↓
P1 Data Gate                                      GO / GREEN
```

---

# 6. P1 Go / No-Go acceptance — FINAL

- [x] canonical instrument identity survives restart / storage use;
- [x] research history persists independently of Crypto ledger;
- [x] research history remains forward-only by default;
- [x] supported market sessions / DST / calendar exceptions are explicit;
- [x] raw vs adjusted equity prices are distinguishable;
- [x] provider failures / rate limits are observable and isolated;
- [x] credentialed sources remain server-only;
- [x] entitlement state is distinct from credential presence;
- [x] TPEx has end-to-end pipeline parity;
- [x] source lineage traces research output to canonical observations;
- [x] US consolidated quote provider selection is explicit;
- [x] US live quote activation remains blocked unless credential + entitlement are satisfied;
- [x] licensed LIVE sources cannot bypass credential / entitlement / server-only gates;
- [x] IEX / delayed SIP cannot silently impersonate consolidated LIVE SIP;
- [x] SEC facts remain distinct from market-price data;
- [x] no provider / research-history / lineage / corporate-action / governance surface exposes execution write;
- [x] Branch Scope Gate is green;
- [x] existing Crypto Runtime regression is green;
- [x] `PAPER_ONLY` and `REAL_ORDER_LOCK` remain present;
- [x] Production release remains unauthorized.

---

# 7. Current P1 decision

**P1 status: CLOSED / GREEN**

Final verification on `v12-multimarket-architecture` after the P1.8 regression fix:

- FOXYYA v12 Integration run `#327`: `success`;
- v12 contract / integration suite: **542 / 542 passed**;
- Runtime JavaScript regression: **10 / 10 passed**;
- Python runtime regression: **1 / 1 passed**;
- Branch Scope Gate: green;
- Production safety-string checks: green;
- `PAPER_ONLY`: present;
- `REAL_ORDER_LOCK`: present;
- Production release authorized: `false`.

P1 closure therefore authorizes progression to the next frozen architecture / research phase only. It does **not** authorize Production migration or any new execution capability.
