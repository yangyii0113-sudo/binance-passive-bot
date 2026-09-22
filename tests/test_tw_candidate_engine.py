from __future__ import annotations

from dataclasses import replace
from decimal import Decimal
from pathlib import Path

import pytest

from research.tw.contracts import (
    Availability,
    EvidenceRef,
    Instrument,
    ResearchSignal,
    ResearchState,
)
from research.tw.fundamental_contracts import (
    DisclosureCoverage,
    DisclosureEvidence,
    FundamentalsSnapshot,
    RevenueContext,
    RevenueRecord,
)
from research.tw.intelligence.margin_short import LeverageContextState
from research.tw.intelligence.market_regime import (
    MarketRegimeSnapshot,
    MarketRegimeState,
    RegimeComponent,
)
from research.tw.services.candidate_engine import (
    Candidate,
    build_candidate_from_fusion,
    build_research_candidate,
    fuse_candidate_research,
    rank_candidates_for_review,
    score_candidate_for_review,
    validate_candidate_evidence,
)
from research.tw.services.stock_workspace import (
    StockQuoteSnapshot,
    StockWorkspaceSnapshot,
)
from research.tw.technical_contracts import (
    TechnicalFrame,
    TechnicalMetric,
    TechnicalResearchSnapshot,
)


ROOT = Path(__file__).resolve().parents[1]
DAY = "2026-09-22"
SHA = "0" * 64


def _workspace(day=DAY):
    evidence = (
        EvidenceRef("close", "TWSE:fixture", day, "twse:2330"),
    )
    quote = StockQuoteSnapshot(
        instrument_id="twse:2330",
        observed_at=day,
        open=100.0,
        high=102.0,
        low=99.0,
        close=101.0,
        change=1.0,
        change_percent=1.0,
        trade_volume=1000,
        trade_value=101000,
        transaction_count=100,
        coverage_ratio=1.0,
        evidence=evidence,
    )
    return StockWorkspaceSnapshot(
        instrument=Instrument(
            instrument_id="twse:2330",
            symbol="2330",
            name="台積電",
            venue="TWSE",
            sector="24",
        ),
        observed_at=day,
        quote=quote,
        market_regime_state=MarketRegimeState.NARROW_POSITIVE,
        market_regime_confidence=0.9,
        execution_allowed=False,
    )


def _technical(day=DAY, state=ResearchState.BULLISH):
    frame = TechnicalFrame(
        timeframe="daily",
        observed_at=day,
        state=state,
        metrics=(),
        coverage_ratio=1.0,
        rationale=("fixture",),
    )
    return TechnicalResearchSnapshot(
        instrument_id="twse:2330",
        venue="TWSE",
        end_date=day,
        observed_at=day,
        requested_sessions=120,
        window_coverage_ratio=1.0,
        daily=frame,
        weekly=replace(frame, timeframe="weekly"),
        state=state,
        volume_confirmation="average",
        volatility_state="stable",
        coverage_ratio=1.0,
        evidence=(
            EvidenceRef("technical", "TWSE:history", day, "twse:2330"),
        ),
        rationale=("fixture",),
        price_mode="raw_unadjusted",
        corporate_action_adjusted=False,
        limitations=(),
        execution_allowed=False,
    )


def _fundamentals(
    *,
    revenue_availability=Availability.AVAILABLE,
    stale_dataset=False,
):
    evidence = DisclosureEvidence(
        dataset="twse_revenue",
        source_url="https://example.invalid/twse-revenue",
        observed_at="2026-09-17",
        captured_at="2026-09-22T16:00:00+00:00",
        raw_sha256=SHA,
    )
    record = RevenueRecord(
        record_id="revenue:2330:2026-08",
        instrument_id="twse:2330",
        period="2026-08",
        current=100,
        previous_month=90,
        previous_year=80,
        cumulative=800,
        previous_cumulative=700,
        evidence=evidence,
    )
    revenue = RevenueContext(
        record=record,
        availability=revenue_availability,
        mom_percent=Decimal("11.111111"),
        yoy_percent=Decimal("25.000000"),
        ytd_yoy_percent=Decimal("14.285714"),
        reason=None,
    )
    coverage = tuple(
        DisclosureCoverage(
            dataset=f"twse_{kind}",
            availability=(
                Availability.STALE
                if stale_dataset and kind == "dividend"
                else Availability.AVAILABLE
            ),
            captured_at="2026-09-22T16:00:00+00:00",
            observed_at="2026-09-17",
            source_url=f"https://example.invalid/{kind}",
            row_count=1,
            reason=("old_source" if stale_dataset and kind == "dividend" else None),
        )
        for kind in ("revenue", "material", "dividend", "exright")
    )
    return FundamentalsSnapshot(
        instrument_id="twse:2330",
        venue="TWSE",
        as_of="2026-09-22T17:00:00+00:00",
        revenue=revenue,
        events=(),
        coverage=coverage,
        limitations=(),
        execution_allowed=False,
    )


