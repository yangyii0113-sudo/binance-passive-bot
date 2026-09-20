from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class HistoricalBar:
    instrument_id: str
    venue: str
    session_date: str
    open: float | None
    high: float | None
    low: float | None
    close: float | None
    volume: int | None
    turnover: int | None
    transactions: int | None
    change: float | None
    source: str
    price_mode: str = "raw_unadjusted"

    def identity(self) -> tuple[str, str]:
        return (self.instrument_id, self.session_date)
