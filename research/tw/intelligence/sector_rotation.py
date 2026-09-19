from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from ..contracts import Availability, EvidenceRef, Instrument, Observation


@dataclass(frozen=True)
class SectorRotationRow:
    venue: str
    sector_id: str
    observed_at: str | None
    instrument_count: int
    observed_count: int
    advancers: int
    decliners: int
    unchanged: int
    breadth_ratio: float | None
    weighted_return_percent: float | None
    trade_value: int | None
    turnover_share_percent: float | None
    coverage_ratio: float
    evidence: tuple[EvidenceRef, ...]


@dataclass(frozen=True)
class SectorRotationSnapshot:
    venue: str
    observed_at: str | None
    sectors: tuple[SectorRotationRow, ...]
    leaders: tuple[str, ...]
    laggards: tuple[str, ...]
    coverage_ratio: float

    def by_sector(self, sector_id: str) -> SectorRotationRow | None:
        for item in self.sectors:
            if item.sector_id == sector_id:
                return item
        return None


def _venue(observation: Observation) -> str:
    return str(observation.metadata.get("venue") or "").upper()


def _latest_date(
    observations: tuple[Observation, ...],
    venue: str,
) -> str | None:
    dates = [
        item.observed_at
        for item in observations
        if item.observed_at is not None
        and _venue(item) == venue
        and item.field in {"change_percent", "trade_value"}
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


def build_sector_rotation(
    observations: Iterable[Observation],
    instruments: Iterable[Instrument],
    *,
    venue: str,
    observed_at: str | None = None,
    top_n: int = 3,
) -> SectorRotationSnapshot:
    """Build descriptive sector rotation from canonical observations.

    Ranking is by observed trade-value-weighted daily return. It is a research
    ordering only; no execution or buy/sell state is produced.
    """
    rows = tuple(observations)
    instrument_rows = tuple(instruments)
    venue = venue.upper()
    target = observed_at or _latest_date(rows, venue)

    memberships: dict[str, str] = {}
    for instrument in instrument_rows:
        if instrument.venue.upper() != venue:
            continue
        sector = str(instrument.sector or "").strip()
        if not sector:
            continue
        memberships[instrument.instrument_id] = sector

    if target is None or not memberships:
        return SectorRotationSnapshot(
            venue=venue,
            observed_at=target,
            sectors=(),
            leaders=(),
            laggards=(),
            coverage_ratio=0.0,
        )

    change_by_id: dict[str, Observation] = {}
    trade_by_id: dict[str, Observation] = {}
    for item in rows:
        if (
            item.observed_at != target
            or _venue(item) != venue
            or item.instrument_id not in memberships
            or item.availability != Availability.AVAILABLE
            or not isinstance(item.value, (int, float))
        ):
            continue
        if item.field == "change_percent":
            change_by_id[item.instrument_id] = item
        elif item.field == "trade_value":
            trade_by_id[item.instrument_id] = item

    sector_members: dict[str, set[str]] = {}
    for instrument_id, sector in memberships.items():
        sector_members.setdefault(sector, set()).add(instrument_id)

    total_trade_value = sum(
        max(0, int(item.value))
        for instrument_id, item in trade_by_id.items()
        if instrument_id in memberships
    )

    sector_rows: list[SectorRotationRow] = []
    total_members = 0
    total_observed = 0

    for sector_id in sorted(sector_members):
        members = sector_members[sector_id]
        total_members += len(members)

        change_rows = [
            change_by_id[instrument_id]
            for instrument_id in members
            if instrument_id in change_by_id
        ]
        observed_count = len(change_rows)
        total_observed += observed_count

        advancers = sum(float(item.value) > 0 for item in change_rows)
        decliners = sum(float(item.value) < 0 for item in change_rows)
        unchanged = sum(float(item.value) == 0 for item in change_rows)
        breadth_ratio = (
            (advancers - decliners) / observed_count
            if observed_count
            else None
        )

        sector_trade_rows = [
            trade_by_id[instrument_id]
            for instrument_id in members
            if instrument_id in trade_by_id
        ]
        sector_trade_value = (
            sum(max(0, int(item.value)) for item in sector_trade_rows)
            if sector_trade_rows
            else None
        )

        weighted_pairs = [
            (
                float(change_by_id[instrument_id].value),
                max(0, int(trade_by_id[instrument_id].value)),
            )
            for instrument_id in members
            if instrument_id in change_by_id
            and instrument_id in trade_by_id
            and int(trade_by_id[instrument_id].value) > 0
        ]
        weight_sum = sum(weight for _, weight in weighted_pairs)
        weighted_return = (
            sum(change * weight for change, weight in weighted_pairs)
            / weight_sum
            if weight_sum
            else None
        )

        turnover_share = (
            sector_trade_value / total_trade_value * 100.0
            if sector_trade_value is not None and total_trade_value > 0
            else None
        )

        evidence: list[EvidenceRef] = []
        seen: set[tuple[str, str, str, str | None]] = set()
        for item in change_rows + sector_trade_rows:
            ref = _evidence(item)
            if ref is None:
                continue
            key = (
                ref.field,
                ref.source,
                ref.observed_at,
                ref.instrument_id,
            )
            if key in seen:
                continue
            seen.add(key)
            evidence.append(ref)

        sector_rows.append(
            SectorRotationRow(
                venue=venue,
                sector_id=sector_id,
                observed_at=target,
                instrument_count=len(members),
                observed_count=observed_count,
                advancers=advancers,
                decliners=decliners,
                unchanged=unchanged,
                breadth_ratio=breadth_ratio,
                weighted_return_percent=weighted_return,
                trade_value=sector_trade_value,
                turnover_share_percent=turnover_share,
                coverage_ratio=(
                    observed_count / len(members)
                    if members
                    else 0.0
                ),
                evidence=tuple(evidence),
            )
        )

    ranked = [
        item
        for item in sector_rows
        if item.weighted_return_percent is not None
        and item.coverage_ratio > 0
    ]
    leaders = tuple(
        item.sector_id
        for item in sorted(
            ranked,
            key=lambda item: (
                item.weighted_return_percent,
                item.breadth_ratio if item.breadth_ratio is not None else -2.0,
            ),
            reverse=True,
        )[: max(0, top_n)]
    )
    laggards = tuple(
        item.sector_id
        for item in sorted(
            ranked,
            key=lambda item: (
                item.weighted_return_percent,
                item.breadth_ratio if item.breadth_ratio is not None else 2.0,
            ),
        )[: max(0, top_n)]
    )

    return SectorRotationSnapshot(
        venue=venue,
        observed_at=target,
        sectors=tuple(sector_rows),
        leaders=leaders,
        laggards=laggards,
        coverage_ratio=(
            total_observed / total_members
            if total_members
            else 0.0
        ),
    )