def _regime(day=DAY, state=MarketRegimeState.NARROW_POSITIVE):
    components = tuple(
        RegimeComponent(
            name=name,
            vote=vote,
            value=value,
            coverage_ratio=1.0,
            observed_at=day,
            sources=("TWSE:fixture",),
        )
        for name, vote, value in (
            ("index", 1, 1.0),
            ("breadth", 1, 0.4),
            ("foreign_flow", 1, 100),
            ("sector_diffusion", 0, 0.5),
            ("leverage_context", None, "mixed"),
        )
    )
    return MarketRegimeSnapshot(
        venue="TWSE",
        observed_at=day,
        state=state,
        directional_score=3,
        confidence=0.9,
        positive_sector_ratio=0.5,
        leverage_state=LeverageContextState.MIXED,
        components=components,
        execution_allowed=False,
    )


def test_complete_evidence_gate_is_ready_and_traceable():
    result = validate_candidate_evidence(
        workspace=_workspace(),
        technical=_technical(),
        fundamentals=_fundamentals(),
        market_regime=_regime(),
    )

    assert result.ready is True
    assert result.reasons == ()
    assert result.coverage_ratio == pytest.approx(0.975)
    assert result.evidence
    assert any(ref.field == "revenue" for ref in result.evidence)
    assert any(ref.field.startswith("market_regime:") for ref in result.evidence)
    assert result.execution_allowed is False


def test_stale_disclosure_source_is_warning_not_fabricated_freshness():
    result = validate_candidate_evidence(
        workspace=_workspace(),
        technical=_technical(),
        fundamentals=_fundamentals(stale_dataset=True),
        market_regime=_regime(),
    )

    assert result.ready is True
    assert any(note.startswith("stale_disclosure_sources:") for note in result.warnings)
    assert result.coverage_ratio < 1.0


def test_unavailable_revenue_fails_candidate_evidence_gate():
    result = validate_candidate_evidence(
        workspace=_workspace(),
        technical=_technical(),
        fundamentals=_fundamentals(
            revenue_availability=Availability.UNAVAILABLE
        ),
        market_regime=_regime(),
    )

    assert result.ready is False
    assert "fundamental_evidence_insufficient" in result.reasons


def test_technical_and_market_dates_must_match_workspace_session():
    result = validate_candidate_evidence(
        workspace=_workspace(),
        technical=_technical(day="2026-09-21"),
        fundamentals=_fundamentals(),
        market_regime=_regime(day="2026-09-21"),
    )

    assert result.ready is False
    assert "technical_date_mismatch" in result.reasons
    assert "market_regime_date_mismatch" in result.reasons


def test_instrument_or_venue_mismatch_fails_closed():
    fundamentals = replace(_fundamentals(), instrument_id="twse:2317")
    result = validate_candidate_evidence(
        workspace=_workspace(),
        technical=_technical(),
        fundamentals=fundamentals,
        market_regime=_regime(),
    )

    assert result.ready is False
    assert "instrument_or_venue_mismatch" in result.reasons


def test_candidate_object_itself_cannot_authorize_execution():
    signal = ResearchSignal(
        instrument_id="twse:2330",
        state=ResearchState.NEUTRAL,
        rationale=("fixture",),
        confidence=0.5,
        execution_allowed=False,
    )
    with pytest.raises(ValueError, match="cannot authorize execution"):
        Candidate(
            instrument_id="twse:2330",
            signal=signal,
            scenario="review",
            invalidation="UNAVAILABLE",
            execution_allowed=True,
        )


def test_candidate_service_has_no_provider_network_or_execution_import():
    source = (
        ROOT / "research" / "tw" / "services" / "candidate_engine.py"
    ).read_text(encoding="utf-8")

    assert "providers." not in source
    assert "urllib" not in source
    assert "requests" not in source
    assert "foxyya.execution" not in source


