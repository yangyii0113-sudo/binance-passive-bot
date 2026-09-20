"""Exercise the live-smoke acceptance guard with canonical deterministic data."""
from dataclasses import replace

import pytest

from test_tw_technical_research import bars, window
from tools.tw_technical_smoke import technical_smoke_summary


@pytest.mark.parametrize("venue", ["TWSE", "TPEX"])
def test_technical_smoke_proves_ready_canonical_history(venue):
    result = technical_smoke_summary(window(bars(120, venue=venue)))
    assert result["ok"] is True
    assert result["sessions"] == 120
    assert result["coverage_ratio"] == 1
    assert result["execution_allowed"] is False
    assert result["price_mode"] == "raw_unadjusted"
    assert result["daily_metrics"]["sma60"] == 289.5
    assert result["weekly_state"] == "bullish"
    assert result["sources"] == [f"{venue}:synthetic-test"]


def test_technical_smoke_fails_if_real_pipeline_has_insufficient_history():
    with pytest.raises(RuntimeError, match="technical acceptance"):
        technical_smoke_summary(window(bars(20), sessions=120))


def test_technical_smoke_fails_if_real_pipeline_has_missing_volume():
    rows = list(bars())
    rows[-1] = replace(rows[-1], volume=None)
    with pytest.raises(RuntimeError, match="technical acceptance"):
        technical_smoke_summary(window(rows))
