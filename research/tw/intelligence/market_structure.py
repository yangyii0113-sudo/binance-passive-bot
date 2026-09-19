from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from ..contracts import Availability, EvidenceRef, Observation
from ..calculations import derive_change_percent


@dataclass(frozen=True)
class MarketBreadth:
    venue: str
    observed_at: str | None
    advancers: int
    decliners: int
    unchanged: int
    unavailable: int
    total: int
    coverage_ratio: float
    advance_decline_ratio: float | None
    net_breadth_ratio: float | None
    evidence: tuple[EvidenceRef, ...]


@dataclass(frozen=True)
class MarketTurnover:
    venue: str
    observed_at: str | None
    trade_value: int | None
    trade_volume: int | None
    transaction_count: int | None
    coverage_ratio: float
    evidence: tuple[EvidenceRef, ...]


@dataclass(frozen=True)
class IndexContext:
    venue: str
    instrument_id: str
    observed_at: str | None
    index_close: float | None
    index_change: float | None
    index_change_percent: float | None
    coverage_ratio: float
    evidence: tuple[EvidenceRef, ...]


@dataclass(frozen=True)
class MarketStructureSnapshot:
    venue: str
    observed_at: str | None
    breadth: MarketBreadth
    turnover: MarketTurnover
    index: IndexContext
    coverage_ratio: float


def _venue(observation: Observation) -> str:
    return str(observation.metadata.get("venue") or "").upper()


def _latest_date(
    observations: tuple[Observation, ...],
    venue: str,
) -> str | None:
    dates = [
        item.observed_at
        for item in observations
        if item.observed_at is not None and _venue(item) == venue
    ]
    return max(dates) if dates else None


def _evidence(observation: Observation) -> EvidenceRef | None:
    if not observation.source or not observation.observed_at:
        return None
    return EvidenceRef(
        field=observation.field,
        source=observation.source,
        observed_at=observation.observed_at,
        instrument_id=observation.instrument_id,
    )


def _field_rows(
    observations: tuple[Observation, ...],
    *,
    venue: str,
    observed_at: str,
    field: str,
) -> tuple[Observation, ...]:
    return tuple(
        item
        for item in observations
        if _venue(item) == venue
        and item.observed_at == observed_at
        and item.field == field
    )


def _index_instrument(venue: str) -> str:
    return "twse:TAIEX" if venue == "TWSE" else "tpex:OTC"


def build_market_breadth(
    observations: Iterable[Observation],
    *,
    venue: str,
    observed_at: str | None = None,
) -> MarketBreadth:
    rows = tuple(observations)
    venue = venue.upper()
    target = observed_at or _latest_date(rows, venue)
    if target is None:
        return MarketBreadth(
            venue=venue,
            observed_at=None,
            advancers=0,
            decliners=0,
            unchanged=0,
            unavailable=0,
            total=0,
            coverage_ratio=0.0,
            advance_decline_ratio=None,
            net_breadth_ratio=None,
            evidence=(),
        )

    index_id = _index_instrument(venue)
    change_rows = tuple(
        row
        for row in _field_rows(
            rows,
            venue=venue,
            observed_at=target,
            field="change_percent",
        )
        if row.instrument_id != index_id
    )

    available = [
        row
        for row in change_rows
        if row.availability == Availability.AVAILABLE
        and isinstance(row.value, (int, float))
    ]
    unavailable = len(change_rows) - len(available)
    advancers = sum(float(row.value) > 0 for row in available)
    decliners = sum(float(row.value) < 0 for row in available)
    unchanged = sum(float(row.value) == 0 for row in available)
    total = len(change_rows)
    coverage = len(available) / total if total else 0.0
    denominator = len(available)
    net = (
        (advancers - decliners) / denominator
        if denominator
        else None
    )
    ad_ratio = advancers / decliners if decliners else None

    evidence = tuple(
        ref
        for ref in (_evidence(row) for row in available)
        if ref is not None
    )
    return MarketBreadth(
        venue=venue,
        observed_at=target,
        advancers=advancers,
        decliners=decliners,
        unchanged=unchanged,
        unavailable=unavailable,
        total=total,
        coverage_ratio=coverage,
        advance_decline_ratio=ad_ratio,
        net_breadth_ratio=net,
        evidence=evidence,
    )


