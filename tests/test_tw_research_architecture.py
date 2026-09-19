from datetime import datetime, timedelta, timezone

import pytest

from research.tw.contracts import (
    Availability,
    Observation,
    ResearchSignal,
    ResearchState,
)
from research.tw.data_quality import apply_quality_gate
from research.tw.services.candidate_engine import insufficient_data_candidate


def test_missing_provenance_is_unavailable():
    observation = Observation(
        instrument_id="twse:2330",
        field="close",
        value=1000.0,
        source=None,
        observed_at=None,
    )
    assert apply_quality_gate(observation).availability == Availability.UNAVAILABLE


def test_old_value_is_stale():
    now = datetime(2026, 9, 19, 8, 0, tzinfo=timezone.utc)
    observation = Observation(
        instrument_id="twse:2330",
        field="close",
        value=1000.0,
        source="TWSE",
        observed_at=(now - timedelta(hours=2)).isoformat(),
    )
    checked = apply_quality_gate(
        observation,
        now=now,
        stale_after_seconds=3600,
    )
    assert checked.availability == Availability.STALE


def test_taiwan_research_signal_cannot_authorize_execution():
    with pytest.raises(ValueError):
        ResearchSignal(
            instrument_id="twse:2330",
            state=ResearchState.BULLISH,
            rationale=("test",),
            execution_allowed=True,
        )


def test_candidate_safe_default_is_research_only():
    candidate = insufficient_data_candidate(
        "twse:2330",
        "institutional flow unavailable",
    )
    assert candidate.signal.state == ResearchState.INSUFFICIENT_DATA
    assert candidate.signal.execution_allowed is False
    assert candidate.scenario == "UNAVAILABLE"
