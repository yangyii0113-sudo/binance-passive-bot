from pathlib import Path

import pytest

from backtest.historical_clock import HOUR_MS, HistoricalClock
from backtest.replay_engine import HistoricalReplayEngine
from foxyya.ledger import EventLedger


class FakeDataset:
    def __init__(self, open_times):
        self._rows = [
            [open_ms, "100", "101", "99", "100", "1", open_ms + HOUR_MS - 1, "1000"]
            for open_ms in open_times
        ]

    def rows(self, symbol, interval):
        assert symbol == "ETHUSDT"
        assert interval == "1h"
        return tuple(tuple(row) for row in self._rows)

    def manifest(self):
        return {"source_family": "TEST", "datasets": {"ETHUSDT": {"1h": {"row_count": len(self._rows)}}}}


class FakeMarket:
    primary_symbol = "ETHUSDT"

    def __init__(self, clock, open_times):
        self.clock = clock
        self.dataset = FakeDataset(open_times)
        self.snapshot_times = []

    def snapshot(self):
        self.snapshot_times.append(self.clock.now_ms)
        return {"built_at_ms": self.clock.now_ms}


class FakeRunner:
    def __init__(self):
        self.calls = []
        self.initial_nav = 1000.0

    def execute_open(self, snapshot, *, open_ms, observed_ms):
        self.calls.append(("execute_open", open_ms, observed_ms))
        return []

    def apply_funding(self, snapshot, *, now_ms):
        self.calls.append(("apply_funding", now_ms))
        return []

    def manage_positions(self, snapshot, *, now_ms):
        self.calls.append(("manage_positions", now_ms))
        return []

    def revalidate(self, snapshot, *, now_ms):
        self.calls.append(("revalidate", now_ms))
        return []

    def scan_if_new_close(self, snapshot, *, now_ms):
        self.calls.append(("scan_if_new_close", now_ms))
        return None

    def pending(self):
        return []


def test_replay_lifecycle_matches_open_cycle_order_and_preopen_revalidation(tmp_path: Path):
    start = 10 * HOUR_MS
    end = 12 * HOUR_MS
    clock = HistoricalClock(start, end)
    market = FakeMarket(clock, [start, start + HOUR_MS])
    ledger = EventLedger(tmp_path / "events.sqlite")
    runner = FakeRunner()

    try:
        engine = HistoricalReplayEngine(
            clock,
            market,
            ledger,
            initial_nav=1000.0,
            runner=runner,
        )
        summary = engine.run(
            start_ms=start,
            end_ms=end,
            run_id="bt-phase2-lifecycle",
            strategy_version="FOXYYA-EXEC-V2-20260908",
            git_sha="phase2-test",
        )
    finally:
        ledger.close()

    assert runner.calls == [
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
    assert market.snapshot_times == [
        start + 1,
        start + HOUR_MS - 1,
        start + HOUR_MS + 1,
    ]
    assert summary["run_id"] == "bt-phase2-lifecycle"
    assert summary["cycle_count"] == 2
    assert summary["ledger_integrity"] is True
    assert summary["clock_end_ms"] == start + HOUR_MS + 1


def test_replay_engine_is_one_shot_and_must_start_at_window_start(tmp_path: Path):
    start = 20 * HOUR_MS
    end = 21 * HOUR_MS
    clock = HistoricalClock(start, end)
    market = FakeMarket(clock, [start])
    ledger = EventLedger(tmp_path / "events.sqlite")
    runner = FakeRunner()

    try:
        engine = HistoricalReplayEngine(clock, market, ledger, initial_nav=1000.0, runner=runner)
        engine.run(
            start_ms=start,
            end_ms=end,
            run_id="bt-phase2-once",
            strategy_version="FOXYYA-EXEC-V2-20260908",
            git_sha="phase2-test",
        )
        with pytest.raises(ValueError, match="replay engine may run only once"):
            engine.run(
                start_ms=start,
                end_ms=end,
                run_id="bt-phase2-once",
                strategy_version="FOXYYA-EXEC-V2-20260908",
                git_sha="phase2-test",
            )
    finally:
        ledger.close()

    late_clock = HistoricalClock(start, end, now_ms=start + 1)
    late_market = FakeMarket(late_clock, [start])
    late_ledger = EventLedger(tmp_path / "late.sqlite")
    try:
        late_engine = HistoricalReplayEngine(late_clock, late_market, late_ledger, initial_nav=1000.0, runner=FakeRunner())
        with pytest.raises(ValueError, match="replay clock must start at execution window start"):
            late_engine.run(
                start_ms=start,
                end_ms=end,
                run_id="bt-phase2-late",
                strategy_version="FOXYYA-EXEC-V2-20260908",
                git_sha="phase2-test",
            )
    finally:
        late_ledger.close()
