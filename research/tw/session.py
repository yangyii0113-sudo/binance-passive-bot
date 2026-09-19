from __future__ import annotations

from dataclasses import dataclass
from datetime import date, time
from zoneinfo import ZoneInfo


TAIPEI = ZoneInfo("Asia/Taipei")


@dataclass(frozen=True)
class TaiwanCashSession:
    timezone: ZoneInfo = TAIPEI
    regular_open: time = time(9, 0)
    regular_close: time = time(13, 30)

    def is_weekday_candidate(self, session_date: date) -> bool:
        """Baseline only.

        Official holiday-calendar validation is required before P1 can pass.
        """
        return session_date.weekday() < 5
