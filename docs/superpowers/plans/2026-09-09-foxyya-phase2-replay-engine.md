# FOXYYA Phase 2 Deterministic Replay Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive the existing `ForwardRunner` deterministically through historical time so Pending Intent, pre-open revalidation, Future Legal 1H Open, funding, position management and scanning follow the same shared-core semantics without lookahead or backfill.

**Architecture:** Keep `src/foxyya` unchanged. Add a `backtest/replay_engine.py` orchestration layer over the Phase 1 `HistoricalClock`, `HistoricalMarketAdapter` and isolated research ledger. Each execution hour has two historical phases: `PREOPEN` at `open_ms - 1` (revalidation only) and `OPEN_CYCLE` at `open_ms + 1` (fill, funding, management, revalidation, then scan). This mirrors the production lifecycle while ensuring newly scanned signals cannot fill the open that already occurred.

**Tech Stack:** Python 3.12, standard library, existing `foxyya.runner.ForwardRunner`, existing `foxyya.execution.ExecutionEngine`, Phase 1 historical core, pytest, GitHub Actions, Docker.

**Spec:** `docs/superpowers/specs/2026-09-09-foxyya-backtest-source-normalization-design.md`

## Global Constraints

- `PAPER_ONLY=true` remains mandatory.
- `REAL_ORDER_LOCK=true` remains mandatory.
- Do not modify A/B/C/D or LONG/SHORT Control logic.
- Do not modify `src/foxyya` strategy/risk/execution semantics in Phase 2.
- No private/signed exchange endpoint may be introduced.
- No Backfill: fill timestamp must equal the precommitted future 1H open and be strictly after `decision_persist_ms`.
- Strategy inputs use only fully closed bars.
- Historical current-hour open may be visible only after that open timestamp; unfinished current-bar close remains invisible.
- Portfolio planned open risk remains `<= 1.50% NAV` via the existing `RiskBook`.
- Historical replay writes only to research ledgers; never `/data/foxyya_v2_paper.sqlite`.
- Historical run end is exclusive: no fill or scan cycle executes at `end_ms`.
- Phase 2 does not optimize strategy parameters or produce final performance recommendations.

---

### Task 1: Deterministic Replay Timeline

**Files:**
- Create: `backtest/replay_engine.py`
- Create: `tests/test_replay_timeline.py`
- Create: `.github/workflows/phase2-ci.yml`

**Interfaces:**
- Produces: `ReplayPoint(phase: str, open_ms: int, observed_ms: int)` dataclass.
- Produces: `build_replay_points(*, open_times_ms: list[int], start_ms: int, end_ms: int, preopen_lead_ms: int = 1, open_observation_delay_ms: int = 1) -> list[ReplayPoint]`.

- [ ] Write failing tests first:

```python
from backtest.historical_clock import HOUR_MS
from backtest.replay_engine import build_replay_points


def test_replay_points_use_preopen_and_open_cycle_without_crossing_window():
    start = 10 * HOUR_MS
    end = 13 * HOUR_MS
    points = build_replay_points(
        open_times_ms=[9 * HOUR_MS, 10 * HOUR_MS, 11 * HOUR_MS, 12 * HOUR_MS, 13 * HOUR_MS],
        start_ms=start,
        end_ms=end,
    )
    assert [(p.phase, p.open_ms, p.observed_ms) for p in points] == [
        ("OPEN_CYCLE", 10 * HOUR_MS, 10 * HOUR_MS + 1),
        ("PREOPEN", 11 * HOUR_MS, 11 * HOUR_MS - 1),
        ("OPEN_CYCLE", 11 * HOUR_MS, 11 * HOUR_MS + 1),
        ("PREOPEN", 12 * HOUR_MS, 12 * HOUR_MS - 1),
        ("OPEN_CYCLE", 12 * HOUR_MS, 12 * HOUR_MS + 1),
    ]


def test_replay_points_fail_when_required_execution_hour_is_missing():
    start = 10 * HOUR_MS
    end = 13 * HOUR_MS
    with pytest.raises(ValueError, match="missing required execution 1h open"):
        build_replay_points(
            open_times_ms=[10 * HOUR_MS, 12 * HOUR_MS],
            start_ms=start,
            end_ms=end,
        )
```

- [ ] Add Phase 2 CI running only `tests/test_replay_timeline.py`; verify RED because `backtest.replay_engine` does not exist.
- [ ] Implement minimal timeline code. Require `start_ms` and `end_ms` to be hour-aligned, `end_ms > start_ms`, positive lead/delay values, every required open in `range(start_ms, end_ms, HOUR_MS)`, and `open_ms + delay < end_ms`.
- [ ] Run timeline tests GREEN.
- [ ] Commit with `feat: add deterministic historical replay timeline`.

