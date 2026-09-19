from __future__ import annotations

from datetime import date
import json
from pathlib import Path

from research.tw.providers.twse_calendar import TWSEHolidayCalendarProvider
from research.tw.session import TaiwanCashSession


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests" / "fixtures" / "tw" / "twse_holiday_schedule.json"


class FixtureTransport:
    def get_json(self, url: str):
        return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_calendar_distinguishes_holiday_from_trading_notice():
    provider = TWSEHolidayCalendarProvider(FixtureTransport())
    entries = {item.session_date: item for item in provider.entries()}

    assert entries[date(2026, 1, 1)].is_closed is True
    assert entries[date(2026, 1, 2)].is_closed is False
    assert entries[date(2026, 2, 12)].is_closed is True
    assert entries[date(2026, 2, 23)].is_closed is False


def test_session_uses_official_calendar_override():
    calendar = TWSEHolidayCalendarProvider(FixtureTransport()).entries()
    session = TaiwanCashSession()

    assert session.is_trading_day(date(2026, 1, 1), calendar) is False
    assert session.is_trading_day(date(2026, 1, 2), calendar) is True
    assert session.is_trading_day(date(2026, 1, 3), calendar) is False
    assert session.is_trading_day(date(2026, 2, 12), calendar) is False
