import pytest

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
    day_ms = 86_400_000
    start_ms, end_ms = resolve_execution_window(400 * day_ms, days=365)
    assert end_ms == 400 * day_ms
    assert start_ms == 35 * day_ms
