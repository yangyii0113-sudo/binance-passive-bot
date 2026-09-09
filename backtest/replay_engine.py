from __future__ import annotations

from dataclasses import dataclass

from backtest.historical_clock import HOUR_MS


@dataclass(frozen=True)
class ReplayPoint:
    phase: str
    open_ms: int
    observed_ms: int


def build_replay_points(
    *,
    open_times_ms: list[int],
    start_ms: int,
    end_ms: int,
    preopen_lead_ms: int = 1,
    open_observation_delay_ms: int = 1,
) -> list[ReplayPoint]:
    start_ms = int(start_ms)
    end_ms = int(end_ms)
    preopen_lead_ms = int(preopen_lead_ms)
    open_observation_delay_ms = int(open_observation_delay_ms)

    if start_ms % HOUR_MS or end_ms % HOUR_MS:
        raise ValueError("replay window must be hour aligned")
    if end_ms <= start_ms:
        raise ValueError("replay end must be after start")
    if preopen_lead_ms <= 0 or preopen_lead_ms >= HOUR_MS:
        raise ValueError("preopen lead must be between zero and one hour")
    if open_observation_delay_ms <= 0:
        raise ValueError("open observation delay must be positive")
    if open_observation_delay_ms >= HOUR_MS:
        raise ValueError("open observation delay must be less than one hour")

    available = {int(value) for value in open_times_ms}
    required = list(range(start_ms, end_ms, HOUR_MS))
    missing = [value for value in required if value not in available]
    if missing:
        raise ValueError(f"missing required execution 1h open: {missing[0]}")

    points: list[ReplayPoint] = []
    for open_ms in required:
        preopen_ms = open_ms - preopen_lead_ms
        if preopen_ms >= start_ms:
            points.append(ReplayPoint("PREOPEN", open_ms, preopen_ms))

        observed_ms = open_ms + open_observation_delay_ms
        if observed_ms >= end_ms:
            raise ValueError("open observation delay crosses replay end")
        points.append(ReplayPoint("OPEN_CYCLE", open_ms, observed_ms))

    return points
