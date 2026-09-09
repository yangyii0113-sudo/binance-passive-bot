# FOXYYA Backtest + Source Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize the exact production FOXYYA backend into a canonical Git source tree, prove behavioral parity, then add a deterministic historical replay boundary for the first ETHUSDT trailing-365-day research run without changing Control strategy semantics.

**Architecture:** Preserve the existing `foxyya.*` production package byte-for-byte during Phase 0, place it under a normal source tree, and make Docker consume that tree only after parity tests prove equivalence. Historical work then wraps the same shared strategy/risk/execution/ledger semantics with a Historical Clock, Historical Market Adapter, isolated research ledger, deterministic run manifest, metrics, and report generation.

**Tech Stack:** Python 3.12, SQLite, Binance USD-M Public Data, stdlib HTTP/JSON, existing FOXYYA runtime package, Node.js regression tests already in repo, Docker/Railway.

**Spec:** `docs/superpowers/specs/2026-09-09-foxyya-backtest-source-normalization-design.md`

## Global Constraints

- `PAPER_ONLY=true` remains mandatory.
- `REAL_ORDER_LOCK=true` remains mandatory.
- No private/signed order endpoint may be introduced.
- No Backfill.
- Fully Closed Bar only.
- Portfolio planned open risk remains `<= 1.50% NAV`.
- A/B/C/D LONG/SHORT Control behavior is frozen during this project.
- Historical runs never write to `/data/foxyya_v2_paper.sqlite`.
- Historical results are labeled `HISTORICAL BACKTEST` / `歷史模擬・非 Forward Performance`.
- No return/win-rate/trade-count threshold is an acceptance criterion.

---

### Task 1: Establish exact production archive manifest

**Files:**
- Create: `tools/extract_production_backend.py`
- Create: `tests/test_source_parity.py`
- Create: `artifacts/source-parity/production_manifest.json`

**Interfaces:**
- Consumes: `backend_parts2/part00..part04`.
- Produces: deterministic archive SHA256, member list, member SHA256 map, and extracted tree under a caller-supplied directory.

- [ ] **Step 1: Write the failing parity test**

```python
from pathlib import Path
from tools.extract_production_backend import reconstruct_archive, archive_manifest


def test_reconstructed_archive_matches_known_production_shape(tmp_path: Path):
    archive = reconstruct_archive(Path('backend_parts2'))
    manifest = archive_manifest(archive)
    assert 'foxyya_runtime_backend/src/foxyya/runner.py' in manifest['members']
    assert 'foxyya_runtime_backend/src/foxyya/execution.py' in manifest['members']
    assert manifest['archive_sha256']
```

- [ ] **Step 2: Run test and verify RED**

Run: `python -m pytest tests/test_source_parity.py -v`
Expected: FAIL because `tools.extract_production_backend` does not exist.

- [ ] **Step 3: Implement deterministic reconstruction helper**

The helper must concatenate `part00..part04` in lexical order, Base64-decode with validation, verify ZIP integrity, reject duplicate member names, and calculate SHA256 for archive and every file member.

- [ ] **Step 4: Run the parity test GREEN**

Run: `python -m pytest tests/test_source_parity.py -v`
Expected: PASS.

- [ ] **Step 5: Generate `production_manifest.json` from the exact archive**

The manifest records archive hash, each member path/hash/size, and source part hashes.

- [ ] **Step 6: Commit**

```bash
git add tools/extract_production_backend.py tests/test_source_parity.py artifacts/source-parity/production_manifest.json
git commit -m "test: lock production backend archive manifest"
```

### Task 2: Normalize production source tree byte-for-byte

**Files:**
- Create: `src/foxyya/*` exactly from `foxyya_runtime_backend/src/foxyya/*` in the archive.
- Create: `FOXYYA_V2_CONFIG.json` from the production archive copy only if the canonical runtime currently depends on that exact config file.
- Modify: `tests/test_source_parity.py`

