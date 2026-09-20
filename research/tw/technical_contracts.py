"""Versioned, research-only technical calculation contracts."""
from __future__ import annotations

from dataclasses import dataclass

from .contracts import Availability, EvidenceRef, ResearchState


@dataclass(frozen=True)
class TechnicalMetric:
    name: str
    value: float | None
    availability: Availability
    required_periods: int
    observed_periods: int
    coverage_ratio: float
    observed_at: str | None
    evidence: tuple[EvidenceRef, ...]
    reason: str | None = None


@dataclass(frozen=True)
class TechnicalFrame:
    timeframe: str
    observed_at: str | None
    state: ResearchState
    metrics: tuple[TechnicalMetric, ...]
    coverage_ratio: float
    rationale: tuple[str, ...]

    def by_name(self, name: str) -> TechnicalMetric | None:
        return next((item for item in self.metrics if item.name == name), None)


@dataclass(frozen=True)
class TechnicalResearchSnapshot:
    instrument_id: str
    venue: str
    end_date: str
    observed_at: str | None
    requested_sessions: int
    window_coverage_ratio: float
    daily: TechnicalFrame
    weekly: TechnicalFrame
    state: ResearchState
    volume_confirmation: str
    volatility_state: str
    coverage_ratio: float
    evidence: tuple[EvidenceRef, ...]
    rationale: tuple[str, ...]
    price_mode: str
    corporate_action_adjusted: bool
    limitations: tuple[str, ...]
    method_version: str = "tw-technical.v1"
    execution_allowed: bool = False

    def __post_init__(self) -> None:
        if self.execution_allowed:
            raise ValueError("Taiwan technical research cannot authorize execution")
