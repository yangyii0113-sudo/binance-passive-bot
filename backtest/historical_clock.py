from __future__ import annotations

from dataclasses import dataclass

from foxyya.execution import ExecutionEngine


class LookaheadViolation(ValueError):
    """Raised when historical replay attempts to observe future information."""


@dataclass
class HistoricalClock:
    now_ms: int

    def __post_init__(self) -> None:
        self.now_ms = int(self.now_ms)

    def advance_to(self, timestamp_ms: int) -> int:
        timestamp_ms = int(timestamp_ms)
        if timestamp_ms < self.now_ms:
            raise ValueError("historical clock cannot move backwards")
        self.now_ms = timestamp_ms
        return self.now_ms

    def require_observable(self, timestamp_ms: int) -> int:
        timestamp_ms = int(timestamp_ms)
        if timestamp_ms > self.now_ms:
            raise LookaheadViolation(
                f"timestamp {timestamp_ms} is newer than historical clock {self.now_ms}"
            )
        return timestamp_ms

    def is_closed_visible(self, close_ms: int) -> bool:
        return int(close_ms) <= self.now_ms

    @staticmethod
    def next_legal_open_ms(decision_persist_ms: int) -> int:
        return ExecutionEngine.next_future_hour(int(decision_persist_ms))
