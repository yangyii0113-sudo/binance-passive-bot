from __future__ import annotations

import json
from pathlib import Path

import pytest

from research.tw.contracts import Availability, Observation
from research.tw.intelligence.market_regime import (
    MarketRegimeSnapshot,
    MarketRegimeState,
)
from research.tw.intelligence.margin_short import LeverageContextState
from research.tw.providers.twse import TWSEProvider
from research.tw.services.stock_workspace import (
    StockWorkspaceSnapshot,
    build_stock_workspace,
)


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests" / "fixtures" / "tw"


class FixtureTransport:
    def get_json(self, url: str):
        path = FIXTURES / "twse_stock_day_all.json"
        return json.loads(path.read_text(encoding="utf-8"))


def _regime(day: str = "2026-09-18"):
    return MarketRegimeSnapshot(
        venue="TWSE",
        observed_at=day,
        state=MarketRegimeState.BROAD_POSITIVE,
        directional_score=4,
        confidence=0.95,
        positive_sector_ratio=0.7,
        leverage_state=LeverageContextState.LONG_LEVERAGE_BUILD,
        components=(),
        execution_allowed=False,
    )


def _instrument():
    return next(
        item
        for item in (
            __import__(
                "research.tw.contracts",
                fromlist=["Instrument"],
            ).Instrument(
                instrument_id="twse:2330",
                symbol="2330",
                name="台積電",
                venue="TWSE",
                sector="24",
            ),
        )
    )


def test_stock_workspace_builds_latest_canonical_quote():
    provider = TWSEProvider(FixtureTransport())
    workspace = build_stock_workspace(
        instrument=_instrument(),
        observations=tuple(provider.fetch_all_instrument_observations()),
        market_regime=_regime(),
    )

    assert workspace.observed_at == "2026-09-18"
    assert workspace.quote.close == 1255.0
    assert workspace.quote.change == 15.0
    assert workspace.quote.change_percent is not None
    assert workspace.quote.trade_volume == 12345678
    assert workspace.quote.coverage_ratio == 1.0
    assert workspace.market_regime_state == MarketRegimeState.BROAD_POSITIVE
    assert workspace.market_regime_confidence == 0.95
    assert workspace.execution_allowed is False
    assert workspace.quote.evidence


def test_missing_quote_field_degrades_coverage_without_fabricating_value():
    provider = TWSEProvider(FixtureTransport())
    observations = tuple(
        item
        for item in provider.fetch_all_instrument_observations()
        if not (
            item.instrument_id == "twse:2330"
            and item.field == "high"
        )
    )
    workspace = build_stock_workspace(
        instrument=_instrument(),
        observations=observations,
        market_regime=_regime(),
    )

    assert workspace.quote.high is None
    assert workspace.quote.coverage_ratio == 8 / 9


def test_mismatched_regime_date_is_not_attached():
    provider = TWSEProvider(FixtureTransport())
    workspace = build_stock_workspace(
        instrument=_instrument(),
        observations=tuple(provider.fetch_all_instrument_observations()),
        market_regime=_regime(day="2026-09-17"),
    )

    assert workspace.market_regime_state is None
    assert workspace.market_regime_confidence is None


def test_workspace_cannot_authorize_execution():
    provider = TWSEProvider(FixtureTransport())
    workspace = build_stock_workspace(
        instrument=_instrument(),
        observations=tuple(provider.fetch_all_instrument_observations()),
    )

    with pytest.raises(ValueError):
        StockWorkspaceSnapshot(
            instrument=workspace.instrument,
            observed_at=workspace.observed_at,
            quote=workspace.quote,
            market_regime_state=None,
            market_regime_confidence=None,
            execution_allowed=True,
        )


def test_stock_workspace_service_has_no_provider_dependency():
    source = (
        ROOT / "research" / "tw" / "services" / "stock_workspace.py"
    ).read_text(encoding="utf-8")

    assert "providers." not in source
    assert "urllib" not in source
    assert "requests" not in source