def build_market_turnover(
    observations: Iterable[Observation],
    *,
    venue: str,
    observed_at: str | None = None,
) -> MarketTurnover:
    rows = tuple(observations)
    venue = venue.upper()
    target = observed_at or _latest_date(rows, venue)
    index_id = _index_instrument(venue)
    fields = ("trade_value", "trade_volume", "transaction_count")

    if target is None:
        return MarketTurnover(
            venue=venue,
            observed_at=None,
            trade_value=None,
            trade_volume=None,
            transaction_count=None,
            coverage_ratio=0.0,
            evidence=(),
        )

    selected: dict[str, Observation] = {}
    for field in fields:
        candidates = [
            row
            for row in _field_rows(
                rows,
                venue=venue,
                observed_at=target,
                field=field,
            )
            if row.instrument_id == index_id
        ]
        if candidates:
            selected[field] = candidates[-1]

    values: dict[str, int | None] = {}
    evidence: list[EvidenceRef] = []
    available_count = 0
    for field in fields:
        row = selected.get(field)
        if (
            row is not None
            and row.availability == Availability.AVAILABLE
            and isinstance(row.value, (int, float))
        ):
            values[field] = int(row.value)
            available_count += 1
            ref = _evidence(row)
            if ref is not None:
                evidence.append(ref)
        else:
            values[field] = None

    return MarketTurnover(
        venue=venue,
        observed_at=target,
        trade_value=values["trade_value"],
        trade_volume=values["trade_volume"],
        transaction_count=values["transaction_count"],
        coverage_ratio=available_count / len(fields),
        evidence=tuple(evidence),
    )


def build_index_context(
    observations: Iterable[Observation],
    *,
    venue: str,
    observed_at: str | None = None,
) -> IndexContext:
    rows = tuple(observations)
    venue = venue.upper()
    target = observed_at or _latest_date(rows, venue)
    index_id = _index_instrument(venue)
    fields = ("index_close", "index_change")

    if target is None:
        return IndexContext(
            venue=venue,
            instrument_id=index_id,
            observed_at=None,
            index_close=None,
            index_change=None,
            index_change_percent=None,
            coverage_ratio=0.0,
            evidence=(),
        )

    selected: dict[str, Observation] = {}
    for field in fields:
        candidates = [
            row
            for row in _field_rows(
                rows,
                venue=venue,
                observed_at=target,
                field=field,
            )
            if row.instrument_id == index_id
        ]
        if candidates:
            selected[field] = candidates[-1]

    def value(field: str) -> float | None:
        row = selected.get(field)
        if (
            row is None
            or row.availability != Availability.AVAILABLE
            or not isinstance(row.value, (int, float))
        ):
            return None
        return float(row.value)

    close = value("index_close")
    change = value("index_change")
    available_count = int(close is not None) + int(change is not None)
    evidence = tuple(
        ref
        for ref in (_evidence(row) for row in selected.values())
        if ref is not None
    )

    return IndexContext(
        venue=venue,
        instrument_id=index_id,
        observed_at=target,
        index_close=close,
        index_change=change,
        index_change_percent=derive_change_percent(close, change),
        coverage_ratio=available_count / len(fields),
        evidence=evidence,
    )


def build_market_structure(
    observations: Iterable[Observation],
    *,
    venue: str,
    observed_at: str | None = None,
) -> MarketStructureSnapshot:
    rows = tuple(observations)
    venue = venue.upper()
    target = observed_at or _latest_date(rows, venue)
    breadth = build_market_breadth(
        rows,
        venue=venue,
        observed_at=target,
    )
    turnover = build_market_turnover(
        rows,
        venue=venue,
        observed_at=target,
    )
    index = build_index_context(
        rows,
        venue=venue,
        observed_at=target,
    )
    coverage = (
        breadth.coverage_ratio
        + turnover.coverage_ratio
        + index.coverage_ratio
    ) / 3.0
    return MarketStructureSnapshot(
        venue=venue,
        observed_at=target,
        breadth=breadth,
        turnover=turnover,
        index=index,
        coverage_ratio=coverage,
    )
