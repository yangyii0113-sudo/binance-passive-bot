import json
from pathlib import Path
from types import SimpleNamespace

from foxyya import scanner, setups
from foxyya.setups import evaluate_candidate

EXPECTED_VERSION = "FOXYYA-EXEC-V2-RC1-D-OFF-20260911"


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


def test_research_challenger_uses_distinct_strategy_namespace_and_locked_config():
    cfg = json.loads(Path("FOXYYA_RESEARCH_D_OFF_CONFIG.json").read_text(encoding="utf-8"))

    assert setups.VERSION == EXPECTED_VERSION
    assert scanner.VERSION == EXPECTED_VERSION
    assert cfg["strategy_version"] == EXPECTED_VERSION
    assert cfg["real_order_lock"] is True
    assert cfg["initial_nav_usdt"] == 997.9020135922431