**Interfaces:**
- Consumes: manifest from Task 1.
- Produces: canonical `src/foxyya/` whose file hashes match the production archive members exactly.

- [ ] **Step 1: Extend the failing test**

```python
def test_normalized_source_hashes_match_production_manifest():
    # Compare every src/foxyya file to the corresponding archived member.
    ...
```

The first run must FAIL because `src/foxyya/` is absent.

- [ ] **Step 2: Extract only the production `src/foxyya/` package into repository `src/foxyya/`**

Do not rename, split, refactor, reformat, or edit strategy code.

- [ ] **Step 3: Re-run parity test**

Run: `python -m pytest tests/test_source_parity.py -v`
Expected: PASS with exact hash equality.

- [ ] **Step 4: Run existing Python and JavaScript regression tests**

Run:
```bash
python -m pytest tests/test_runtime_view.py -v
node --test tests/*.test.cjs
```
Expected: all existing tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests/test_source_parity.py
git commit -m "refactor: normalize production foxyya source tree"
```

### Task 3: Switch Docker to canonical source tree under parity protection

**Files:**
- Modify: `Dockerfile`
- Modify: `tests/test_source_parity.py`

**Interfaces:**
- Consumes: canonical `src/foxyya/`.
- Produces: Docker image with the same import path and runtime files but without Base64/ZIP reconstruction.

- [ ] **Step 1: Add failing packaging assertion**

Test that `Dockerfile` no longer references `backend_parts2`, `runtime_backend.b64`, Base64 decoding, or ZIP extraction, and that it copies canonical source into `/app/foxyya_runtime_backend/src/foxyya` or equivalent import-compatible location.

- [ ] **Step 2: Verify RED**

Run: `python -m pytest tests/test_source_parity.py -v`
Expected: FAIL against current Dockerfile.

- [ ] **Step 3: Make the minimal Dockerfile change**

Keep Python version, workdir, `PYTHONPATH`, `PAPER_ONLY`, `REAL_ORDER_LOCK`, DB paths, port and startup command unchanged.

- [ ] **Step 4: Verify tests and image build**

Run:
```bash
python -m pytest tests/test_source_parity.py tests/test_runtime_view.py -v
node --test tests/*.test.cjs
docker build -t foxyya-source-parity .
```
Expected: all tests PASS and Docker build exits 0.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile tests/test_source_parity.py
git commit -m "build: load FOXYYA runtime from canonical source tree"
```

### Task 4: Add Historical Clock and lookahead guard

**Files:**
- Create: `backtest/__init__.py`
- Create: `backtest/historical_clock.py`
- Create: `tests/test_no_lookahead.py`
- Create: `tests/test_future_legal_open.py`

**Interfaces:**
- Produces: `HistoricalClock(now_ms: int)`, `advance_to(timestamp_ms: int)`, and validation helpers that reject future observations.

- [ ] **Step 1: Write failing tests**

Tests must prove monotonic clock advancement, future timestamp rejection, and that a decision after an hourly open resolves to the next legal hour rather than backfilling the previous open.

- [ ] **Step 2: Verify RED**

Run: `python -m pytest tests/test_no_lookahead.py tests/test_future_legal_open.py -v`
Expected: FAIL because backtest clock module is absent.

- [ ] **Step 3: Implement minimal Historical Clock**

No market or strategy logic belongs in this file.

- [ ] **Step 4: Verify GREEN**

Run same tests; expected PASS.

- [ ] **Step 5: Commit**

```bash
git add backtest tests/test_no_lookahead.py tests/test_future_legal_open.py
git commit -m "feat: add deterministic historical clock"
```

### Task 5: Add Historical Market Adapter and input manifest

**Files:**
- Create: `backtest/historical_market.py`
- Create: `backtest/data_manifest.py`
- Create: `tests/test_historical_market.py`

**Interfaces:**
- Consumes: pre-fetched Binance USD-M public 1H/4H/1D/funding rows.
- Produces: time-filtered snapshot-compatible data and a hash-addressed data manifest.

- [ ] **Step 1: Write failing tests**

Tests prove that each interval hides bars whose close time is after `clock.now_ms`, missing data remains unavailable, row order/duplicates are validated, and identical input data yields identical manifest hashes.

- [ ] **Step 2: Verify RED**

Run: `python -m pytest tests/test_historical_market.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement adapter and manifest**

Use native 1H/4H/1D inputs; do not create custom timeframe aggregation unless existing production code already does so.

- [ ] **Step 4: Verify GREEN**

Run test; expected PASS.

- [ ] **Step 5: Commit**

```bash
git add backtest/historical_market.py backtest/data_manifest.py tests/test_historical_market.py
git commit -m "feat: add historical market adapter"
```

### Task 6: Add isolated replay engine and parity tests

**Files:**
- Create: `backtest/replay_engine.py`
- Create: `backtest/research_ledger.py`
- Create: `tests/test_backtest_forward_parity.py`
- Create: `tests/test_risk_parity.py`
- Create: `tests/test_cost_parity.py`

**Interfaces:**
- Consumes: shared `ForwardRunner` behavior, Historical Clock, Historical Market Adapter, explicit research DB path.
- Produces: deterministic research events without touching `/data/foxyya_v2_paper.sqlite`.

- [ ] **Step 1: Write failing isolation/parity tests**

Tests must verify production DB path is rejected, identical controlled snapshots produce identical sizing/legal-open behavior, and repeated replay with identical manifest yields identical event sequence.

- [ ] **Step 2: Verify RED**

Run the three parity test modules; expected FAIL.

- [ ] **Step 3: Implement the minimal replay orchestrator**

Call shared production strategy/risk/execution functions; do not copy A/B/C/D predicates.

- [ ] **Step 4: Verify GREEN plus all Phase 0 regressions**

Run:
```bash
python -m pytest tests -v
node --test tests/*.test.cjs
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backtest tests
git commit -m "feat: add isolated shared-core historical replay"
```

### Task 7: Add metrics/reporting and ETHUSDT trailing-365-day CLI

**Files:**
- Create: `backtest/metrics.py`
- Create: `backtest/report.py`
- Create: `backtest/cli.py`
- Create: `tests/test_eth_one_year_replay.py`

**Interfaces:**
- Produces `artifacts/backtests/<run_id>/{events.sqlite,data_manifest.json,run_config.json,metrics.json,report.json}`.

- [ ] **Step 1: Write failing report-contract test**

Assert required provenance, gross/net separation, funnel, sample-size labels, cost attribution and historical-only labels.

- [ ] **Step 2: Verify RED**

Run: `python -m pytest tests/test_eth_one_year_replay.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement metrics/report/CLI contract**

Resolve `end_time` at the first not-yet-closed 1H boundary, `start_time=end_time-365d`, fetch sufficient pre-window warm-up, and exclude warm-up events from KPI trade counts/P&L.

- [ ] **Step 4: Run deterministic fixture replay**

Same fixture twice must produce identical metrics and event hashes.

- [ ] **Step 5: Run live-public-data ETHUSDT 365-day research only after fixture/parity gates pass**

A negative result remains valid. Fail closed on missing provenance or integrity errors.

- [ ] **Step 6: Commit**

```bash
git add backtest tests/test_eth_one_year_replay.py artifacts/backtests
git commit -m "feat: add ETHUSDT 365-day backtest reporting"
```

### Task 8: Final verification before merge/review

- [ ] Run full Python tests.
- [ ] Run full Node regression tests.
- [ ] Build Docker image.
- [ ] Verify production safety strings and DB path isolation.
- [ ] Compare feature branch against its base and ensure no A/B/C/D Control source file differs from the extracted production hashes except packaging/import-location changes proven by manifest.
- [ ] Check Railway production remains on the existing successful `main` deployment until explicit merge/deploy approval.
