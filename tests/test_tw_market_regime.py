from __future__ import annotations

from pathlib import Path

from research.tw.intelligence.institutional_flow import (
    InstitutionalFlowSnapshot,
    InstitutionalGroupFlow,
)
from research.tw.intelligence.margin_short import (
    LeverageContextState,
    MarginShortContext,
)
from research.tw.intelligence.market_regime import (
    MarketRegimeState,
    build_market_regime,
)
from research.tw.intelligence.market_structure import (
    IndexContext,
    MarketBreadth,
    MarketStructureSnapshot,
    MarketTurnover,
)
from research.tw.intelligence.sector_rotation import (
    SectorRotationRow,
    SectorRotationSnapshot,
)


ROOT = Path(__file__).resolve().parents[1]
DAY = "2026-09-18"


def _structure(index_change_percent=1.0, breadth=0.5):
    return MarketStructureSnapshot(
        venue="TWSE",
        observed_at=DAY,
        breadth=MarketBreadth(
            venue="TWSE",
            observed_at=DAY,
            advancers=700,
            decliners=300,
            unchanged=0,
            unavailable=0,
            total=1000,
            coverage_ratio=1.0,
            advance_decline_ratio=700 / 300,
            net_breadth_ratio=breadth,
            evidence=(),
        ),
        turnover=MarketTurnover(
            venue="TWSE",
            observed_at=DAY,
            trade_value=100,
            trade_volume=100,
            transaction_count=100,
            coverage_ratio=1.0,
            evidence=(),
        ),
        index=IndexContext(
            venue="TWSE",
            instrument_id="twse:TAIEX",
            observed_at=DAY,
            index_close=100.0,
            index_change=1.0,
            index_change_percent=index_change_percent,
            coverage_ratio=1.0,
            evidence=(),
        ),
        coverage_ratio=1.0,
    )


def _institutional(foreign_net=100):
    groups = (
        InstitutionalGroupFlow(
            group="foreign",
            buy_amount=200,
            sell_amount=100,
            net_amount=foreign_net,
            component_count=1,
            coverage_ratio=1.0,
            evidence=(),
        ),
        InstitutionalGroupFlow(
            group="investment_trust",
            buy_amount=10,
            sell_amount=8,
            net_amount=2,
            component_count=1,
            coverage_ratio=1.0,
            evidence=(),
        ),
        InstitutionalGroupFlow(
            group="dealer",
            buy_amount=10,
            sell_amount=12,
            net_amount=-2,
            component_count=1,
            coverage_ratio=1.0,
            evidence=(),
        ),
        InstitutionalGroupFlow(
            group="total",
            buy_amount=220,
            sell_amount=120,
            net_amount=100,
            component_count=1,
            coverage_ratio=1.0,
            evidence=(),
        ),
    )
    return InstitutionalFlowSnapshot(
        venue="TWSE",
        observed_at=DAY,
        groups=groups,
        coverage_ratio=1.0,
    )


def _leverage(day=DAY):
    return MarginShortContext(
        venue="TWSE",
        observed_at=day,
        margin_balance=1000,
        margin_change=50,
        short_balance=100,
        short_change=-10,
        margin_short_ratio_percent=10.0,
        instrument_count=100,
        coverage_ratio=1.0,
        state=LeverageContextState.LONG_LEVERAGE_BUILD,
        evidence=(),
    )


def _sectors(returns=(1.0, 2.0, -1.0), day=DAY):
    rows = tuple(
        SectorRotationRow(
            venue="TWSE",
            sector_id=str(index),
            observed_at=day,
            instrument_count=10,
            observed_count=10,
            advancers=7 if value > 0 else 3,
            decliners=3 if value > 0 else 7,
            unchanged=0,
            breadth_ratio=0.4 if value > 0 else -0.4,
            weighted_return_percent=value,
            trade_value=100,
            turnover_share_percent=100 / len(returns),
            coverage_ratio=1.0,
            evidence=(),
        )
        for index, value in enumerate(returns, start=1)
    )
    return SectorRotationSnapshot(
        venue="TWSE",
        observed_at=day,
        sectors=rows,
        leaders=("2",),
        laggards=("3",),
        coverage_ratio=1.0,
    )


def test_broad_positive_requires_breadth_and_sector_confirmation():
    result = build_market_regime(
        structure=_structure(index_change_percent=1.0, breadth=0.5),
        institutional=_institutional(foreign_net=100),
        leverage=_leverage(),
        sectors=_sectors((1.0, 2.0, -1.0)),
    )

    assert result.state == MarketRegimeState.BROAD_POSITIVE
    assert result.directional_score == 4
    assert result.positive_sector_ratio == 2 / 3
    assert result.execution_allowed is False


def test_narrow_positive_when_direction_is_positive_without_broad_confirmation():
    result = build_market_regime(
        structure=_structure(index_change_percent=1.0, breadth=0.0),
        institutional=_institutional(foreign_net=100),
        leverage=_leverage(),
        sectors=_sectors((1.0, -1.0)),
    )

    assert result.state == MarketRegimeState.NARROW_POSITIVE
    assert result.directional_score == 2


def test_broad_negative_state():
    result = build_market_regime(
        structure=_structure(index_change_percent=-1.0, breadth=-0.5),
        institutional=_institutional(foreign_net=-100),
        leverage=_leverage(),
        sectors=_sectors((-1.0, -2.0, 1.0)),
    )

    assert result.state == MarketRegimeState.BROAD_NEGATIVE
    assert result.directional_score == -4


def test_mismatched_dates_fail_closed():
    result = build_market_regime(
        structure=_structure(),
        institutional=_institutional(),
        leverage=_leverage(day="2026-09-17"),
        sectors=_sectors(),
    )

    assert result.state == MarketRegimeState.INSUFFICIENT_DATA
    assert result.directional_score is None


def test_missing_foreign_flow_fails_closed():
    institutional = _institutional()
    groups = tuple(
        item
        for item in institutional.groups
        if item.group != "foreign"
    )
    institutional = InstitutionalFlowSnapshot(
        venue="TWSE",
        observed_at=DAY,
        groups=groups,
        coverage_ratio=0.75,
    )

    result = build_market_regime(
        structure=_structure(),
        institutional=institutional,
        leverage=_leverage(),
        sectors=_sectors(),
    )

    assert result.state == MarketRegimeState.INSUFFICIENT_DATA


def test_regime_fusion_has_no_provider_or_execution_dependency():
    source = (
        ROOT / "research" / "tw" / "intelligence" / "market_regime.py"
    ).read_text(encoding="utf-8")

    assert "providers." not in source
    assert "execution" not in source.lower()
    assert "urllib" not in source
    assert "requests" not in source
