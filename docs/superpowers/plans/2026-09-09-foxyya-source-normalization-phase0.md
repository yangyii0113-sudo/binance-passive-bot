# FOXYYA Source Normalization Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the opaque production Base64/ZIP backend packaging with an exact canonical Git source tree while proving runtime behavior and safety invariants remain unchanged.

**Architecture:** Decode the exact archive currently assembled from `backend_parts2`, commit its existing source files without semantic edits, then make tests import that normalized tree. Only after parity evidence passes will Docker switch from archive reconstruction to direct source copy. Historical replay is intentionally excluded from this Phase 0 plan.

**Tech Stack:** Python 3.12, pytest/unittest-compatible Python tests, Node.js built-in test runner for existing `.cjs` regressions, Docker, GitHub, Railway.

**Spec:** `docs/superpowers/specs/2026-09-09-foxyya-backtest-source-normalization-design.md`

## Global Constraints

- `PAPER_ONLY=true` remains mandatory.
- `REAL_ORDER_LOCK=true` remains mandatory.
- No private/signed exchange order endpoint may be introduced.
- No real-order capability may be added.
- No strategy-semantic changes to A/B/C/D or LONG/SHORT Control rules.
- No Backfill behavior changes.
- Fully Closed Bar behavior remains unchanged.
- Portfolio planned open risk remains `<= 1.50% NAV`.
- Production ledger path remains `/data/foxyya_v2_paper.sqlite`.
- `main` and Railway production remain untouched until parity gates pass.

---

### Task 1: Reconstruct and inventory the exact production archive

**Files:**
- Read: `backend_parts2/part00` ... `backend_parts2/part04`
- Create: `tools/verify_runtime_archive.py`
- Create: `tests/test_source_parity.py`

**Interfaces:**
- Produces `assemble_runtime_archive(parts_dir: Path) -> bytes`.
- Produces `archive_manifest(archive_bytes: bytes) -> dict[str, str]` mapping ZIP member path to SHA-256.

- [ ] Write `tests/test_source_parity.py` first. The test must concatenate `part00..part04`, Base64-decode with validation, open the ZIP, assert no duplicate member names, and assert every file member has a SHA-256 entry.
- [ ] Run `python -m pytest tests/test_source_parity.py -v` and verify RED because `tools.verify_runtime_archive` does not exist.
- [ ] Implement only `assemble_runtime_archive` and `archive_manifest` in `tools/verify_runtime_archive.py`.
- [ ] Re-run the parity test and verify GREEN.
- [ ] Record the resulting archive/member manifest in test output or a generated local artifact; do not change production files.
- [ ] Commit with `test: inventory production runtime archive`.

### Task 2: Materialize the canonical source tree without semantic edits

**Files:**
- Create: exact extracted archive files under their canonical paths, including `src/foxyya/*` and existing runtime config files.
- Modify: `tests/test_source_parity.py`

**Interfaces:**
- Consumes `archive_manifest()` from Task 1.
- Produces a checked-in normalized tree whose file bytes match archive members exactly.

- [ ] Extend `tests/test_source_parity.py` so every normalized file corresponding to an archive member is hashed and compared byte-for-byte by SHA-256.
- [ ] Run the test and verify RED because normalized files are absent.
- [ ] Extract the archive exactly; do not rename, reformat, split, lint-fix, or otherwise edit extracted source.
- [ ] Run the parity test and verify every compared hash matches.
- [ ] Inspect Git diff and reject any semantic change not explained by archive extraction.
- [ ] Commit with `refactor: materialize canonical FOXYYA source tree`.

### Task 3: Run the existing regression baseline against normalized source

**Files:**
- Modify only test/bootstrap path configuration if necessary; do not modify strategy behavior.
- Existing tests: `tests/runtime_bridge.test.cjs`, `tests/runtime_layout.test.cjs`, `tests/runtime_metrics.test.cjs`, `tests/test_runtime_view.py`.

**Interfaces:**
- Consumes normalized source tree from Task 2.
- Produces fresh baseline evidence before Docker changes.

