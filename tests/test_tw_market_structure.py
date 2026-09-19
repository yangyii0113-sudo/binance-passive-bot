from __future__ import annotations

import json
from pathlib import Path

from research.tw.contracts import Availability, Observation
from research.tw.intelligence.market_structure import build_market_structure
from research.tw.providers.tpex import TPExProvider
from research.tw.providers.twse import TWSEProvider


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests" / "fixtures" / "tw"


class FixtureTransport:
    def __init__(self, mapping: dict[str, str]) -> None:
        self.mapping = mapping

    def get_json(self, url: str):
        return json.loads(
            (FIXTURES / self.mapping[url]).read_text(encoding="utf-8")
        )


def _fixture_observations():
    mapping = {
        TWSEProvider.QUOTES_URL: "twse_stock_day_all.json",
        TWSEProvider.INDEX_URL: "twse_fmtqik.json",
        TPExProvider.QUOTES_URL: "tpex_mainboard_daily_close_quotes.json",
        TPExProvider.INDEX_URL: "tpex_daily_trading_index.json",
    }
    transport = FixtureTransport(mapping)
    twse = TWSEProvider(transport)
    tpex = TPExProvider(transport)
    return (
        tuple(twse.fetch_all_instrument_observations())
        + tuple(twse.fetch_market_observations())
        + tuple(tpex.fetch_all_instrument_observations())
        + tuple(tpex.fetch_market_observations())
    )


def test_twse_structure_builds_breadth_turnover_and_index_context():
    result = build_market_structure(_fixture_observations(), venue="TWSE")

    assert result.observed_at == "2026-09-18"
    assert result.breadth.advancers == 2
    assert result.breadth.decliners == 0
    assert result.breadth.unchanged == 0
    assert result.breadth.total == 2
    assert result.breadth.coverage_ratio == 1.0
    assert result.breadth.net_breadth_ratio == 1.0
    assert result.turnover.trade_value == 1142321910407
    assert result.index.index_close == 47180.75
    assert result.index.index_change == 892.75
    assert result.index.index_change_percent is not None
    assert result.coverage_ratio == 1.0
    assert all(item.source for item in result.breadth.evidence)
    assert all(item.observed_at == "2026-09-18" for item in result.breadth.evidence)


def test_tpex_structure_detects_declining_fixture():
    result = build_market_structure(_fixture_observations(), venue="TPEX")

    assert result.breadth.advancers == 0
    assert result.breadth.decliners == 1
    assert result.breadth.total == 1
    assert result.breadth.net_breadth_ratio == -1.0
    assert result.turnover.trade_value == 85000000000
    assert result.index.index_close == 300.25
    assert result.coverage_ratio == 1.0


def test_unavailable_change_percent_reduces_coverage_without_crashing():
    rows = list(_fixture_observations())
    rows.append(
        Observation(
            instrument_id="twse:9999",
            field="change_percent",
            value=None,
            source="TWSE:fixture",
            observed_at="2026-09-18",
            availability=Availability.UNAVAILABLE,
            metadata={"venue": "TWSE", "symbol": "9999"},
        )
    )

    result = build_market_structure(rows, venue="TWSE")

    assert result.breadth.total == 3
    assert result.breadth.unavailable == 1
    assert result.breadth.coverage_ratio == 2 / 3
    assert result.coverage_ratio < 1.0


def test_market_structure_is_pure_canonical_intelligence():
    source = (
        ROOT
        / "research"
        / "tw"
        / "intelligence"
        / "market_structure.py"
    ).read_text(encoding="utf-8")

    assert "urllib" not in source
    assert "requests" not in source
    assert "providers.twse" not in source
    assert "providers.tpex" not in source
