from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from ..contracts import Availability, EvidenceRef, Observation
from ..fields import (
    INSTITUTIONAL_BUY_AMOUNT,
    INSTITUTIONAL_NET_AMOUNT,
    INSTITUTIONAL_SELL_AMOUNT,
)


GROUPS = ("foreign", "investment_trust", "dealer", "total")
FIELDS = (
    INSTITUTIONAL_BUY_AMOUNT,
    INSTITUTIONAL_SELL_AMOUNT,
    INSTITUTIONAL_NET_AMOUNT,
)


@dataclass(frozen=True)
class InstitutionalGroupFlow:
    group: str
    buy_amount: int | None
    sell_amount: int | None
    net_amount: int | None
    component_count: int
    coverage_ratio: float
    evidence: tuple[EvidenceRef, ...]


@dataclass(frozen=True)
class InstitutionalFlowSnapshot:
    venue: str
    observed_at: str | None
    groups: tuple[InstitutionalGroupFlow, ...]
    coverage_ratio: float

    def by_group(self, group: str) -> InstitutionalGroupFlow | None:
        for item in self.groups:
            if item.group == group:
                return item
        return None


def _venue(item: Observation) -> str:
    return str(item.metadata.get("venue") or "").upper()


def _evidence(item: Observation) -> EvidenceRef | None:
    if not item.source or not item.observed_at:
        return None
    return EvidenceRef(
        field=item.field,
        source=item.source,
        observed_at=item.observed_at,
        instrument_id=item.instrument_id,
    )


def _latest_date(rows: tuple[Observation, ...], venue: str) -> str | None:
    dates = [
        item.observed_at
        for item in rows
        if item.observed_at is not None and _venue(item) == venue
    ]
    return max(dates) if dates else None


def _aggregate_group(
    rows: tuple[Observation, ...],
    *,
    venue: str,
    observed_at: str,
    group: str,
) -> InstitutionalGroupFlow:
    members = [
        item
        for item in rows
        if _venue(item) == venue
        and item.observed_at == observed_at
        and item.metadata.get("investor_group") == group
        and item.field in FIELDS
    ]
    component_names = {
        str(item.metadata.get("investor_name") or "")
        for item in members
        if item.metadata.get("investor_name")
    }

    values: dict[str, int | None] = {}
    evidence: list[EvidenceRef] = []
    available_fields = 0
    for field in FIELDS:
        field_rows = [
            item
            for item in members
            if item.field == field
            and item.availability == Availability.AVAILABLE
            and isinstance(item.value, (int, float))
        ]
        if field_rows:
            values[field] = int(sum(int(item.value) for item in field_rows))
            available_fields += 1
            for item in field_rows:
                ref = _evidence(item)
                if ref is not None:
                    evidence.append(ref)
        else:
            values[field] = None

    return InstitutionalGroupFlow(
        group=group,
        buy_amount=values[INSTITUTIONAL_BUY_AMOUNT],
        sell_amount=values[INSTITUTIONAL_SELL_AMOUNT],
        net_amount=values[INSTITUTIONAL_NET_AMOUNT],
        component_count=len(component_names),
        coverage_ratio=available_fields / len(FIELDS),
        evidence=tuple(evidence),
    )


def build_institutional_flow(
    observations: Iterable[Observation],
    *,
    venue: str,
    observed_at: str | None = None,
) -> InstitutionalFlowSnapshot:
    rows = tuple(observations)
    venue = venue.upper()
    target = observed_at or _latest_date(rows, venue)
    if target is None:
        empty = tuple(
            InstitutionalGroupFlow(
                group=group,
                buy_amount=None,
                sell_amount=None,
                net_amount=None,
                component_count=0,
                coverage_ratio=0.0,
                evidence=(),
            )
            for group in GROUPS
        )
        return InstitutionalFlowSnapshot(
            venue=venue,
            observed_at=None,
            groups=empty,
            coverage_ratio=0.0,
        )

    groups = tuple(
        _aggregate_group(
            rows,
            venue=venue,
            observed_at=target,
            group=group,
        )
        for group in GROUPS
    )
    coverage = sum(item.coverage_ratio for item in groups) / len(groups)
    return InstitutionalFlowSnapshot(
        venue=venue,
        observed_at=target,
        groups=groups,
        coverage_ratio=coverage,
    )
