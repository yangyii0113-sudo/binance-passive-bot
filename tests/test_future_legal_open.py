from backtest.historical_clock import HistoricalClock
from foxyya.execution import ExecutionEngine, HOUR


def test_decision_after_hour_open_cannot_backfill_that_open():
    ten = 10 * HOUR
    decision_persist_ms = ten + 7 * 60_000
    clock = HistoricalClock(decision_persist_ms)

    assert clock.next_legal_open_ms(decision_persist_ms) == 11 * HOUR


def test_decision_exactly_on_hour_still_uses_next_future_open():
    ten = 10 * HOUR
    clock = HistoricalClock(ten)

    assert clock.next_legal_open_ms(ten) == 11 * HOUR


def test_historical_legal_open_matches_production_execution_engine():
    for decision_ms in (0, HOUR - 1, HOUR, HOUR + 1, 10 * HOUR + 17 * 60_000):
        assert HistoricalClock(decision_ms).next_legal_open_ms(decision_ms) == ExecutionEngine.next_future_hour(decision_ms)
