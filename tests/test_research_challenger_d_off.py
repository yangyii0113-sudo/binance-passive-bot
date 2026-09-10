from types import SimpleNamespace

from foxyya.setups import evaluate_candidate


def _d_and_c_qualified_feature():
    bars = [
        {"high": 110.0, "low": 100.0, "close": 105.0, "volume": 100.0, "close_ms": 1, "closed": True},
        {"high": 109.0, "low": 99.0, "close": 104.0, "volume": 100.0, "close_ms": 2, "closed": True},
        {"high": 108.0, "low": 98.0, "close": 103.0, "volume": 100.0, "close_ms": 3, "closed": True},
        {"high": 107.0, "low": 97.0, "close": 102.0, "volume": 100.0, "close_ms": 4, "closed": True},
        {"high": 105.0, "low": 100.0, "close": 103.0, "volume": 100.0, "close_ms": 5, "closed": True},
        {"high": 104.0, "low": 99.0, "close": 102.0, "volume": 100.0, "close_ms": 6, "closed": True},
        {"high": 103.0, "low": 98.0, "close": 101.0, "volume": 100.0, "close_ms": 7, "closed": True},
        {"high": 112.0, "low": 101.0, "close": 111.0, "volume": 130.0, "close_ms": 8, "closed": True},
    ]
    return SimpleNamespace(
        symbol="ETHUSDT",
        daily_trend="UP",
        h4_trend="UP",
        atr_extension=1.0,
        bars_1h=bars,
    )


def test_research_challenger_does_not_select_family_d_when_fallback_is_available():
    decision = evaluate_candidate(_d_and_c_qualified_feature(), "LONG", "NEUTRAL_ROTATION", 1)

    assert decision.qualified is True
    assert decision.family == "C"
