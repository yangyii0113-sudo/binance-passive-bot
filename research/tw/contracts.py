from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class Availability(str, Enum):
    AVAILABLE = "AVAILABLE"
    STALE = "STALE"
    UNAVAILABLE = "UNAVAILABLE"


class ResearchState(str, Enum):
    BULLISH = "bullish"
    NEUTRAL = "neutral"
    BEARISH = "bearish"
    INSUFFICIENT_DATA = "insufficient_data"


@dataclass(frozen=True)
class Instrument:
    instrument_id: str
    symbol: str
    name: str
    venue: str
    currency: str = "TWD"
    sector: str | None = None
    industry: str | None = None


@dataclass(frozen=True)
class Observation:
    instrument_id: str
    field: str
    value: Any
    source: str | None
    observed_at: str | None
    received_at: str | None = None
    freshness_seconds: int | None = None
    availability: Availability = Availability.UNAVAILABLE
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class EvidenceRef:
    field: str
    source: str
    observed_at: str
    instrument_id: str | None = None


@dataclass(frozen=True)
class ResearchSignal:
    instrument_id: str
    state: ResearchState
    rationale: tuple[str, ...]
    evidence: tuple[EvidenceRef, ...] = ()
    confidence: float | None = None
    execution_allowed: bool = False

    def __post_init__(self) -> None:
        if self.execution_allowed:
            raise ValueError("Taiwan Research Plane cannot authorize execution")
        if self.confidence is not None and not 0.0 <= self.confidence <= 1.0:
            raise ValueError("confidence must be between 0 and 1")
