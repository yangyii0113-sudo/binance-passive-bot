from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Iterable

from ..contracts import Availability, EvidenceRef, Observation
from ..fields import (
    MARGIN_BALANCE,
    MARGIN_CHANGE,
    MARGIN_SHORT_RATIO_PERCENT,
    SHORT_BALANCE,
    SHORT_CHANGE,
)


class LeverageContextState(str, Enum):
    LONG_LEVERAGE_BUILD = "long_leverage_build"
    SHORT_LEVERAGE_BUILD = "short_leverage_build"
    TWO_WAY_LEVERAGE_BUILD = "two_way_leverage_build"
    DELEVERAGING = "deleveraging"
    MIXED = "mixed"
    INSUFFICIENT_DATA = "insufficient_data"


@dataclass(frozen=True)
class MarginShortContext:
    venue: str
    observed_at: str | None
    margin_balance: int | None
    margin_change: int | None
    short_balance: int | None
    short_change: int | None
    margin_short_ratio_percent: float | None
    instrument_count: int
    coverage_ratio: float
    state: LeverageContextState
    evidence: tuple[EvidenceRef, ...]


def _venue(item: Observation) -> str:
    return str(item.metadata.get("venue") or "").upper()


def _latest_date(rows: tuple[Observation, ...], venue: str) -> str | None:
    dates = [
        item.observed_at
        for item in rows
        if item.observed_at is not None and _venue(item) == venue
    ]
    return max(dates) if dates else None


def _evidence(item: Observation) -> EvidenceRef | None:
    if not item.source or not item.observed_at:
        return None
    return EvidenceRef(
        field=item.field,
        source=item.source,
        observed_at=item.observed_at,
        instrument_id=item.instrument_id,
    )


def _state(
    margin_change: int | None,
    short_change: int | None,
) -> LeverageContextState:
    if margin_change is None or short_change is None:
        return LeverageContextState.INSUFFICIENT_DATA
    if margin_change > 0 and short_change > 0:
        return LeverageContextState.TWO_WAY_LEVERAGE_BUILD
    if margin_change > 0 and short_change <= 0:
        return LeverageContextState.LONG_LEVERAGE_BUILD
    if margin_change <= 0 and short_change > 0:
        return LeverageContextState.SHORT_LEVERAGE_BUILD
    if margin_change < 0 and short_change < 0:
        return LeverageContextState.DELEVERAGING
    return LeverageContextState.MIXED


def build_margin_short_context(
    observations: Iterable[Observation],
    *,
    venue: str,
    observed_at: str | None = None,
) -> MarginShortContext:
    rows = tuple(observations)
    venue = venue.upper()
    target = observed_at or _latest_date(rows, venue)

    if target is None:
        return MarginShortContext(
            venue=venue,
            observed_at=None,
            margin_balance=None,
            margin_change=None,
            short_balance=None,
            short_change=None,
            margin_short_ratio_percent=None,
            instrument_count=0,
            coverage_ratio=0.0,
            state=LeverageContextState.INSUFFICIENT_DATA,
            evidence=(),
        )

    target_rows = [
        item
        for item in rows
        if _venue(item) == venue and item.observed_at == target
    ]
    instrument_ids = {
        item.instrument_id
        for item in target_rows
        if item.instrument_id
    }
    fields = (
        MARGIN_BALANCE,
        MARGIN_CHANGE,
        SHORT_BALANCE,
        SHORT_CHANGE,
    )

    totals: dict[str, int | None] = {}
    evidence: list[EvidenceRef] = []
    field_coverage: list[float] = []

    for field in fields:
        available = [
            item
            for item in target_rows
            if item.field == field
            and item.availability == Availability.AVAILABLE
            and isinstance(item.value, (int, float))
        ]
        totals[field] = (
            int(sum(int(item.value) for item in available))
            if available
            else None
        )
        coverage = (
            len({item.instrument_id for item in available}) / len(instrument_ids)
            if instrument_ids
            else 0.0
        )
        field_coverage.append(coverage)
        for item in available:
            ref = _evidence(item)
            if ref is not None:
                evidence.append(ref)

    margin_balance = totals[MARGIN_BALANCE]
    short_balance = totals[SHORT_BALANCE]
    ratio = (
        short_balance / margin_balance * 100.0
        if margin_balance not in {None, 0} and short_balance is not None
        else None
    )

    return MarginShortContext(
        venue=venue,
        observed_at=target,
        margin_balance=margin_balance,
        margin_change=totals[MARGIN_CHANGE],
        short_balance=short_balance,
        short_change=totals[SHORT_CHANGE],
        margin_short_ratio_percent=ratio,
        instrument_count=len(instrument_ids),
        coverage_ratio=(
            sum(field_coverage) / len(field_coverage)
            if field_coverage
            else 0.0
        ),
        state=_state(
            totals[MARGIN_CHANGE],
            totals[SHORT_CHANGE],
        ),
        evidence=tuple(evidence),
    )
