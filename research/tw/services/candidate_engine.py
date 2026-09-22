from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta, timezone

from ..contracts import Availability, EvidenceRef, ResearchSignal, ResearchState
from ..fundamental_contracts import FundamentalsSnapshot, instant
from ..intelligence.market_regime import MarketRegimeSnapshot, MarketRegimeState
from .stock_workspace import StockWorkspaceSnapshot
from ..technical_contracts import TechnicalResearchSnapshot


MIN_QUOTE_COVERAGE = 0.80
MIN_TECHNICAL_COVERAGE = 0.90
MIN_MARKET_COVERAGE = 0.60
MIN_FUNDAMENTAL_COVERAGE = 0.50
TAIPEI = timezone(timedelta(hours=8))


@dataclass(frozen=True)
class Candidate:
    instrument_id: str
    signal: ResearchSignal
    scenario: str
    invalidation: str
    risk_notes: tuple[str, ...] = ()
    evidence_coverage: float = 0.0
    review_priority: int = 0
    method_version: str = "tw-candidate.v1"
    execution_allowed: bool = False

    def __post_init__(self) -> None:
        if self.execution_allowed or self.signal.execution_allowed:
            raise ValueError("Taiwan research candidate cannot authorize execution")
        if not 0.0 <= self.evidence_coverage <= 1.0:
            raise ValueError("candidate evidence_coverage must be between 0 and 1")
        if not 0 <= self.review_priority <= 100:
            raise ValueError("candidate review_priority must be between 0 and 100")


@dataclass(frozen=True)
class CandidateResearchFusion:
    instrument_id: str
    observed_at: str | None
    state: ResearchState
    directional_score: int | None
    evidence_coverage: float
    confidence: float | None
    rationale: tuple[str, ...]
    risk_notes: tuple[str, ...]
    evidence: tuple[EvidenceRef, ...]
    execution_allowed: bool = False

    def __post_init__(self) -> None:
        if self.execution_allowed:
            raise ValueError("Taiwan candidate fusion cannot authorize execution")
        if not 0.0 <= self.evidence_coverage <= 1.0:
            raise ValueError("fusion evidence_coverage must be between 0 and 1")
        if self.confidence is not None and not 0.0 <= self.confidence <= 1.0:
            raise ValueError("fusion confidence must be between 0 and 1")


@dataclass(frozen=True)
class CandidateEvidenceGate:
    instrument_id: str
    venue: str
    observed_at: str | None
    ready: bool
    coverage_ratio: float
    evidence: tuple[EvidenceRef, ...]
    reasons: tuple[str, ...]
    warnings: tuple[str, ...] = ()
    execution_allowed: bool = False

    def __post_init__(self) -> None:
        if self.execution_allowed:
            raise ValueError("Taiwan candidate evidence gate cannot authorize execution")
        if not 0.0 <= self.coverage_ratio <= 1.0:
            raise ValueError("candidate gate coverage_ratio must be between 0 and 1")


def _dedupe_evidence(items) -> tuple[EvidenceRef, ...]:
    return tuple(dict.fromkeys(item for item in items if isinstance(item, EvidenceRef)))


def _fundamental_coverage(snapshot: FundamentalsSnapshot) -> float:
    if not snapshot.coverage:
        return 0.0
    weights = {
        Availability.AVAILABLE: 1.0,
        Availability.STALE: 0.5,
        Availability.UNAVAILABLE: 0.0,
    }
    return sum(weights[item.availability] for item in snapshot.coverage) / len(
        snapshot.coverage
    )


def _fundamental_evidence(snapshot: FundamentalsSnapshot) -> tuple[EvidenceRef, ...]:
    refs: list[EvidenceRef] = []
    if snapshot.revenue.record is not None:
        evidence = snapshot.revenue.record.evidence
        refs.append(
            EvidenceRef(
                field="revenue",
                source=evidence.dataset,
                observed_at=evidence.observed_at,
                instrument_id=snapshot.instrument_id,
            )
        )
    for item in snapshot.events:
        evidence = item.record.evidence
        refs.append(
            EvidenceRef(
                field=f"event:{item.record.kind}",
                source=evidence.dataset,
                observed_at=evidence.observed_at,
                instrument_id=snapshot.instrument_id,
            )
        )
    return _dedupe_evidence(refs)


