from __future__ import annotations

from datetime import date

from research.tw.contracts import Availability, Observation
from research.tw.providers.twse_calendar import CalendarEntry
from research.tw.reconciliation import SessionCoverageState, reconcile_market_session


def _obs(venue: str, instrument_id: str, day: str):
    return Observation(
        instrument_id=instrument_id,
        field="index_close",
        value=100.0,
        source=f"{venue}:fixture",
        observed_at=day,
        availability=Availability.AVAILABLE,
        metadata={"venue": venue},
    )


def test_scheduled_holiday_is_closed_without_data_requirement():
    day = date(2026, 1, 1)
    calendar = (
        CalendarEntry(
            session_date=day,
            name="holiday",
            description="closed",
            is_closed=True,
        ),
    )
    result = reconcile_market_session(
        session_date=day,
        calendar_entries=calendar,
        observations=(),
    )
    assert result.state == SessionCoverageState.SCHEDULED_CLOSED


def test_missing_open_day_data_is_not_called_unscheduled_closure():
    result = reconcile_market_session(
        session_date=date(2026, 9, 18),
        calendar_entries=(),
        observations=(),
    )
    assert result.state == SessionCoverageState.NEEDS_RECONCILIATION
    assert set(result.missing_markets) == {"TWSE", "TPEX"}


def test_partial_and_complete_market_coverage_are_distinct():
    day = "2026-09-18"
    partial = reconcile_market_session(
        session_date=date.fromisoformat(day),
        calendar_entries=(),
        observations=(_obs("TWSE", "twse:TAIEX", day),),
    )
    assert partial.state == SessionCoverageState.PARTIAL
    assert partial.missing_markets == ("TPEX",)

    complete = reconcile_market_session(
        session_date=date.fromisoformat(day),
        calendar_entries=(),
        observations=(
            _obs("TWSE", "twse:TAIEX", day),
            _obs("TPEX", "tpex:OTC", day),
        ),
    )
    assert complete.state == SessionCoverageState.OBSERVED
    assert complete.missing_markets == ()
