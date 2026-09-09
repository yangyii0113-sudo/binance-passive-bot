import pytest

from backtest.historical_clock import HOUR_MS
from backtest.replay_engine import build_replay_points


def test_replay_points_use_preopen_and_open_cycle_without_crossing_window():
    start = 10 * HOUR_MS
    end = 13 * HOUR_MS

    points = build_replay_points(
        open_times_ms=[
            9 * HOUR_MS,
            10 * HOUR_MS,
            11 * HOUR_MS,
            12 * HOUR_MS,
            13 * HOUR_MS,
        ],
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


def test_replay_window_must_be_hour_aligned_and_delay_must_fit_inside_window():
    with pytest.raises(ValueError, match="replay window must be hour aligned"):
        build_replay_points(open_times_ms=[], start_ms=1, end_ms=HOUR_MS)

    with pytest.raises(ValueError, match="open observation delay must be positive"):
        build_replay_points(
            open_times_ms=[HOUR_MS],
            start_ms=HOUR_MS,
            end_ms=2 * HOUR_MS,
            open_observation_delay_ms=0,
        )