def _gate(**kwargs):
    return validate_candidate_evidence(
        workspace=kwargs.get("workspace", _workspace()),
        technical=kwargs.get("technical", _technical()),
        fundamentals=kwargs.get("fundamentals", _fundamentals()),
        market_regime=kwargs.get("market_regime", _regime()),
    )


def test_research_fusion_is_bullish_when_primary_and_context_align():
    technical=_technical(state=ResearchState.BULLISH)
    fundamentals=_fundamentals()
    market=_regime(state=MarketRegimeState.NARROW_POSITIVE)
    result=fuse_candidate_research(
        gate=_gate(technical=technical,fundamentals=fundamentals,market_regime=market),
        technical=technical,
        fundamentals=fundamentals,
        market_regime=market,
    )

    assert result.state == ResearchState.BULLISH
    assert result.directional_score == 4
    assert result.confidence == pytest.approx(0.975)
    assert "confidence_is_not_a_return_probability" in result.risk_notes
    assert result.execution_allowed is False


def test_research_fusion_neutralizes_strong_directional_disagreement():
    technical=_technical(state=ResearchState.BULLISH)
    fundamentals=replace(
        _fundamentals(),
        revenue=replace(
            _fundamentals().revenue,
            yoy_percent=Decimal("-20.000000"),
        ),
    )
    market=_regime(state=MarketRegimeState.BROAD_NEGATIVE)
    result=fuse_candidate_research(
        gate=_gate(technical=technical,fundamentals=fundamentals,market_regime=market),
        technical=technical,
        fundamentals=fundamentals,
        market_regime=market,
    )

    assert result.state == ResearchState.NEUTRAL
    assert result.directional_score == 0
    assert "technical_market_direction_divergence" in result.risk_notes
    assert result.confidence < result.evidence_coverage


def test_research_fusion_fail_closed_when_evidence_gate_is_not_ready():
    fundamentals=_fundamentals(
        revenue_availability=Availability.UNAVAILABLE
    )
    gate=_gate(fundamentals=fundamentals)
    result=fuse_candidate_research(
        gate=gate,
        technical=_technical(),
        fundamentals=fundamentals,
        market_regime=_regime(),
    )

    assert gate.ready is False
    assert result.state == ResearchState.INSUFFICIENT_DATA
    assert result.directional_score is None
    assert result.confidence is None
    assert "fundamental_evidence_insufficient" in result.rationale


def test_mixed_market_regime_reduces_consistency_not_to_zero():
    technical=_technical(state=ResearchState.BULLISH)
    market=_regime(state=MarketRegimeState.MIXED)
    fundamentals=_fundamentals()
    gate=_gate(
        technical=technical,
        fundamentals=fundamentals,
        market_regime=market,
    )
    result=fuse_candidate_research(
        gate=gate,
        technical=technical,
        fundamentals=fundamentals,
        market_regime=market,
    )

    assert result.state == ResearchState.BULLISH
    assert result.directional_score == 3
    assert "market_regime_mixed" in result.risk_notes
    assert 0 < result.confidence < result.evidence_coverage


def _technical_with_levels(
    *,
    state=ResearchState.BULLISH,
    support=95.0,
    resistance=110.0,
    day=DAY,
):
    base=_technical(day=day,state=state)
    refs=(EvidenceRef("level","TWSE:history",day,"twse:2330"),)
    metrics=(
        TechnicalMetric(
            name="support20",
            value=support,
            availability=Availability.AVAILABLE if support is not None else Availability.UNAVAILABLE,
            required_periods=20,
            observed_periods=20 if support is not None else 0,
            coverage_ratio=1.0 if support is not None else 0.0,
            observed_at=day,
            evidence=refs if support is not None else (),
            reason=None if support is not None else "unavailable",
        ),
        TechnicalMetric(
            name="resistance20",
            value=resistance,
            availability=Availability.AVAILABLE if resistance is not None else Availability.UNAVAILABLE,
            required_periods=20,
            observed_periods=20 if resistance is not None else 0,
            coverage_ratio=1.0 if resistance is not None else 0.0,
            observed_at=day,
            evidence=refs if resistance is not None else (),
            reason=None if resistance is not None else "unavailable",
        ),
    )
    return replace(base,daily=replace(base.daily,metrics=metrics))


