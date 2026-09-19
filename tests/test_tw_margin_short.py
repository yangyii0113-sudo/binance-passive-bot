from __future__ import annotations

import json
from pathlib import Path

from research.tw.contracts import Availability, Observation
from research.tw.intelligence.margin_short import (
    LeverageContextState,
    build_margin_short_context,
)
from research.tw.providers.margin import TPExMarginProvider, TWSEMarginProvider


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests" / "fixtures" / "tw"


class FixtureTransport:
    def __init__(self, mapping: dict[str, str]) -> None:
        self.mapping = mapping

    def get_json(self, url: str):
        return json.loads(
            (FIXTURES / self.mapping[url]).read_text(encoding="utf-8")
        )


def test_twse_margin_normalizes_balance_change_and_ratio():
    provider = TWSEMarginProvider(
        FixtureTransport({TWSEMarginProvider.URL: "twse_margin.json"})
    )
    observations = provider.fetch()

    rows = {
        (item.instrument_id, item.field): item
        for item in observations
    }
    assert rows[("twse:2330", "margin_balance")].value == 1100
    assert rows[("twse:2330", "margin_change")].value == 100
    assert rows[("twse:2330", "short_change")].value == -10
    assert rows[("twse:2330", "margin_short_ratio_percent")].value == 8.181818


def test_tpex_margin_normalizes_same_canonical_fields():
    provider = TPExMarginProvider(
        FixtureTransport({TPExMarginProvider.URL: "tpex_margin.json"})
    )
    observations = provider.fetch()
    rows = {item.field: item for item in observations}

    assert rows["margin_balance"].value == 550
    assert rows["margin_change"].value == 50
    assert rows["short_balance"].value == 70
    assert rows["short_change"].value == 20
    assert rows["margin_usage_percent"].value == 27.5


def test_market_margin_context_aggregates_without_buy_sell_signal():
    provider = TWSEMarginProvider(
        FixtureTransport({TWSEMarginProvider.URL: "twse_margin.json"})
    )
    result = build_margin_short_context(provider.fetch(), venue="TWSE")

    assert result.observed_at == "2026-09-18"
    assert result.margin_balance == 3050
    assert result.margin_change == 50
    assert result.short_balance == 320
    assert result.short_change == 20
    assert result.margin_short_ratio_percent == 320 / 3050 * 100
    assert result.state == LeverageContextState.TWO_WAY_LEVERAGE_BUILD
    assert result.coverage_ratio == 1.0
    assert all(item.source for item in result.evidence)


def test_missing_short_change_degrades_coverage_and_state():
    provider = TWSEMarginProvider(
        FixtureTransport({TWSEMarginProvider.URL: "twse_margin.json"})
    )
    observations = tuple(
        item
        for item in provider.fetch()
        if item.field != "short_change"
    )
    result = build_margin_short_context(observations, venue="TWSE")

    assert result.short_change is None
    assert result.coverage_ratio == 0.75
    assert result.state == LeverageContextState.INSUFFICIENT_DATA


def test_margin_intelligence_has_no_provider_dependency():
    source = (
        ROOT / "research" / "tw" / "intelligence" / "margin_short.py"
    ).read_text(encoding="utf-8")
    assert "providers." not in source
    assert "urllib" not in source
    assert "requests" not in source


def test_twse_rwd_margin_uses_official_positional_layout():
    day = "2026-09-18"
    url = TWSEMarginProvider.url_for_date(day)
    provider = TWSEMarginProvider(
        FixtureTransport({url: "twse_margin_rwd.json"})
    )

    observations = provider.fetch(day)
    rows = {
        (item.instrument_id, item.field): item
        for item in observations
    }

    assert rows[("twse:2330", "margin_balance")].value == 1100
    assert rows[("twse:2330", "margin_previous_balance")].value == 1000
    assert rows[("twse:2330", "margin_change")].value == 100
    assert rows[("twse:2330", "short_balance")].value == 90
    assert rows[("twse:2330", "short_previous_balance")].value == 100
    assert rows[("twse:2330", "short_change")].value == -10
    assert rows[("twse:2330", "margin_balance")].observed_at == day
    assert rows[("twse:2330", "margin_balance")].source == "TWSE:MI_MARGN_RWD"