---

### Task 2: Historical Lifecycle Driver Over Existing ForwardRunner

**Files:**
- Modify: `backtest/replay_engine.py`
- Create: `tests/test_replay_lifecycle.py`
- Modify: `.github/workflows/phase2-ci.yml`

**Interfaces:**
- Produces: `HistoricalReplayEngine(clock, market, ledger, *, initial_nav: float, runner=None)`.
- Produces: `HistoricalReplayEngine.run(*, start_ms: int, end_ms: int, run_id: str, strategy_version: str, git_sha: str) -> dict`.
- Default runner is `ForwardRunner(ledger, initial_nav=initial_nav)`; `runner=` is an explicit test seam only.

**Lifecycle contract:**

At each `PREOPEN` point:

```text
clock.advance_to(open_ms - 1)
snapshot = market.snapshot()
runner.revalidate(snapshot, now_ms=clock.now_ms)
```

At each `OPEN_CYCLE` point:

```text
clock.advance_to(open_ms + 1)
snapshot = market.snapshot()
runner.execute_open(snapshot, open_ms=open_ms, observed_ms=clock.now_ms)
runner.apply_funding(snapshot, now_ms=clock.now_ms)
runner.manage_positions(snapshot, now_ms=clock.now_ms)
runner.revalidate(snapshot, now_ms=clock.now_ms)
runner.scan_if_new_close(snapshot, now_ms=clock.now_ms)
```

The order above intentionally matches `service.run_cycle()` for an open-window production cycle. The extra `PREOPEN` phase exists only to provide a deterministic pre-open revalidation opportunity.

- [ ] Write a failing test with a fake runner that records method calls and a minimal fake market that records snapshot times. Assert the exact order for two hours:

```python
assert calls == [
    ("execute_open", start, start + 1),
    ("apply_funding", start + 1),
    ("manage_positions", start + 1),
    ("revalidate", start + 1),
    ("scan_if_new_close", start + 1),
    ("revalidate", start + HOUR_MS - 1),
    ("execute_open", start + HOUR_MS, start + HOUR_MS + 1),
    ("apply_funding", start + HOUR_MS + 1),
    ("manage_positions", start + HOUR_MS + 1),
    ("revalidate", start + HOUR_MS + 1),
    ("scan_if_new_close", start + HOUR_MS + 1),
]
```

- [ ] Verify RED because `HistoricalReplayEngine` is absent.
- [ ] Implement the minimum orchestration. Read execution opens from `market.dataset.rows(market.primary_symbol, "1h")`; refuse to run if the replay clock is not at `start_ms`; refuse a second call on the same engine instance; verify `ledger.verify()` before and after.
- [ ] Persist deterministic research-only boundary events:
  - `BACKTEST_RUN_STARTED` before the first replay point.
  - `BACKTEST_RUN_COMPLETED` after all points.
  Both include `run_id`, `strategy_version`, `git_sha`, `start_ms`, `end_ms`, `mode="HISTORICAL BACKTEST"`, `label="歷史模擬・非 Forward Performance"`, `paper_only=True`, `real_orders=False`.
- [ ] Return a summary containing `run_id`, `cycle_count`, `ledger_integrity`, `event_count`, `pending_intents`, `open_positions_5x`, and `clock_end_ms`.
- [ ] Run lifecycle tests GREEN and commit `feat: drive shared runner through historical lifecycle`.

---

### Task 3: Shared-Core Future Legal Open / No-Backfill Integration

**Files:**
- Create: `tests/test_future_legal_open_replay.py`
- Modify: `.github/workflows/phase2-ci.yml`

**Interfaces:**
- Consumes existing `foxyya.setups.SignalDecision`.
- Consumes `ForwardRunner.execution.create_intent`, `ForwardRunner.revalidate`, and `ForwardRunner.execute_open` without changing them.

- [ ] Write an integration fixture with a real `EventLedger`, real `ForwardRunner`, `HistoricalClock` and `HistoricalMarketAdapter` for `ETHUSDT`.
- [ ] Create a real `SignalDecision`:

```python
decision = SignalDecision(
    symbol="ETHUSDT",
    side="LONG",
    family="A",
    qualified=True,
    reason="TEST",
    rank=1,
    regime="TREND",
    signal_id="phase2-test-signal",
    decision_close_ms=10 * HOUR_MS - 1,
    stop=90.0,
    trigger=100.0,
)
```

