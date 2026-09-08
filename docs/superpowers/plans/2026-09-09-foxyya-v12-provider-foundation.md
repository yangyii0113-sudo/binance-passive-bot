# FOXYYA v12 Provider Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a provider-neutral, read-only adapter framework that converts external market/fundamental/intelligence payloads into FOXYYA canonical observations without allowing provider code to write to execution.

**Architecture:** Providers declare capabilities and market coverage through validated descriptors. Provider-specific payloads are normalized through a single canonical observation factory and then pass through the Data Quality Gate. No external vendor is selected or called in this phase.

**Tech Stack:** JavaScript/CommonJS, Node built-in `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-09-foxyya-v12-architecture-design.md`

## Global Constraints

- Provider layer is read-only.
- `executionWrite` must always be `false`.
- Provider payloads never become frontend contracts.
- All normalized data must satisfy `foxyya-observation/1`.
- Missing values remain `UNAVAILABLE`.
- Production Runtime and Crypto ledger are untouched.

---

### Task 1: Provider descriptor contract

**Files:**
- Create: `v12/providers/provider_contract.js`
- Test: `tests/v12_provider_contract.test.cjs`

**Produces:** `CAPABILITIES`, `PROVIDER_MARKETS`, `validateProviderDescriptor(value)`.

Tests must prove:
- a public Binance-style descriptor is valid;
- a provider with `executionWrite:true` is rejected;
- unknown markets/capabilities are rejected.

### Task 2: Provider registry

**Files:**
- Create: `v12/providers/registry.js`
- Test: `tests/v12_provider_registry.test.cjs`

**Produces:** `createRegistry()` with `register(descriptor, adapter)`, `resolve(market, capability)`, `list()`.

Rules:
- duplicate provider IDs rejected;
- adapters must expose `normalize(raw, context)`;
- registry resolution is deterministic by registration priority;
- registration cannot mutate frozen descriptors.

### Task 3: Canonical normalizer

**Files:**
- Create: `v12/data/normalizer.js`
- Test: `tests/v12_normalizer.test.cjs`

**Produces:** `makeObservation(input)`.

Rules:
- output schema is `foxyya-observation/1`;
- instrument identity is supplied by Market Core;
- observed/received timestamps and source are mandatory;
- result must pass `validateObservation` before return;
- invalid input throws a contract error rather than fabricating data.

### Task 4: Provider export and regression

**Files:**
- Create: `v12/providers/index.js`
- Modify: `v12/core/index.js` to expose `providers` and `normalizer` only after tests pass.
- Test: `tests/v12_provider_foundation.test.cjs`

Acceptance:
- all `tests/v12_*.test.cjs` pass;
- only `v12/**`, `tests/v12_*`, docs change;
- no provider can express execution-write permission;
- no live vendor API call exists in this phase.
