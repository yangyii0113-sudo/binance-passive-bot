from __future__ import annotations

from dataclasses import dataclass

from ..contracts import ResearchSignal, ResearchState


@dataclass(frozen=True)
class Candidate:
    instrument_id: str
    signal: ResearchSignal
    scenario: str
    invalidation: str
    risk_notes: tuple[str, ...] = ()


def insufficient_data_candidate(
    instrument_id: str,
    *reasons: str,
) -> Candidate:
    """Safe default until required research evidence is available."""
    signal = ResearchSignal(
        instrument_id=instrument_id,
        state=ResearchState.INSUFFICIENT_DATA,
        rationale=tuple(reasons) or ("Required research data is unavailable.",),
        confidence=None,
        execution_allowed=False,
    )
    return Candidate(
        instrument_id=instrument_id,
        signal=signal,
        scenario="UNAVAILABLE",
        invalidation="UNAVAILABLE",
        risk_notes=("Research only; no executable order is produced.",),
    )
