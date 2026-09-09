# FOXYYA Phase 1 Historical Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, no-lookahead historical time/data foundation for FOXYYA and an isolated research-ledger boundary, without changing Forward Paper strategy semantics.

**Architecture:** Add a small `backtest/` package that wraps the existing `src/foxyya` core rather than copying strategy logic. `HistoricalClock` owns replay time; `HistoricalMarketAdapter` owns visibility-filtered native 1H/4H/1D data and input provenance; `ResearchLedgerFactory` creates append-only `EventLedger` files only under an explicit research artifact root and refuses the production ledger path. Replay orchestration, metrics, costs and UI remain out of scope for this phase.

**Tech Stack:** Python 3.12, standard library only, existing `foxyya.ledger.EventLedger`, pytest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-09-foxyya-backtest-source-normalization-design.md`

## Global Constraints

- `PAPER_ONLY=true` remains mandatory.
- `REAL_ORDER_LOCK=true` remains mandatory.
- No private/signed exchange endpoint may be introduced.
- No Backfill: historical decisions may never fill an already-passed legal open.
- Strategy inputs expose only fully closed bars.
- Native Binance USD-M 1H, 4H and Daily intervals are used; no custom aggregation is introduced.
- Portfolio planned open risk remains `<= 1.50% NAV`; this phase does not modify sizing/risk code.
- A/B/C/D and LONG/SHORT Control rules remain frozen.
- Historical artifacts must never write `/data/foxyya_v2_paper.sqlite`.
- Missing historical data is explicit; it is never fabricated.
- Every dataset accepted by the adapter records symbol, interval, first/last timestamp, row count and SHA-256 content hash.

---

### Task 1: Deterministic Historical Clock

**Files:**
- Create: `backtest/__init__.py`
- Create: `backtest/historical_clock.py`
- Create: `tests/test_no_lookahead.py`
- Create: `.github/workflows/phase1-ci.yml`

**Interfaces:**
- Produces: `HistoricalClock(start_ms: int, end_ms: int, now_ms: int | None = None)`
- Produces: `HistoricalClock.now_ms -> int`
- Produces: `HistoricalClock.advance_to(target_ms: int) -> int`
- Produces: `HistoricalClock.visible(close_ms: int) -> bool`
- Produces: `HistoricalClock.next_hour_open(after_ms: int | None = None) -> int`
- Produces: `resolve_execution_window(latest_open_ms: int, days: int = 365) -> tuple[int, int]`

- [ ] **Step 1: Write failing clock tests**

```python
from backtest.historical_clock import HistoricalClock, HOUR_MS, resolve_execution_window


def test_future_close_is_invisible_until_clock_reaches_close():
    clock = HistoricalClock(start_ms=0, end_ms=3 * HOUR_MS, now_ms=HOUR_MS - 1)
    assert clock.visible(HOUR_MS) is False
    clock.advance_to(HOUR_MS)
    assert clock.visible(HOUR_MS) is True


def test_clock_cannot_move_backward_or_past_end():
    clock = HistoricalClock(start_ms=HOUR_MS, end_ms=3 * HOUR_MS)
    with pytest.raises(ValueError, match="historical clock cannot move backward"):
        clock.advance_to(HOUR_MS - 1)
    with pytest.raises(ValueError, match="historical clock cannot move past end"):
        clock.advance_to(3 * HOUR_MS + 1)


def test_next_hour_open_is_strictly_future():
    clock = HistoricalClock(start_ms=0, end_ms=10 * HOUR_MS, now_ms=HOUR_MS + 1)
    assert clock.next_hour_open() == 2 * HOUR_MS
    assert clock.next_hour_open(2 * HOUR_MS) == 3 * HOUR_MS


def test_trailing_window_ends_at_first_not_yet_closed_open():
    start_ms, end_ms = resolve_execution_window(400 * 86_400_000, days=365)
    assert end_ms == 400 * 86_400_000
    assert start_ms == 35 * 86_400_000