def _market_evidence(snapshot: MarketRegimeSnapshot) -> tuple[EvidenceRef, ...]:
    refs = []
    for component in snapshot.components:
        if not component.observed_at:
            continue
        for source in component.sources:
            if source:
                refs.append(
                    EvidenceRef(
                        field=f"market_regime:{component.name}",
                        source=source,
                        observed_at=component.observed_at,
                        instrument_id=f"{snapshot.venue.lower()}:MARKET",
                    )
                )
    return _dedupe_evidence(refs)


def validate_candidate_evidence(
    *,
    workspace: StockWorkspaceSnapshot,
    technical: TechnicalResearchSnapshot,
    fundamentals: FundamentalsSnapshot,
    market_regime: MarketRegimeSnapshot,
) -> CandidateEvidenceGate:
    """Validate P3.5 inputs without assigning a directional candidate state.

    The gate checks identity, venue, session compatibility, source evidence and
    coverage. It never repairs dates or substitutes unavailable evidence.
    """
    reasons: list[str] = []
    warnings: list[str] = []

    instrument_id = workspace.instrument.instrument_id
    venue = workspace.instrument.venue.upper()
    observed_at = workspace.observed_at

    if (
        technical.instrument_id != instrument_id
        or fundamentals.instrument_id != instrument_id
        or technical.venue.upper() != venue
        or fundamentals.venue.upper() != venue
        or market_regime.venue.upper() != venue
    ):
        reasons.append("instrument_or_venue_mismatch")

    if (
        workspace.execution_allowed
        or technical.execution_allowed
        or fundamentals.execution_allowed
        or market_regime.execution_allowed
    ):
        reasons.append("execution_boundary_violation")

    if observed_at is None:
        reasons.append("workspace_date_unavailable")
    else:
        if technical.observed_at != observed_at:
            reasons.append("technical_date_mismatch")
        if market_regime.observed_at != observed_at:
            reasons.append("market_regime_date_mismatch")
        try:
            fundamentals_local_date = instant(fundamentals.as_of).astimezone(TAIPEI).date()
            if fundamentals_local_date < date.fromisoformat(observed_at):
                reasons.append("fundamentals_cutoff_precedes_market_date")
        except Exception:
            reasons.append("invalid_fundamentals_cutoff")

    quote_coverage = workspace.quote.coverage_ratio
    if (
        workspace.quote.close is None
        or quote_coverage < MIN_QUOTE_COVERAGE
        or not workspace.quote.evidence
    ):
        reasons.append("quote_evidence_insufficient")

    if (
        technical.state == ResearchState.INSUFFICIENT_DATA
        or technical.coverage_ratio < MIN_TECHNICAL_COVERAGE
        or not technical.evidence
    ):
        reasons.append("technical_evidence_insufficient")

    market_evidence = _market_evidence(market_regime)
    if (
        market_regime.state == MarketRegimeState.INSUFFICIENT_DATA
        or market_regime.confidence < MIN_MARKET_COVERAGE
        or not market_evidence
    ):
        reasons.append("market_evidence_insufficient")

    fundamental_coverage = _fundamental_coverage(fundamentals)
    fundamental_evidence = _fundamental_evidence(fundamentals)
    if (
        fundamentals.revenue.availability == Availability.UNAVAILABLE
        or fundamental_coverage < MIN_FUNDAMENTAL_COVERAGE
        or not fundamental_evidence
    ):
        reasons.append("fundamental_evidence_insufficient")
    elif fundamentals.revenue.availability == Availability.STALE:
        warnings.append("revenue_context_stale")

    stale_datasets = tuple(
        item.dataset
        for item in fundamentals.coverage
        if item.availability == Availability.STALE
    )
    if stale_datasets:
        warnings.append("stale_disclosure_sources:" + ",".join(sorted(stale_datasets)))

    evidence = _dedupe_evidence(
        workspace.quote.evidence
        + technical.evidence
        + market_evidence
        + fundamental_evidence
    )
    coverage = (
        quote_coverage
        + technical.coverage_ratio
        + market_regime.confidence
        + fundamental_coverage
    ) / 4.0

    return CandidateEvidenceGate(
        instrument_id=instrument_id,
        venue=venue,
        observed_at=observed_at,
        ready=not reasons,
        coverage_ratio=max(0.0, min(1.0, coverage)),
        evidence=evidence,
        reasons=tuple(dict.fromkeys(reasons)),
        warnings=tuple(dict.fromkeys(warnings)),
        execution_allowed=False,
    )


