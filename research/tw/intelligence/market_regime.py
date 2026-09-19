from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from .institutional_flow import InstitutionalFlowSnapshot
from .margin_short import LeverageContextState, MarginShortContext
from .market_structure import MarketStructureSnapshot
from .sector_rotation import SectorRotationSnapshot


INDEX_DEADBAND_PERCENT = 0.05
BREADTH_DEADBAND = 0.10
SECTOR_POSITIVE_THRESHOLD = 0.60
SECTOR_NEGATIVE_THRESHOLD = 0.40
MIN_COMPONENT_COVERAGE = 0.50


class MarketRegimeState(str, Enum):
    BROAD_POSITIVE = "broad_positive"
    NARROW_POSITIVE = "narrow_positive"
    MIXED = "mixed"
    NARROW_NEGATIVE = "narrow_negative"
    BROAD_NEGATIVE = "broad_negative"
    INSUFFICIENT_DATA = "insufficient_data"


@dataclass(frozen=True)
class RegimeComponent:
    name: str
    vote: int | None
    value: float | int | str | None
    coverage_ratio: float
    observed_at: str | None
    sources: tuple[str, ...]


@dataclass(frozen=True)
class MarketRegimeSnapshot:
    venue: str
    observed_at: str | None
    state: MarketRegimeState
    directional_score: int | None
    confidence: float
    positive_sector_ratio: float | None
    leverage_state: LeverageContextState
    components: tuple[RegimeComponent, ...]
    execution_allowed: bool = False

    def __post_init__(self) -> None:
        if self.execution_allowed:
            raise ValueError("Taiwan market regime cannot authorize execution")

    def component(self, name: str) -> RegimeComponent | None:
        for item in self.components:
            if item.name == name:
                return item
        return None


def _sign_vote(value: float | int | None, *, deadband: float = 0.0) -> int | None:
    if value is None:
        return None
    number = float(value)
    if number > deadband:
        return 1
    if number < -deadband:
        return -1
    return 0


def _sources(*evidence_groups) -> tuple[str, ...]:
    return tuple(
        sorted(
            {
                item.source
                for group in evidence_groups
                for item in group
                if item.source
            }
        )
    )


def _sector_positive_ratio(snapshot: SectorRotationSnapshot) -> float | None:
    valid = [
        item
        for item in snapshot.sectors
        if item.weighted_return_percent is not None
        and item.coverage_ratio > 0
    ]
    if not valid:
        return None
    positive = sum(float(item.weighted_return_percent) > 0 for item in valid)
    return positive / len(valid)


def _sector_vote(ratio: float | None) -> int | None:
    if ratio is None:
        return None
    if ratio >= SECTOR_POSITIVE_THRESHOLD:
        return 1
    if ratio <= SECTOR_NEGATIVE_THRESHOLD:
        return -1
    return 0


def _state_from_score(
    score: int,
    *,
    breadth_vote: int,
    sector_vote: int,
) -> MarketRegimeState:
    if score >= 3 and breadth_vote == 1 and sector_vote == 1:
        return MarketRegimeState.BROAD_POSITIVE
    if score >= 2:
        return MarketRegimeState.NARROW_POSITIVE
    if score <= -3 and breadth_vote == -1 and sector_vote == -1:
        return MarketRegimeState.BROAD_NEGATIVE
    if score <= -2:
        return MarketRegimeState.NARROW_NEGATIVE
    return MarketRegimeState.MIXED


