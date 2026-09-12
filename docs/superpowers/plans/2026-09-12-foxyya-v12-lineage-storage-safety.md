# FOXYYA v12 Lineage Storage Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make v12 Research Staging lineage persistence bounded and capacity-aware without touching Production Execution V2 or weakening lineage integrity.

**Architecture:** Preserve `/data/foxyya-v12.lineage.jsonl` as the active append journal, add a dependency-closed compacted checkpoint journal plus a small cryptographic checkpoint audit ledger, and replay checkpoint + active journal as one logical store. Maintenance runs before predictable capacity exhaustion and after successful research refreshes; public lineage commands remain unchanged.

**Tech Stack:** Node.js 22, `node:test`, synchronous `node:fs` durability primitives, SHA-256, Railway Research Staging, GitHub Actions, Python 3.12 regression suite.

**Spec:** `docs/superpowers/specs/2026-09-12-foxyya-v12-lineage-storage-safety-design.md`

## Global Constraints

- Production Execution V2 must not be modified.
- Research Staging must remain `RESEARCH_ONLY=true` and `EXECUTION_WRITE=false`.
- Never directly delete/truncate historical lineage as a capacity shortcut; checkpoint durability precedes retirement.
- Existing enumerable store API remains exactly `recordSource`, `recordOutput`, `source`, `output`, `traceOutput`.
- Complete corruption fails closed; incomplete trailing append recovery remains supported.
- Full Node/JS/Python/safety CI must be green before staging deployment.
- P0 staging validation requires at least three refresh cycles without durable/capacity write failures before Market Data Coverage Gate work.

---

### Task 1: Lineage growth audit

**Files:**
- Modify: `v12/staging/durable_source_lineage_store.js`
- Create: `tests/v12_lineage_storage_maintenance.test.cjs`

**Interfaces:**
- Produces: `auditLineageStorage({filePath, fsImpl=fs, policy}) -> frozen audit object`
- Does not change the enumerable store API.

- [ ] **Step 1: Write failing audit test**

