from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from enum import Enum
from typing import Iterable

from .contracts import Availability, Observation
from .providers.twse_calendar import CalendarEntry
from .session import TaiwanCashSession


class SessionCoverageState(str, Enum):
    SCHEDULED_CLOSED = "scheduled_closed"
    OBSERVED = "observed"
    PARTIAL = "partial"
    NEEDS_RECONCILIATION = "needs_reconciliation"


@dataclass(frozen=True)
class SessionCoverage:
    session_date: str
    state: SessionCoverageState
    expected_markets: tuple[str, ...]
    observed_markets: tuple[str, ...]
    missing_markets: tuple[str, ...]
    note: str


def reconcile_market_session(
    *,
    session_date: date,
    calendar_entries: Iterable[CalendarEntry],
    observations: Iterable[Observation],
    session: TaiwanCashSession | None = None,
) -> SessionCoverage:
    """Reconcile official schedule with actually observed market data.

    Missing data on an expected trading day is deliberately NOT classified as
    an unscheduled closure. It remains NEEDS_RECONCILIATION until an
    authoritative closure source or later data resolves the ambiguity.
    """
    cash_session = session or TaiwanCashSession()
    expected = ("TWSE", "TPEX")

    if not cash_session.is_trading_day(session_date, calendar_entries):
        return SessionCoverage(
            session_date=session_date.isoformat(),
            state=SessionCoverageState.SCHEDULED_CLOSED,
            expected_markets=(),
            observed_markets=(),
            missing_markets=(),
            note="Official calendar marks this session closed.",
        )

    observed: set[str] = set()
    target_date = session_date.isoformat()
    for item in observations:
        if item.observed_at != target_date:
            continue
        if item.availability != Availability.AVAILABLE:
            continue
        venue = str(item.metadata.get("venue") or "").upper()
        if venue in expected:
            observed.add(venue)

    missing = tuple(sorted(set(expected) - observed))
    observed_tuple = tuple(sorted(observed))

    if not missing:
        state = SessionCoverageState.OBSERVED
        note = "Expected TWSE and TPEx data are present."
    elif observed:
        state = SessionCoverageState.PARTIAL
        note = "Only part of the expected market data is present."
    else:
        state = SessionCoverageState.NEEDS_RECONCILIATION
        note = (
            "Expected trading-day data is missing. Do not infer an "
            "unscheduled closure without authoritative confirmation."
        )

    return SessionCoverage(
        session_date=target_date,
        state=state,
        expected_markets=expected,
        observed_markets=observed_tuple,
        missing_markets=missing,
        note=note,
    )