```

- [ ] **Step 2: Add feature-branch CI and run RED**

Create `.github/workflows/phase1-ci.yml` to run on pushes to `feat/foxyya-backtest-phase1-historical-core` and PRs to `main`:

```yaml
name: FOXYYA Phase 1 Historical Core
on:
  push:
    branches:
      - feat/foxyya-backtest-phase1-historical-core
  pull_request:
    branches:
      - main
  workflow_dispatch:
permissions:
  contents: read
jobs:
  historical-core:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: python -m pip install --disable-pip-version-check pytest
      - name: Historical clock / visibility
        env:
          PYTHONPATH: src:.
        run: python -m pytest tests/test_no_lookahead.py -v
```

Expected: FAIL because `backtest.historical_clock` does not exist.

- [ ] **Step 3: Implement the minimal clock**

```python
HOUR_MS = 3_600_000
DAY_MS = 86_400_000

class HistoricalClock:
    def __init__(self, start_ms, end_ms, now_ms=None):
        self.start_ms = int(start_ms)
        self.end_ms = int(end_ms)
        if self.end_ms <= self.start_ms:
            raise ValueError("end_ms must be after start_ms")
        self._now_ms = self.start_ms if now_ms is None else int(now_ms)
        if not self.start_ms <= self._now_ms <= self.end_ms:
            raise ValueError("now_ms outside historical window")

    @property
    def now_ms(self):
        return self._now_ms

    def advance_to(self, target_ms):
        target_ms = int(target_ms)
        if target_ms < self._now_ms:
            raise ValueError("historical clock cannot move backward")
        if target_ms > self.end_ms:
            raise ValueError("historical clock cannot move past end")
        self._now_ms = target_ms
        return self._now_ms

    def visible(self, close_ms):
        return int(close_ms) <= self._now_ms

    def next_hour_open(self, after_ms=None):
        value = self._now_ms if after_ms is None else int(after_ms)
        return (value // HOUR_MS + 1) * HOUR_MS


def resolve_execution_window(latest_open_ms, days=365):
    end_ms = int(latest_open_ms)
    return end_ms - int(days) * DAY_MS, end_ms
```

- [ ] **Step 4: Run clock tests GREEN**

Run: `PYTHONPATH=src:. python -m pytest tests/test_no_lookahead.py -v`
Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add backtest/__init__.py backtest/historical_clock.py tests/test_no_lookahead.py .github/workflows/phase1-ci.yml
git commit -m "feat: add deterministic historical clock"
```

---

### Task 2: Historical Dataset Visibility + Provenance Manifest

**Files:**
- Create: `backtest/historical_market.py`
- Create: `tests/test_historical_market.py`
- Modify: `.github/workflows/phase1-ci.yml`

**Interfaces:**
- Consumes: `HistoricalClock`
- Produces: `HistoricalDataset(symbol: str, exchange_info: dict, rows_by_interval: dict[str, list[list]], funding_rows: list[dict] | None = None)`
- Produces: `HistoricalDataset.manifest() -> dict`
- Produces: `HistoricalMarketAdapter(dataset: HistoricalDataset, clock: HistoricalClock)`
- Produces: `HistoricalMarketAdapter.visible_rows(interval: str) -> list[list]`
- Produces: `HistoricalMarketAdapter.snapshot() -> dict`

The adapter accepts already-retrieved public Binance rows. Network retrieval is intentionally deferred so integrity can be tested independently from HTTP availability.

- [ ] **Step 1: Write failing market tests**

Use synthetic native Binance row arrays with close time at index 6 and quote-asset volume at index 7.

```python
from backtest.historical_clock import HistoricalClock, HOUR_MS
from backtest.historical_market import HistoricalDataset, HistoricalMarketAdapter


def row(open_ms, close_ms, open_=100, high=110, low=90, close=105, volume=10, quote_volume=1000):
    return [open_ms, str(open_), str(high), str(low), str(close), str(volume), close_ms, str(quote_volume)]


def test_each_interval_filters_by_its_own_close_time():
    clock = HistoricalClock(0, 10 * HOUR_MS, now_ms=2 * HOUR_MS)
    dataset = HistoricalDataset(
        symbol="ETHUSDT",
        exchange_info={"symbols": []},
        rows_by_interval={
            "1h": [row(0, HOUR_MS), row(HOUR_MS, 2 * HOUR_MS), row(2 * HOUR_MS, 3 * HOUR_MS)],
            "4h": [row(0, 4 * HOUR_MS)],
            "1d": [row(0, 24 * HOUR_MS)],
        },
    )
    market = HistoricalMarketAdapter(dataset, clock)
    assert len(market.visible_rows("1h")) == 2
    assert market.visible_rows("4h") == []
    assert market.visible_rows("1d") == []


def test_non_monotonic_or_duplicate_rows_fail_closed():
    with pytest.raises(ValueError, match="non-monotonic historical rows"):
        HistoricalDataset("ETHUSDT", {}, {"1h": [row(HOUR_MS, 2*HOUR_MS), row(0, HOUR_MS)], "4h": [], "1d": []})
    with pytest.raises(ValueError, match="duplicate historical close timestamp"):
        HistoricalDataset("ETHUSDT", {}, {"1h": [row(0, HOUR_MS), row(0, HOUR_MS)], "4h": [], "1d": []})


def test_manifest_hash_is_stable_and_changes_with_input_bytes():
    first = HistoricalDataset("ETHUSDT", {}, {"1h": [row(0, HOUR_MS)], "4h": [], "1d": []})
    second = HistoricalDataset("ETHUSDT", {}, {"1h": [row(0, HOUR_MS)], "4h": [], "1d": []})
    changed = HistoricalDataset("ETHUSDT", {}, {"1h": [row(0, HOUR_MS, close=106)], "4h": [], "1d": []})
    assert first.manifest() == second.manifest()
    assert first.manifest()["datasets"]["1h"]["sha256"] != changed.manifest()["datasets"]["1h"]["sha256"]
```

- [ ] **Step 2: Run market tests RED**

Run: `PYTHONPATH=src:. python -m pytest tests/test_historical_market.py -v`
Expected: FAIL because `backtest.historical_market` does not exist.

- [ ] **Step 3: Implement immutable dataset validation and canonical hashing**

Use canonical JSON with sorted keys and compact separators for content hashes. Validate every supported interval independently:

```python
SUPPORTED_INTERVALS = ("1h", "4h", "1d")

def _canonical_bytes(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")
```

For each interval:
- coerce rows to an immutable tuple-of-tuples internally;
- require close times (`row[6]`) to be strictly increasing;
- reject duplicates;
- write manifest fields `symbol`, `interval`, `first_close_ms`, `last_close_ms`, `row_count`, `sha256`;
- include funding dataset hash when supplied.

- [ ] **Step 4: Implement visibility and runner-compatible snapshot shape**

`visible_rows(interval)` returns only rows where `close_ms <= clock.now_ms`.

`snapshot()` returns at least:

```python
{
    "exchange_info": dataset.exchange_info,
    "tickers": {"ETHUSDT": historical_ticker},
    "klines": {"ETHUSDT": {"1h": bars_1h, "4h": bars_4h, "1d": bars_1d}},
    "steps": {"ETHUSDT": inferred_step},
    "marks": {"ETHUSDT": latest_closed_1h_close},
    "funding_rates": {},
    "hour_open_prices": current_legal_hour_open_if_present,
    "realized_funding": funding_events_with_fundingTime_lte_now,
    "major_returns": {"BTC": 0.0, "ETH": historical_24h_return, "SOL": 0.0},
    "breadth": 0.5,
    "volatility": "NORMAL",
    "benchmark_return_24h": 0.0,
    "eligible_universe_count": 1,
    "built_at_ms": clock.now_ms,
    "historical": True,
    "historical_provenance": {
        "mark_proxy": "last_fully_closed_1h_close",
        "ticker_24h": "derived_from_visible_native_1h_rows",
    },
}
```

The historical 24H ticker is derived only from visible native 1H rows. `quoteVolume` is the sum of quote-volume field `row[7]` over at most the latest 24 visible 1H rows. `priceChangePercent` uses only visible closes.

The mark proxy is explicit in `historical_provenance`; it is not silently presented as native mark-price history. Later replay work may replace it with native mark-price kline data.

- [ ] **Step 5: Run market tests GREEN and add snapshot assertions**

Run: `PYTHONPATH=src:. python -m pytest tests/test_historical_market.py tests/test_no_lookahead.py -v`
Expected: PASS.

Add assertions proving a future 1H row is absent from both `visible_rows()` and `snapshot()["klines"]` until its close timestamp.

- [ ] **Step 6: Update CI and commit Task 2**

Add `tests/test_historical_market.py` to the Phase 1 CI test command, then commit:

```bash
git add backtest/historical_market.py tests/test_historical_market.py .github/workflows/phase1-ci.yml
git commit -m "feat: add historical market visibility adapter"
```

---

### Task 3: Research Ledger Isolation + Deterministic Run Identity

**Files:**
- Create: `backtest/research_ledger.py`
- Create: `tests/test_research_ledger.py`
- Modify: `.github/workflows/phase1-ci.yml`

**Interfaces:**
- Consumes: existing `foxyya.ledger.EventLedger`
- Produces: `PRODUCTION_LEDGER = Path("/data/foxyya_v2_paper.sqlite")`
- Produces: `deterministic_run_id(*, strategy_version: str, git_sha: str, symbol: str, start_ms: int, end_ms: int, config: dict) -> str`
- Produces: `ResearchLedgerFactory(root: Path)`
- Produces: `ResearchLedgerFactory.open(run_id: str) -> tuple[EventLedger, Path]`

- [ ] **Step 1: Write failing isolation tests**

```python
from pathlib import Path
import pytest
from backtest.research_ledger import PRODUCTION_LEDGER, ResearchLedgerFactory, deterministic_run_id


def test_research_factory_refuses_production_ledger_root():
    with pytest.raises(ValueError, match="production ledger path is forbidden"):
        ResearchLedgerFactory(PRODUCTION_LEDGER.parent)


def test_run_id_is_deterministic_and_config_sensitive():
    args = dict(strategy_version="FOXYYA-EXEC-V2-20260908", git_sha="abc123", symbol="ETHUSDT", start_ms=1, end_ms=2)
    a = deterministic_run_id(**args, config={"mark_proxy": "close"})
    b = deterministic_run_id(**args, config={"mark_proxy": "close"})
    c = deterministic_run_id(**args, config={"mark_proxy": "native"})
    assert a == b
    assert a != c


def test_research_ledger_lives_under_run_directory_and_is_append_only(tmp_path):
    factory = ResearchLedgerFactory(tmp_path / "artifacts" / "backtests")
    ledger, path = factory.open("run-abc")
    assert path == (tmp_path / "artifacts" / "backtests" / "run-abc" / "events.sqlite").resolve()
    ledger.append({"event_id": "e1", "kind": "TEST"})
    assert ledger.verify() is True
    ledger.close()
```

Also reject empty run IDs, `..`, path separators, and any resolved path equal to the production DB.

- [ ] **Step 2: Run isolation tests RED**

Run: `PYTHONPATH=src:. python -m pytest tests/test_research_ledger.py -v`
Expected: FAIL because `backtest.research_ledger` does not exist.

- [ ] **Step 3: Implement deterministic run ID**

Canonicalize this payload and hash it with SHA-256:

```python
{
    "strategy_version": strategy_version,
    "git_sha": git_sha,
    "symbol": symbol,
    "start_ms": int(start_ms),
    "end_ms": int(end_ms),
    "config": config,
}
```

Return `"bt-" + digest[:24]`.

- [ ] **Step 4: Implement guarded research ledger factory**

Requirements:
- resolve `root` immediately;
- reject `root == Path('/data').resolve()` and `root == PRODUCTION_LEDGER.resolve()`;
- validate `run_id` with regex `^[A-Za-z0-9._-]+$` and reject `.`/`..`;
- resolve `run_dir = root / run_id` and require it remains under `root`;
- create `run_dir`;
- set ledger path exactly `run_dir / 'events.sqlite'`;
- reject if that path resolves to `PRODUCTION_LEDGER`;
- return existing `foxyya.ledger.EventLedger` so append-only hashing semantics are shared with Forward Paper.

- [ ] **Step 5: Run isolation tests GREEN**

Run: `PYTHONPATH=src:. python -m pytest tests/test_research_ledger.py tests/test_no_lookahead.py tests/test_historical_market.py -v`
Expected: PASS.

- [ ] **Step 6: Update CI and commit Task 3**

```bash
git add backtest/research_ledger.py tests/test_research_ledger.py .github/workflows/phase1-ci.yml
git commit -m "feat: isolate historical research ledger"
```

---

### Task 4: Historical Core Integrity Gate

**Files:**
- Create: `tests/test_historical_core_integrity.py`
- Modify: `.github/workflows/phase1-ci.yml`

**Interfaces:**
- Consumes: `HistoricalClock`, `HistoricalDataset`, `HistoricalMarketAdapter`, `ResearchLedgerFactory`, `deterministic_run_id`
- Produces: an end-to-end Phase 1 integrity fixture proving deterministic visibility + provenance + research-ledger isolation.

- [ ] **Step 1: Write integration test before any integration helper**

The fixture must:
1. create deterministic ETHUSDT 1H/4H/1D rows;
2. construct a clock before the newest 1H close and assert that bar is invisible;
3. advance to the close and assert it becomes visible;
4. write the adapter manifest to a temporary `data_manifest.json` using canonical JSON;
5. derive a deterministic `run_id` from strategy version/Git SHA/window/config;
6. open a research ledger and append a `BACKTEST_RUN_STARTED` event containing `run_id`, strategy version, Git SHA, symbol, window and manifest hashes;
7. verify the ledger hash chain;
8. assert the ledger path is outside `/data` and the production DB path is untouched.

- [ ] **Step 2: Run the integration test RED if any required contract is missing**

Run: `PYTHONPATH=src:. python -m pytest tests/test_historical_core_integrity.py -v`
Expected: PASS only if Tasks 1-3 expose the planned interfaces; otherwise fix the smallest missing contract without adding Replay Engine behavior.

- [ ] **Step 3: Add full Phase 1 + Phase 0 regression command**

Update `phase1-ci.yml` to run:

```bash
PYTHONPATH=src:. python -m pytest \
  tests/test_no_lookahead.py \
  tests/test_historical_market.py \
  tests/test_research_ledger.py \
  tests/test_historical_core_integrity.py \
  tests/test_source_parity.py \
  tests/test_packaging_runtime_parity.py \
  tests/test_normalized_imports.py \
  tests/test_runtime_safety.py \
  tests/test_runtime_view.py -v
node --test tests/runtime_bridge.test.cjs tests/runtime_layout.test.cjs tests/runtime_metrics.test.cjs
docker build -t foxyya-phase1-check .
docker run --rm --entrypoint python foxyya-phase1-check -c "import foxyya; assert foxyya.REAL_ORDER_LOCK is True"
```

- [ ] **Step 4: Verify full suite GREEN**

Expected:
- historical core tests pass;
- Phase 0 byte/projection parity remains green;
- Forward Python/Node regressions remain green;
- Docker image still imports the production core with `REAL_ORDER_LOCK=True`.

- [ ] **Step 5: Commit Task 4**

```bash
git add tests/test_historical_core_integrity.py .github/workflows/phase1-ci.yml
git commit -m "test: gate historical core integrity"
```

---

## Self-Review Against Approved Spec

- Historical Clock: covered by Task 1.
- Fully Closed Bar / future bars invisible: Tasks 1, 2 and 4.
- Native 1H/4H/Daily filtering by each close time: Task 2.
- No custom timeframe aggregation: enforced by supported native intervals only.
- Historical input manifest + SHA-256 hashes: Tasks 2 and 4.
- Missing/future data is not fabricated: Task 2 validation/visibility contract.
- Research ledger must never write production SQLite: Tasks 3 and 4.
- Deterministic run identity with strategy/Git/window/config provenance: Task 3.
- PAPER_ONLY / REAL_ORDER_LOCK / existing Forward behavior: Phase 0 regressions rerun in Task 4.
- Future Legal Open integration into actual execution: intentionally deferred to Replay Engine phase, because this plan builds only the historical foundation.
- Cost model, funding fidelity, metrics/reporting, ETH 365-day run and UI/API: intentionally deferred to subsequent plans per the approved sequence.