def _research_vote(state: ResearchState) -> int:
    if state == ResearchState.BULLISH:
        return 1
    if state == ResearchState.BEARISH:
        return -1
    return 0


def _market_vote(state: MarketRegimeState) -> int:
    if state in {
        MarketRegimeState.BROAD_POSITIVE,
        MarketRegimeState.NARROW_POSITIVE,
    }:
        return 1
    if state in {
        MarketRegimeState.BROAD_NEGATIVE,
        MarketRegimeState.NARROW_NEGATIVE,
    }:
        return -1
    return 0


def _revenue_vote(snapshot: FundamentalsSnapshot) -> int:
    value = snapshot.revenue.yoy_percent
    if value is None:
        return 0
    if value > 0:
        return 1
    if value < 0:
        return -1
    return 0


def fuse_candidate_research(
    *,
    gate: CandidateEvidenceGate,
    technical: TechnicalResearchSnapshot,
    fundamentals: FundamentalsSnapshot,
    market_regime: MarketRegimeSnapshot,
) -> CandidateResearchFusion:
    """Fuse validated evidence into a descriptive research state.

    Confidence measures evidence completeness/consistency only. It is not a
    probability of profit, return forecast or execution qualification.
    """
    if not gate.ready:
        return CandidateResearchFusion(
            instrument_id=gate.instrument_id,
            observed_at=gate.observed_at,
            state=ResearchState.INSUFFICIENT_DATA,
            directional_score=None,
            evidence_coverage=gate.coverage_ratio,
            confidence=None,
            rationale=gate.reasons or ("required_evidence_not_ready",),
            risk_notes=gate.warnings + (
                "confidence_is_not_a_return_probability",
            ),
            evidence=gate.evidence,
            execution_allowed=False,
        )

    technical_vote = _research_vote(technical.state)
    market_vote = _market_vote(market_regime.state)
    revenue_vote = _revenue_vote(fundamentals)
    score = technical_vote * 2 + market_vote + revenue_vote

    if score >= 2:
        state = ResearchState.BULLISH
    elif score <= -2:
        state = ResearchState.BEARISH
    else:
        state = ResearchState.NEUTRAL

    consistency = 1.0
    risk_notes = list(gate.warnings)
    if technical_vote == 0:
        consistency *= 0.85
        risk_notes.append("technical_state_neutral")
    elif market_vote == 0:
        consistency *= 0.90
        risk_notes.append("market_regime_mixed")
    elif technical_vote != market_vote:
        consistency *= 0.70
        risk_notes.append("technical_market_direction_divergence")

    if (
        revenue_vote != 0
        and technical_vote != 0
        and revenue_vote != technical_vote
    ):
        consistency *= 0.90
        risk_notes.append("revenue_growth_direction_diverges_from_technical")

    risk_notes.extend(technical.limitations)
    risk_notes.extend(fundamentals.limitations)
    risk_notes.append("confidence_is_not_a_return_probability")

    confidence = max(
        0.0,
        min(1.0, gate.coverage_ratio * consistency),
    )
    rationale = (
        f"technical_state:{technical.state.value}",
        f"market_regime:{market_regime.state.value}",
        f"revenue_yoy_direction:{revenue_vote}",
        f"descriptive_score:{score}",
    )

    return CandidateResearchFusion(
        instrument_id=gate.instrument_id,
        observed_at=gate.observed_at,
        state=state,
        directional_score=score,
        evidence_coverage=gate.coverage_ratio,
        confidence=confidence,
        rationale=rationale,
        risk_notes=tuple(dict.fromkeys(risk_notes)),
        evidence=gate.evidence,
        execution_allowed=False,
    )


def _metric_value(
    technical: TechnicalResearchSnapshot,
    name: str,
) -> float | None:
    metric = technical.daily.by_name(name)
    if (
        metric is None
        or metric.availability != Availability.AVAILABLE
        or metric.value is None
    ):
        return None
    return float(metric.value)