def _negative_fundamentals():
    base=_fundamentals()
    return replace(
        base,
        revenue=replace(
            base.revenue,
            yoy_percent=Decimal("-20.000000"),
        ),
    )


def test_bullish_candidate_requires_and_exposes_support_invalidation():
    technical=_technical_with_levels(state=ResearchState.BULLISH,support=95)
    fundamentals=_fundamentals()
    market=_regime(state=MarketRegimeState.NARROW_POSITIVE)
    gate=_gate(technical=technical,fundamentals=fundamentals,market_regime=market)
    fusion=fuse_candidate_research(
        gate=gate,
        technical=technical,
        fundamentals=fundamentals,
        market_regime=market,
    )
    candidate=build_candidate_from_fusion(fusion=fusion,technical=technical)

    assert candidate.signal.state == ResearchState.BULLISH
    assert candidate.scenario == "positive_evidence_continuation_review"
    assert candidate.invalidation == "daily_close_below_support20:95"
    assert candidate.signal.confidence == fusion.confidence
    assert candidate.signal.evidence == fusion.evidence
    assert candidate.execution_allowed is False


def test_bearish_candidate_uses_resistance_as_invalidation():
    technical=_technical_with_levels(state=ResearchState.BEARISH,resistance=110)
    fundamentals=_negative_fundamentals()
    market=_regime(state=MarketRegimeState.BROAD_NEGATIVE)
    gate=_gate(technical=technical,fundamentals=fundamentals,market_regime=market)
    fusion=fuse_candidate_research(
        gate=gate,
        technical=technical,
        fundamentals=fundamentals,
        market_regime=market,
    )
    candidate=build_candidate_from_fusion(fusion=fusion,technical=technical)

    assert fusion.state == ResearchState.BEARISH
    assert candidate.signal.state == ResearchState.BEARISH
    assert candidate.scenario == "negative_evidence_continuation_review"
    assert candidate.invalidation == "daily_close_above_resistance20:110"


def test_directional_candidate_without_invalidation_level_fails_closed():
    technical=_technical_with_levels(
        state=ResearchState.BULLISH,
        support=None,
    )
    fundamentals=_fundamentals()
    market=_regime(state=MarketRegimeState.NARROW_POSITIVE)
    # Gate remains valid because support/resistance is a scenario-stage requirement.
    gate=_gate(technical=technical,fundamentals=fundamentals,market_regime=market)
    fusion=fuse_candidate_research(
        gate=gate,
        technical=technical,
        fundamentals=fundamentals,
        market_regime=market,
    )
    candidate=build_candidate_from_fusion(fusion=fusion,technical=technical)

    assert gate.ready is True
    assert fusion.state == ResearchState.BULLISH
    assert candidate.signal.state == ResearchState.INSUFFICIENT_DATA
    assert candidate.scenario == "UNAVAILABLE"
    assert candidate.invalidation == "UNAVAILABLE"
    assert candidate.signal.confidence is None


def test_neutral_candidate_does_not_invent_directional_invalidation():
    technical=_technical_with_levels(state=ResearchState.NEUTRAL)
    fundamentals=_fundamentals()
    market=_regime(state=MarketRegimeState.MIXED)
    gate=_gate(technical=technical,fundamentals=fundamentals,market_regime=market)
    fusion=fuse_candidate_research(
        gate=gate,
        technical=technical,
        fundamentals=fundamentals,
        market_regime=market,
    )
    candidate=build_candidate_from_fusion(fusion=fusion,technical=technical)

    assert candidate.signal.state == ResearchState.NEUTRAL
    assert candidate.scenario == "mixed_evidence_review"
    assert candidate.invalidation == "UNAVAILABLE"


def test_scenario_builder_rechecks_technical_identity_and_date():
    technical=_technical_with_levels(state=ResearchState.BULLISH)
    fundamentals=_fundamentals()
    market=_regime()
    gate=_gate(technical=technical,fundamentals=fundamentals,market_regime=market)
    fusion=fuse_candidate_research(
        gate=gate,
        technical=technical,
        fundamentals=fundamentals,
        market_regime=market,
    )
    mismatched=replace(technical,observed_at="2026-09-21")
    candidate=build_candidate_from_fusion(fusion=fusion,technical=mismatched)

    assert candidate.signal.state == ResearchState.INSUFFICIENT_DATA
    assert "technical_identity_or_date_mismatch" in candidate.signal.rationale


