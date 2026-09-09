from __future__ import annotations

HOUR_MS = 3_600_000
DAY_MS = 86_400_000


class HistoricalClock:
    """Deterministic replay clock that can only advance inside its configured window."""

    def __init__(self, start_ms: int, end_ms: int, now_ms: int | None = None):
        self.start_ms = int(start_ms)
        self.end_ms = int(end_ms)
        if self.end_ms <= self.start_ms:
            raise ValueError("end_ms must be after start_ms")
        self._now_ms = self.start_ms if now_ms is None else int(now_ms)
        if not self.start_ms <= self._now_ms <= self.end_ms:
            raise ValueError("now_ms outside historical window")

    @property
    def now_ms(self) -> int:
        return self._now_ms

    def advance_to(self, target_ms: int) -> int:
        target_ms = int(target_ms)
        if target_ms < self._now_ms:
            raise ValueError("historical clock cannot move backward")
        if target_ms > self.end_ms:
            raise ValueError("historical clock cannot move past end")
        self._now_ms = target_ms
        return self._now_ms

    def visible(self, close_ms: int) -> bool:
        return int(close_ms) <= self._now_ms

    def next_hour_open(self, after_ms: int | None = None) -> int:
        value = self._now_ms if after_ms is None else int(after_ms)
        return (value // HOUR_MS + 1) * HOUR_MS


def resolve_execution_window(latest_open_ms: int, days: int = 365) -> tuple[int, int]:
    latest_open_ms = int(latest_open_ms)
    days = int(days)
    if latest_open_ms <= 0:
        raise ValueError("latest_open_ms must be positive")
    if days <= 0:
        raise ValueError("days must be positive")
    return latest_open_ms - days * DAY_MS, latest_open_ms