- [ ] Persist it at `10 * HOUR_MS + 1` and assert the intent schedules `11 * HOUR_MS`.
- [ ] Attempt `fill_due_intent(..., open_ms=10 * HOUR_MS, ...)` and assert `ValueError("fill timestamp must equal precommitted future open")`; verify no `PAPER_ENTRY` exists.
- [ ] Advance to `11 * HOUR_MS - 1`, build the historical snapshot and call real `runner.revalidate`; assert `INTENT_REVALIDATED` and `observed_ms < scheduled_open_ms`.
- [ ] Advance to `11 * HOUR_MS + 1`, assert the unfinished 11H candle close remains invisible but `hour_open_prices["ETHUSDT"]` is visible; call real `runner.execute_open(..., open_ms=11 * HOUR_MS, observed_ms=11 * HOUR_MS + 1)`.
- [ ] Assert a single `PAPER_ENTRY` with `fill_ms == 11 * HOUR_MS`, `fill_ms > decision_persist_ms`, `real_orders is False`, and `ledger.verify() is True`.
- [ ] Commit `test: prove historical future legal open parity`.

---

### Task 4: Deterministic Replay Reproducibility + Run Provenance

**Files:**
- Create: `tests/test_replay_reproducibility.py`
- Modify: `backtest/replay_engine.py`
- Modify: `.github/workflows/phase2-ci.yml`

**Interfaces:**
- Consumes `HistoricalDataset.manifest()`.
- Produces `manifest_sha256` in start/completion events and replay summary.

- [ ] Write a deterministic synthetic dataset generator with at least 160 native 1H bars, 50 native 4H bars and 20 native 1D bars for `ETHUSDT`, plus BTCUSDT/SOLUSDT context rows where needed. The `exchange_info` trading universe contains only `ETHUSDT`; context symbols remain available through historical tickers/`major_returns`.
- [ ] Create two fresh research ledgers under different temporary roots, instantiate identical datasets/clocks/engines with the same `run_id`, strategy version and Git SHA, then run both.
- [ ] Assert canonical event lists are identical, `ledger.verify()` is true for both, summaries match except filesystem paths (which are not included), and both include the same `manifest_sha256`.
- [ ] Assert no event has `real_orders=True`, no `PAPER_ENTRY.fill_ms <= INTENT_CREATED.decision_persist_ms`, and no event timestamp exceeds/exposes `end_ms`.
- [ ] Verify RED because replay boundary events do not yet include manifest hash.
- [ ] Add canonical SHA-256 hashing of `market.dataset.manifest()` inside `HistoricalReplayEngine` and include it in `BACKTEST_RUN_STARTED`, `BACKTEST_RUN_COMPLETED`, and the returned summary.
- [ ] Run reproducibility tests GREEN.
- [ ] Commit `test: lock deterministic historical replay provenance`.

---

### Task 5: Full Regression / Safety Gate and PR

**Files:**
- Modify: `.github/workflows/phase2-ci.yml`
- No production strategy files changed.

- [ ] Expand Phase 2 CI to run:
  - all Phase 2 replay tests;
  - all Phase 1 historical-core tests;
  - Phase 0 source/import/safety/runtime tests;
  - existing Node regressions;
  - production Docker build;
  - container safety smoke asserting `REAL_ORDER_LOCK=True`, `paper_only=True`, `real_order_lock=True`.
- [ ] Run CI on the clean feature branch and require success.
- [ ] Compare `main...feat/foxyya-backtest-phase2-replay-engine`; reject any change under `src/foxyya/`, `service.py`, `Dockerfile` or production configuration.
- [ ] Open a PR to `main` documenting replay timing, no-backfill evidence, deterministic event parity, manifest hash provenance, and the known Phase 2 historical approximation that position management currently uses the explicit `last_fully_closed_1h_close` mark proxy rather than reconstructing intrabar mark-price paths.
- [ ] Do not auto-merge.

## Phase 2 Exit Gate

Phase 2 is complete only when fresh evidence proves:

- Replay points are deterministic and cover every required 1H open in `[start_ms, end_ms)`.
- PREOPEN revalidation always happens before its scheduled open.
- OPEN_CYCLE fill happens after the open but within the existing 5-minute receipt window.
- A newly scanned signal cannot fill the open that has already occurred.
- Real shared-core `ExecutionEngine` rejects backfill.
- Historical current-hour open visibility does not expose the unfinished current-hour close.
- Two independent runs with identical data/config/Git SHA produce identical ledger event sequences.
- Run boundary events contain strategy version, Git SHA, execution window, run ID and input manifest hash.
- Research ledger integrity passes.
- `PAPER_ONLY` / `REAL_ORDER_LOCK` and all prior regressions remain green.

Only after this gate should Phase 3 add formal cost attribution/metrics/reporting and run the accepted ETHUSDT trailing-365-day research study.