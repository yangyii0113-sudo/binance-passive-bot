from __future__ import annotations

from datetime import date
from typing import Iterable

# Re-export the canonical types for existing P3.2 consumers.
from ..history import HistoricalBar, HistoricalIntegrityError, HistoricalWindow


def _same_bar(left: HistoricalBar, right: HistoricalBar) -> bool:
    return left == right


def build_historical_window(
    bars: Iterable[HistoricalBar],
    *,
    instrument_id: str,
    venue: str,
    end_date: str,
    sessions: int,
) -> HistoricalWindow:
    if sessions <= 0:
        raise ValueError("sessions must be > 0")

    cutoff = date.fromisoformat(end_date)
    venue = venue.upper()

    by_session: dict[str, HistoricalBar] = {}
    for bar in bars:
        if bar.instrument_id != instrument_id:
            continue
        if bar.venue.upper() != venue:
            continue

        session = date.fromisoformat(bar.session_date)
        if session > cutoff:
            continue

        existing = by_session.get(bar.session_date)
        if existing is not None and not _same_bar(existing, bar):
            raise HistoricalIntegrityError(
                f"conflicting duplicate session: {instrument_id} "
                f"{bar.session_date}"
            )
        by_session[bar.session_date] = bar

    ordered = tuple(
        by_session[key]
        for key in sorted(by_session)
    )
    selected = ordered[-sessions:]
    observed = len(selected)
    sources = tuple(
        sorted({bar.source for bar in selected if bar.source})
    )

    price_modes = {bar.price_mode for bar in selected}
    if len(price_modes) > 1:
        raise HistoricalIntegrityError(
            f"mixed price modes: {sorted(price_modes)}"
        )
    price_mode = next(iter(price_modes), "raw_unadjusted")

    return HistoricalWindow(
        instrument_id=instrument_id,
        venue=venue,
        requested_sessions=sessions,
        end_date=end_date,
        first_session=selected[0].session_date if selected else None,
        last_session=selected[-1].session_date if selected else None,
        bars=selected,
        coverage_ratio=min(1.0, observed / sessions),
        sufficient_history=observed >= sessions,
        price_mode=price_mode,
        corporate_action_adjusted=False,
        lookahead_blocked=True,
        sources=sources,
    )
