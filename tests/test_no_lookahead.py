import pytest

from backtest.historical_clock import HistoricalClock, LookaheadViolation


HOUR = 3_600_000


def test_historical_clock_advances_monotonically():
    clock = HistoricalClock(10 * HOUR)
    clock.advance_to(11 * HOUR)
    assert clock.now_ms == 11 * HOUR

    with pytest.raises(ValueError, match="cannot move backwards"):
        clock.advance_to(10 * HOUR)


def test_future_observation_is_rejected():
    clock = HistoricalClock(10 * HOUR)
    clock.require_observable(10 * HOUR)

    with pytest.raises(LookaheadViolation, match="newer than historical clock"):
        clock.require_observable(10 * HOUR + 1)


def test_fully_closed_boundary_is_visible_only_at_or_after_close():
    close_ms = 10 * HOUR
    clock = HistoricalClock(close_ms - 1)
    assert clock.is_closed_visible(close_ms) is False

    clock.advance_to(close_ms)
    assert clock.is_closed_visible(close_ms) is True