- [ ] Run `python -m pytest tests/test_runtime_view.py tests/test_source_parity.py -v`.
- [ ] Run `node --test tests/runtime_bridge.test.cjs tests/runtime_layout.test.cjs tests/runtime_metrics.test.cjs`.
- [ ] If either command fails, stop Phase 0 and diagnose the baseline; do not edit strategy logic to force green.
- [ ] Verify imports resolve from the normalized source tree rather than a reconstructed archive.
- [ ] Commit only bootstrap/test-path changes, if any, with `test: validate normalized runtime baseline`.

### Task 4: Add explicit safety invariant tests before packaging changes

**Files:**
- Create: `tests/test_runtime_safety.py`
- Read: `service.py`, normalized `src/foxyya/security.py`, config module and market client.

**Interfaces:**
- Produces regression gates for `PAPER_ONLY`, `REAL_ORDER_LOCK`, production DB path default, and absence of signed/private order capability.

- [ ] Write failing or characterization tests asserting service status reports paper-only and real-order-lock true, startup rejects a false real-order lock, default DB path is `/data/foxyya_v2_paper.sqlite`, and repository runtime code contains no callable signed-order path.
- [ ] Run `python -m pytest tests/test_runtime_safety.py -v` and verify the test meaningfully exercises current behavior; if a safety assertion fails, stop and report it rather than changing the assertion.
- [ ] Add only test seams required to observe existing behavior; no trading behavior changes.
- [ ] Re-run all Python and Node regressions.
- [ ] Commit with `test: lock FOXYYA paper safety invariants`.

### Task 5: Switch Docker to direct canonical source copy

**Files:**
- Modify: `Dockerfile`
- Test: `tests/test_source_parity.py`, `tests/test_runtime_safety.py`

**Interfaces:**
- Docker image must expose the same `service.py` entrypoint and `PYTHONPATH` behavior while sourcing `foxyya` directly from checked-in files.

- [ ] Add a packaging assertion to `tests/test_source_parity.py` that rejects `backend_parts2`, runtime Base64 concatenation, and ZIP extraction in the final Dockerfile.
- [ ] Run the test and verify RED against the current Dockerfile.
- [ ] Replace archive reconstruction with direct `COPY` statements for the normalized runtime/source tree; preserve Python 3.12, `/data`, environment defaults, port 8080 and `CMD ["python","service.py"]`.
- [ ] Run the full Python and Node regression suites and verify GREEN.
- [ ] Build the image locally with `docker build -t foxyya-source-normalized .` when Docker is available. If Docker is unavailable in the execution environment, do not claim build success; use CI/Railway preview evidence before merge.
- [ ] Commit with `build: use canonical FOXYYA source tree`.

### Task 6: Branch deployment/parity checkpoint before main

**Files:**
- No strategy files changed.
- Railway/GitHub deployment metadata only.

**Interfaces:**
- Produces deployment evidence from the feature branch without changing production `main`.

- [ ] Compare feature branch diff against the approved spec and confirm only normalization, tests, and packaging changed.
- [ ] Run all available tests again immediately before deployment/PR.
- [ ] Deploy only to an isolated preview/staging service if available; never repoint the current production service during this task.
- [ ] Verify preview `/health` or `/api/runtime/status` reports `paper_only=true`, `real_order_lock=true`, ledger integrity healthy, and runtime cycles advance.
- [ ] Compare a controlled ledger/API fixture projection between old packaging and normalized packaging; require identical semantic output for the fixture.
- [ ] If parity evidence passes, open a PR to `main` documenting hashes, tests, deployment evidence and the fact that strategy semantics are unchanged. Do not merge automatically.

## Phase 0 Exit Gate

Phase 0 is complete only when all of the following have fresh evidence:

- Canonical extracted files match the production archive by hash.
- Existing Python and Node regressions pass against normalized source.
- Safety invariant tests pass.
- Docker no longer reconstructs runtime from Base64/ZIP.
- Preview/staging runtime remains PAPER_ONLY with REAL_ORDER_LOCK.
- Controlled runtime/ledger projection is semantically identical.
- Production `main` has not been changed before review.

Only after this gate is reviewed should the next plan implement Historical Clock, Historical Market Adapter, isolated research ledger, deterministic replay, metrics and ETHUSDT 365-day study.