from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Sequence

from .http import JsonTransport, ProviderError, UrllibJsonTransport
from .parsing import clean_text, parse_roc_date


@dataclass(frozen=True)
class CalendarEntry:
    session_date: date
    name: str
    description: str
    is_closed: bool
    source: str = "TWSE:holidaySchedule"


class TWSEHolidayCalendarProvider:
    BASE_URL = "https://openapi.twse.com.tw/v1"
    CALENDAR_URL = BASE_URL + "/holidaySchedule/holidaySchedule"

    def __init__(self, transport: JsonTransport | None = None) -> None:
        self.transport = transport or UrllibJsonTransport()

    def _rows(self) -> list[dict]:
        payload = self.transport.get_json(self.CALENDAR_URL)
        if not isinstance(payload, list):
            raise ProviderError("TWSE holiday calendar payload is not a list")
        return [row for row in payload if isinstance(row, dict)]

    @staticmethod
    def _is_closed(name: str, description: str) -> bool:
        combined = f"{name} {description}"
        if "市場無交易" in combined or "休市" in combined:
            return True

        # TWSE includes informational rows for first/last trading days.
        # Those rows must not be interpreted as closures.
        trading_notice = (
            "開始交易" in combined
            or "最後交易" in combined
            or "恢復交易" in combined
        )
        if trading_notice:
            return False

        # Remaining rows in the official holiday schedule represent holidays
        # or compensatory days off.
        return True

    def entries(self) -> Sequence[CalendarEntry]:
        result: list[CalendarEntry] = []
        for row in self._rows():
            iso_date = parse_roc_date(row.get("Date"))
            if iso_date is None:
                continue
            name = clean_text(row.get("Name"))
            description = clean_text(row.get("Description"))
            result.append(
                CalendarEntry(
                    session_date=date.fromisoformat(iso_date),
                    name=name,
                    description=description,
                    is_closed=self._is_closed(name, description),
                )
            )
        return tuple(result)