def test_complete_candidate_pipeline_assigns_review_priority_not_execution():
    technical=_technical_with_levels(state=ResearchState.BULLISH,support=95)
    candidate=build_research_candidate(
        workspace=_workspace(),
        technical=technical,
        fundamentals=_fundamentals(),
        market_regime=_regime(),
    )

    assert candidate.signal.state == ResearchState.BULLISH
    assert candidate.review_priority > 0
    assert candidate.evidence_coverage > 0
    assert candidate.execution_allowed is False
    assert candidate.signal.execution_allowed is False
    assert "probability" in " ".join(candidate.risk_notes)


def test_insufficient_candidate_priority_is_zero():
    technical=_technical_with_levels(state=ResearchState.BULLISH,support=None)
    candidate=build_research_candidate(
        workspace=_workspace(),
        technical=technical,
        fundamentals=_fundamentals(),
        market_regime=_regime(),
    )

    assert candidate.signal.state == ResearchState.INSUFFICIENT_DATA
    assert candidate.review_priority == 0


def test_neutral_review_priority_is_lower_at_same_evidence_confidence():
    signal_directional=ResearchSignal(
        instrument_id="twse:2330",
        state=ResearchState.BULLISH,
        rationale=("fixture",),
        confidence=0.8,
        execution_allowed=False,
    )
    signal_neutral=replace(signal_directional,state=ResearchState.NEUTRAL)
    directional=Candidate(
        instrument_id="twse:2330",
        signal=signal_directional,
        scenario="positive_evidence_continuation_review",
        invalidation="daily_close_below_support20:95",
        evidence_coverage=0.8,
    )
    neutral=Candidate(
        instrument_id="twse:2317",
        signal=replace(signal_neutral,instrument_id="twse:2317"),
        scenario="mixed_evidence_review",
        invalidation="UNAVAILABLE",
        evidence_coverage=0.8,
    )

    assert score_candidate_for_review(directional).review_priority > (
        score_candidate_for_review(neutral).review_priority
    )


def test_review_ranking_is_deterministic_and_incomplete_last():
    def make(symbol,state,confidence,coverage):
        signal=ResearchSignal(
            instrument_id=f"twse:{symbol}",
            state=state,
            rationale=("fixture",),
            confidence=confidence,
            execution_allowed=False,
        )
        return Candidate(
            instrument_id=f"twse:{symbol}",
            signal=signal,
            scenario="review" if state != ResearchState.INSUFFICIENT_DATA else "UNAVAILABLE",
            invalidation="UNAVAILABLE",
            evidence_coverage=coverage,
        )

    rows=(
        make("3000",ResearchState.INSUFFICIENT_DATA,None,0.9),
        make("2000",ResearchState.BULLISH,0.8,0.8),
        make("1000",ResearchState.BULLISH,0.8,0.8),
        make("4000",ResearchState.NEUTRAL,0.9,0.9),
    )
    ranked=rank_candidates_for_review(reversed(rows),limit=4)

    assert tuple(item.instrument_id for item in ranked) == (
        "twse:1000",
        "twse:2000",
        "twse:4000",
        "twse:3000",
    )
    assert ranked[-1].review_priority == 0


def test_review_ranking_rejects_duplicate_instruments_and_invalid_limit():
    signal=ResearchSignal(
        instrument_id="twse:2330",
        state=ResearchState.NEUTRAL,
        rationale=("fixture",),
        confidence=0.5,
    )
    row=Candidate(
        instrument_id="twse:2330",
        signal=signal,
        scenario="review",
        invalidation="UNAVAILABLE",
        evidence_coverage=0.5,
    )
    with pytest.raises(ValueError,match="duplicate"):
        rank_candidates_for_review((row,row))
    with pytest.raises(ValueError,match="positive integer"):
        rank_candidates_for_review((row,),limit=0)


def test_review_priority_is_unchanged_by_scenario_text():
    signal=ResearchSignal(
        instrument_id="twse:2330",
        state=ResearchState.BULLISH,
        rationale=("fixture",),
        confidence=0.8,
    )
    first=Candidate(
        instrument_id="twse:2330",
        signal=signal,
        scenario="scenario-a",
        invalidation="level-a",
        evidence_coverage=0.8,
    )
    second=replace(first,scenario="scenario-b",invalidation="level-b")

    assert score_candidate_for_review(first).review_priority == (
        score_candidate_for_review(second).review_priority
    )