Create two source events and one output event, then assert audit reports exact active bytes, 3 events, 2 SOURCE/1 OUTPUT counts, largest event bytes, oldest/newest `recordedAt`, and filesystem fields when `statfsSync` is injected.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/v12_lineage_storage_maintenance.test.cjs`
Expected: FAIL because `auditLineageStorage` is not exported.

- [ ] **Step 3: Implement bounded streaming audit**

Reuse the journal event checksum/validation rules, scan with fixed-size buffers, never `readFileSync` the full journal, and return metadata only (no observations/secrets).

- [ ] **Step 4: Run focused test and lineage persistence regressions**

Run: `node --test tests/v12_lineage_storage_maintenance.test.cjs tests/v12_source_lineage_persistence.test.cjs tests/v12_lineage_bounded_replay.test.cjs`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `test(v12): audit lineage storage growth`

### Task 2: Dependency-closed checkpoint compaction

**Files:**
- Modify: `v12/staging/durable_source_lineage_store.js`
- Modify: `tests/v12_lineage_storage_maintenance.test.cjs`
- Modify: `tests/v12_lineage_bounded_replay.test.cjs`

**Interfaces:**
- Produces: `compactLineageStorage({filePath, now, fsImpl, policy}) -> {status, before, after, checkpoint}`
- Checkpoint path helpers derive sibling `.checkpoint.jsonl` and `.checkpoints.jsonl` paths deterministically.

- [ ] **Step 1: Write failing test for dependency closure**

Seed multiple old/new source-output groups. Configure a small retained-byte target. Assert compacted replay retains newest output plus every referenced source and does not retain an output whose referenced source was retired.

- [ ] **Step 2: Verify RED**

Run focused test; expected failure is missing compaction API/behavior.

- [ ] **Step 3: Implement newest-first closure selection and re-sequencing**

Stream-validate all logical events, track lightweight offsets/lengths/refs, select recent outputs newest-first with source dependency closure, write re-sequenced valid events to a temp checkpoint, fsync, and replay-verify temp before retirement.

- [ ] **Step 4: Write failing durability-order test**

Inject filesystem failures at temp fsync, audit-ledger fsync, and replacement boundaries. Assert original active journal remains intact unless durable checkpoint evidence exists.

- [ ] **Step 5: Implement checkpoint audit record and atomic replacement**

Record old/new SHA-256, bytes, event counts, retired count, and time range; fsync checkpoint ledger before resetting active journal. Return `LINEAGE_COMPACTION_SPACE_REQUIRED` for ENOSPC/temp-space failures without destroying old data.

- [ ] **Step 6: Verify GREEN and restart trace**

Run focused tests plus persistence/bounded replay/staging runtime tests. Confirm retained output trace is identical before and after restart.

- [ ] **Step 7: Commit**

Commit message: `feat(v12): add bounded lineage checkpoints`

### Task 3: Active rotation, checkpoint-ledger retention, and disk high-water protection

**Files:**
- Modify: `v12/staging/durable_source_lineage_store.js`
- Modify: `tests/v12_lineage_storage_maintenance.test.cjs`
- Modify: `tests/v12_source_lineage_persistence.test.cjs`

**Interfaces:**
- `createDurableSourceLineageStore({filePath, now, fsImpl, policy})`
- Non-enumerable `maintenance()` method may be attached for runtime use; `Object.keys(store)` must remain unchanged.

- [ ] **Step 1: Write failing rotation test**

Use a tiny active rotation threshold, append a complete source/output group, invoke maintenance, and assert active bytes are reset/bounded while retained trace remains readable from checkpoint.

- [ ] **Step 2: Verify RED, then implement rotation maintenance**

Maintenance compacts checkpoint + active when active/total byte thresholds are exceeded.

- [ ] **Step 3: Write failing high-water tests**

Inject `statfsSync` values for below-soft, above-soft, and above-critical usage. Assert soft high-water requests maintenance; critical high-water refuses an append before `writeSync`; no live index advances.

- [ ] **Step 4: Implement high-water guard**

Use both percentage thresholds and absolute reserve. Capacity exhaustion returns `LINEAGE_DISK_HIGH_WATER`; genuine I/O/fsync failures remain `DURABLE_WRITE_FAILED`.

- [ ] **Step 5: Write failing checkpoint-ledger retention-chain test**

Generate more audit records than the configured limit. Assert rolled history leaves a chain digest covering removed records and current records remain verifiable.

- [ ] **Step 6: Implement ledger retention chain and verify GREEN**

Run focused and all lineage tests.

- [ ] **Step 7: Commit**

Commit message: `feat(v12): protect lineage disk high water`

### Task 4: Runtime maintenance integration and observability

**Files:**
- Modify: `v12/staging/runtime_entry.js`
- Modify: `tests/v12_runtime_live_research_wiring.test.cjs`
- Modify: `tests/v12_staging_lineage_runtime.test.cjs`

**Interfaces:**
- `runtimeConfig()` parses optional Research Staging lineage policy env vars with strict numeric validation.
- Startup runs safe storage audit/maintenance before normal refresh scheduling.
- Successful `refreshResearch()` invokes maintenance after publish.

- [ ] **Step 1: Write failing config/runtime tests**

Assert defaults and overrides; reject invalid percentages/byte values; prove `researchOnly:true` and `executionWrite:false` remain unchanged.

- [ ] **Step 2: Verify RED**

Run runtime focused tests.

- [ ] **Step 3: Implement policy parsing and post-refresh maintenance**

Log a concise metadata-only storage summary. Never log canonical payloads or secrets.

- [ ] **Step 4: Verify GREEN**

Run runtime, staging deployment contract, lineage, and branch-scope tests.

- [ ] **Step 5: Commit**

Commit message: `feat(v12): wire lineage storage maintenance`

### Task 5: Exact-commit full CI gate

**Files:**
- Modify on isolated branch only if needed: `.github/workflows/v12-integration.yml`

**Interfaces:**
- No product behavior change.

- [ ] **Step 1: Ensure isolated branch triggers the existing v12 integration workflow**

Add `v12-lineage-p0-20260912` to the workflow branch list if no manual dispatch action is available.

- [ ] **Step 2: Run full workflow on the exact candidate commit**

Expected commands are the existing workflow steps: focused provider tests, all `tests/v12_*.test.cjs`, runtime JS regressions, `python tests/test_runtime_view.py`, and safety-string checks.

- [ ] **Step 3: Inspect every failed job/step if any**

Fix using TDD; repeat until one exact candidate SHA has a fully green workflow.

- [ ] **Step 4: Fast-forward the Railway source branch only to the already-green SHA**

Do not create a new untested merge commit.

### Task 6: Railway Research Staging recovery and three-cycle acceptance

**Files:**
- No Production Execution V2 changes.
- Research Staging Railway config/environment only.

**Interfaces:**
- `/data/foxyya-v12.lineage.jsonl` plus checkpoint siblings.

- [ ] **Step 1: Confirm available space for first safe compaction**

If current free space is below the temporary retained target, enlarge only the Research Staging volume before deploying. Do not delete lineage.

- [ ] **Step 2: Deploy exact green candidate SHA**

Verify runtime log still states `RESEARCH_ONLY=true EXECUTION_WRITE=false`.

- [ ] **Step 3: Inspect startup audit/compaction result**

Require adequate reserve and no `DURABLE_WRITE_FAILED`, `LINEAGE_DISK_HIGH_WATER`, or corruption errors.

- [ ] **Step 4: Observe at least three refresh cycles**

Each must publish successfully and keep storage within policy. A staging-only shorter validated cadence may be temporarily configured and restored to 1800 seconds after the acceptance check.

- [ ] **Step 5: Restart/redeploy once and verify retained trace replay**

Confirm health and a retained lineage output route still returns the same trace semantics.

### Task 7: Market Data Coverage Gate (only after Task 6 passes)

**Files:**
- Read spec: `docs/superpowers/specs/2026-09-12-foxyya-v12-market-data-coverage-gate-design.md`
- Implementation/test paths exactly as specified by that design after re-reading it.

- [ ] **Step 1: Re-read the coverage-gate design on the now-green P0 base**
- [ ] **Step 2: Create a separate TDD implementation plan if the design spans multiple modules**
- [ ] **Step 3: Implement RED→GREEN without modifying Production Execution V2**
- [ ] **Step 4: Run full CI again before staging deployment**

## Self-review

- Spec coverage: audit, checkpoint/compaction, rotation/retention, high-water, runtime integration, full CI, and three-cycle staging gate are all assigned to explicit tasks.
- Safety coverage: Production Execution V2 is excluded; research/execution flags are asserted in runtime tests.
- TDD coverage: every production behavior begins with a failing focused test.
- Failure safety: low-space compaction cannot destroy the current journal; capacity exhaustion is distinguished from generic durable I/O failure.
