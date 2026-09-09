# FOXYYA v12 Asset Workspace + Crypto Read Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one market-neutral Asset Workspace read model for BTC/NVDA/2330 and a read-only adapter from the existing v11.2 Crypto Runtime snapshot into v12.

**Architecture:** Workspace owns presentation-domain composition, not market calculations. US/TW receive Research modules; Crypto may receive a read-only Execution module. The Crypto adapter validates existing runtime safety locks and complete ledger projection before exposing data.

**Tech Stack:** JavaScript/CommonJS, Node `node:test`; current Python runtime remains unchanged.

**Spec:** `docs/superpowers/specs/2026-09-09-foxyya-v12-architecture-design.md`

## Constraints

- Shared workspace shell, market-specific modules.
- No synthetic values for missing modules.
- US/TW workspace cannot contain Crypto execution state.
- Crypto bridge is read-only and only accepts `PAPER_ONLY=true`, `REAL_ORDER_LOCK=true`, runtime snapshot `status=PAPER_ONLY`, `real_orders=false`, `complete=true`.
- No changes to `service.py`, `runtime_view.py`, `live_ui.html`, `runtime_ui.js`, ledger or Railway.

### Task 1: Workspace contract
Create `v12/workspace/contracts.js` and `tests/v12_workspace_contracts.test.cjs`. Fix tabs: OVERVIEW, CHART, ANALYSIS, MARKET_DATA, NEWS, HISTORY. Validate market, instrument identity, module state and `researchOnly` boundary.

### Task 2: Workspace assembler
Create `v12/workspace/assembler.js` and `tests/v12_workspace_assembler.test.cjs`. Build a common shell with per-section state `AVAILABLE|UNAVAILABLE`. Equities reject non-null execution modules. Missing modules remain unavailable.

### Task 3: Crypto runtime read adapter
Create `v12/crypto/runtime_adapter.js` and `tests/v12_crypto_runtime_adapter.test.cjs`. Adapt existing `/api/runtime/status` + `/api/runtime/snapshot` into a v12 read-only execution object; reject lock failures, incomplete snapshots or real-order capability.

### Task 4: Stable exports + regression
Create `v12/workspace/index.js`, `v12/crypto/index.js`, update `v12/core/index.js`, add `tests/v12_workspace_crypto_foundation.test.cjs`, run all v12 tests, then verify GitHub diff remains confined to v12/tests/docs.
