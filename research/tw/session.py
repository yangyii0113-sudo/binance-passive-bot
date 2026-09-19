from __future__ import annotations

from dataclasses import dataclass
from datetime import date, time
from typing import Iterable
from zoneinfo import ZoneInfo

from .providers.twse_calendar import CalendarEntry


TAIPEI = ZoneInfo("Asia/Taipei")


@dataclass(frozen=True)
class TaiwanCashSession:
    timezone: ZoneInfo = TAIPEI
    regular_open: time = time(9, 0)
    regular_close: time = time(13, 30)

    def is_weekday_candidate(self, session_date: date) -> bool:
        return session_date.weekday() < 5

    def is_trading_day(
        self,
        session_date: date,
        calendar_entries: Iterable[CalendarEntry],
    ) -> bool:
        matches = [
            entry
            for entry in calendar_entries
            if entry.session_date == session_date
        ]

        if any(entry.is_closed for entry in matches):
            return False

        if matches:
            # An explicit informational trading-day row may override the
            # baseline weekday rule for future make-up trading schedules.
            return True

        return self.is_weekday_candidate(session_date)
