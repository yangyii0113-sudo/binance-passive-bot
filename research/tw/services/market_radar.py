from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from ..contracts import Availability, Observation, ResearchState


@dataclass(frozen=True)
class MarketRadarResult:
    state: ResearchState
    available_fields: int
    unavailable_fields: int
    stale_fields: int
    observations: tuple[Observation, ...]


def build_market_radar(observations: Iterable[Observation]) -> MarketRadarResult:
    """Build a conservative market-radar shell.

    Regime scoring is intentionally deferred until the required official
    datasets and thresholds are approved. Architecture must not infer a
    market state from incomplete inputs.
    """
    rows = tuple(observations)
    available = sum(o.availability == Availability.AVAILABLE for o in rows)
    stale = sum(o.availability == Availability.STALE for o in rows)
    unavailable = sum(o.availability == Availability.UNAVAILABLE for o in rows)

    state = (
        ResearchState.INSUFFICIENT_DATA
        if unavailable or not available
        else ResearchState.NEUTRAL
    )
    return MarketRadarResult(
        state=state,
        available_fields=available,
        unavailable_fields=unavailable,
        stale_fields=stale,
        observations=rows,
    )