def build_candidate_from_fusion(
    *,
    fusion: CandidateResearchFusion,
    technical: TechnicalResearchSnapshot,
) -> Candidate:
    """Create a bounded research scenario from a completed fusion result.

    Directional candidates require an explicit canonical invalidation level.
    Missing support/resistance fails closed rather than inventing a level.
    """
    if (
        fusion.state == ResearchState.INSUFFICIENT_DATA
        or fusion.directional_score is None
    ):
        signal = ResearchSignal(
            instrument_id=fusion.instrument_id,
            state=ResearchState.INSUFFICIENT_DATA,
            rationale=fusion.rationale or ("required_evidence_not_ready",),
            evidence=fusion.evidence,
            confidence=None,
            execution_allowed=False,
        )
        return Candidate(
            instrument_id=fusion.instrument_id,
            signal=signal,
            scenario="UNAVAILABLE",
            invalidation="UNAVAILABLE",
            risk_notes=tuple(dict.fromkeys(
                fusion.risk_notes
                + ("Research only; no executable order is produced.",)
            )),
            evidence_coverage=fusion.evidence_coverage,
            review_priority=0,
            execution_allowed=False,
        )

    if (
        technical.instrument_id != fusion.instrument_id
        or technical.observed_at != fusion.observed_at
    ):
        signal = ResearchSignal(
            instrument_id=fusion.instrument_id,
            state=ResearchState.INSUFFICIENT_DATA,
            rationale=("technical_identity_or_date_mismatch",),
            evidence=fusion.evidence,
            confidence=None,
            execution_allowed=False,
        )
        return Candidate(
            instrument_id=fusion.instrument_id,
            signal=signal,
            scenario="UNAVAILABLE",
            invalidation="UNAVAILABLE",
            risk_notes=tuple(dict.fromkeys(
                fusion.risk_notes
                + ("Research only; no executable order is produced.",)
            )),
            evidence_coverage=fusion.evidence_coverage,
            review_priority=0,
            execution_allowed=False,
        )

    scenario = "mixed_evidence_review"
    invalidation = "UNAVAILABLE"
    if fusion.state == ResearchState.BULLISH:
        support = _metric_value(technical, "support20")
        if support is None:
            return Candidate(
                instrument_id=fusion.instrument_id,
                signal=ResearchSignal(
                    instrument_id=fusion.instrument_id,
                    state=ResearchState.INSUFFICIENT_DATA,
                    rationale=("directional_invalidation_level_unavailable",),
                    evidence=fusion.evidence,
                    confidence=None,
                    execution_allowed=False,
                ),
                scenario="UNAVAILABLE",
                invalidation="UNAVAILABLE",
                risk_notes=tuple(dict.fromkeys(
                    fusion.risk_notes
                    + ("Research only; no executable order is produced.",)
                )),
                evidence_coverage=fusion.evidence_coverage,
                review_priority=0,
                execution_allowed=False,
            )
        scenario = "positive_evidence_continuation_review"
        invalidation = f"daily_close_below_support20:{support:.6g}"
    elif fusion.state == ResearchState.BEARISH:
        resistance = _metric_value(technical, "resistance20")
        if resistance is None:
            return Candidate(
                instrument_id=fusion.instrument_id,
                signal=ResearchSignal(
                    instrument_id=fusion.instrument_id,
                    state=ResearchState.INSUFFICIENT_DATA,
                    rationale=("directional_invalidation_level_unavailable",),
                    evidence=fusion.evidence,
                    confidence=None,
                    execution_allowed=False,
                ),
                scenario="UNAVAILABLE",
                invalidation="UNAVAILABLE",
                risk_notes=tuple(dict.fromkeys(
                    fusion.risk_notes
                    + ("Research only; no executable order is produced.",)
                )),
                evidence_coverage=fusion.evidence_coverage,
                review_priority=0,
                execution_allowed=False,
            )
        scenario = "negative_evidence_continuation_review"
        invalidation = f"daily_close_above_resistance20:{resistance:.6g}"

    signal = ResearchSignal(
        instrument_id=fusion.instrument_id,
        state=fusion.state,
        rationale=fusion.rationale,
        evidence=fusion.evidence,
        confidence=fusion.confidence,
        execution_allowed=False,
    )
    return Candidate(
        instrument_id=fusion.instrument_id,
        signal=signal,
        scenario=scenario,
        invalidation=invalidation,
        risk_notes=tuple(dict.fromkeys(
            fusion.risk_notes
            + ("Research only; no executable order is produced.",)
        )),
        evidence_coverage=fusion.evidence_coverage,
        review_priority=0,
        execution_allowed=False,
    )


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
        evidence_coverage=0.0,
        review_priority=0,
        execution_allowed=False,
    )