def build_market_regime(
    *,
    structure: MarketStructureSnapshot,
    institutional: InstitutionalFlowSnapshot,
    leverage: MarginShortContext,
    sectors: SectorRotationSnapshot,
) -> MarketRegimeSnapshot:
    """Fuse already-derived research context into a descriptive regime.

    Direction is based on four independent descriptive votes:
    index direction, market breadth, foreign institutional net flow and
    sector diffusion. Leverage is retained as risk/context information and
    intentionally does not add a directional vote.

    This is a Research Plane classification only. It cannot authorize orders.
    """
    venue = structure.venue.upper()
    dates = {
        item
        for item in (
            structure.observed_at,
            institutional.observed_at,
            leverage.observed_at,
            sectors.observed_at,
        )
        if item is not None
    }
    same_venue = (
        institutional.venue.upper() == venue
        and leverage.venue.upper() == venue
        and sectors.venue.upper() == venue
    )
    target = structure.observed_at if len(dates) == 1 else None

    index_value = structure.index.index_change_percent
    index_vote = _sign_vote(
        index_value,
        deadband=INDEX_DEADBAND_PERCENT,
    )
    breadth_value = structure.breadth.net_breadth_ratio
    breadth_vote = _sign_vote(
        breadth_value,
        deadband=BREADTH_DEADBAND,
    )

    foreign = institutional.by_group("foreign")
    foreign_value = foreign.net_amount if foreign is not None else None
    foreign_vote = _sign_vote(foreign_value)

    positive_sector_ratio = _sector_positive_ratio(sectors)
    sector_vote = _sector_vote(positive_sector_ratio)

    components = (
        RegimeComponent(
            name="index",
            vote=index_vote,
            value=index_value,
            coverage_ratio=structure.index.coverage_ratio,
            observed_at=structure.index.observed_at,
            sources=_sources(structure.index.evidence),
        ),
        RegimeComponent(
            name="breadth",
            vote=breadth_vote,
            value=breadth_value,
            coverage_ratio=structure.breadth.coverage_ratio,
            observed_at=structure.breadth.observed_at,
            sources=_sources(structure.breadth.evidence),
        ),
        RegimeComponent(
            name="foreign_flow",
            vote=foreign_vote,
            value=foreign_value,
            coverage_ratio=foreign.coverage_ratio if foreign is not None else 0.0,
            observed_at=institutional.observed_at,
            sources=_sources(foreign.evidence if foreign is not None else ()),
        ),
        RegimeComponent(
            name="sector_diffusion",
            vote=sector_vote,
            value=positive_sector_ratio,
            coverage_ratio=sectors.coverage_ratio,
            observed_at=sectors.observed_at,
            sources=_sources(
                *(
                    item.evidence
                    for item in sectors.sectors
                    if item.coverage_ratio > 0
                )
            ),
        ),
        RegimeComponent(
            name="leverage_context",
            vote=None,
            value=leverage.state.value,
            coverage_ratio=leverage.coverage_ratio,
            observed_at=leverage.observed_at,
            sources=_sources(leverage.evidence),
        ),
    )

    required = components[:4]
    required_votes = tuple(item.vote for item in required)
    coverages = tuple(item.coverage_ratio for item in components)
    confidence = sum(coverages) / len(coverages)

    sufficient = (
        same_venue
        and target is not None
        and all(vote is not None for vote in required_votes)
        and all(
            item.coverage_ratio >= MIN_COMPONENT_COVERAGE
            for item in required
        )
        and leverage.coverage_ratio >= MIN_COMPONENT_COVERAGE
        and leverage.state != LeverageContextState.INSUFFICIENT_DATA
    )

    if not sufficient:
        return MarketRegimeSnapshot(
            venue=venue,
            observed_at=target,
            state=MarketRegimeState.INSUFFICIENT_DATA,
            directional_score=None,
            confidence=confidence,
            positive_sector_ratio=positive_sector_ratio,
            leverage_state=leverage.state,
            components=components,
            execution_allowed=False,
        )

    score = sum(int(vote) for vote in required_votes if vote is not None)
    return MarketRegimeSnapshot(
        venue=venue,
        observed_at=target,
        state=_state_from_score(
            score,
            breadth_vote=int(breadth_vote),
            sector_vote=int(sector_vote),
        ),
        directional_score=score,
        confidence=confidence,
        positive_sector_ratio=positive_sector_ratio,
        leverage_state=leverage.state,
        components=components,
        execution_allowed=False,
    )
