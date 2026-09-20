from __future__ import annotations

from dataclasses import replace
from datetime import date, timedelta
import json
from pathlib import Path

import pytest

from research.tw.history import HistoricalBar
from research.tw.providers.historical import (
    TPExHistoricalProvider,
    TWSEHistoricalProvider,
)
from research.tw.services.historical_window import (
    HistoricalIntegrityError,
    build_historical_window,
)


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests" / "fixtures" / "tw"


class FixtureTransport:
    def __init__(self, mapping: dict[str, str]) -> None:
        self.mapping = mapping

    def get_json(self, url: str):
        return json.loads(
            (FIXTURES / self.mapping[url]).read_text(encoding="utf-8")
        )


def test_twse_historical_month_normalizes_official_daily_rows():
    month = date(2026, 9, 1)
    url = TWSEHistoricalProvider.url_for_month("2330", month)
    provider = TWSEHistoricalProvider(
        FixtureTransport({url: "twse_stock_day_2330_202609.json"})
    )

    bars = provider.fetch_month("2330", month)

    assert len(bars) == 3
    assert bars[-1].instrument_id == "twse:2330"
    assert bars[-1].session_date == "2026-09-18"
    assert bars[-1].close == 1255.0
    assert bars[-1].volume == 12345
    assert bars[-1].turnover == 15492975
    assert bars[-1].source == "TWSE:STOCK_DAY"
    assert bars[-1].price_mode == "raw_unadjusted"


def test_tpex_historical_month_normalizes_thousand_units():
    month = date(2026, 9, 1)
    url = TPExHistoricalProvider.url_for_month("6488", month)
    provider = TPExHistoricalProvider(
        FixtureTransport({url: "tpex_trading_stock_6488_202609.json"})
    )

    bars = provider.fetch_month("6488", month)

    assert len(bars) == 3
    assert bars[-1].instrument_id == "tpex:6488"
    assert bars[-1].session_date == "2026-09-18"
    assert bars[-1].close == 380.5
    assert bars[-1].volume == 1234000
    assert bars[-1].turnover == 469538000
    assert bars[-1].source == "TPEx:tradingStock"


def _synthetic_bars(count: int = 260) -> tuple[HistoricalBar, ...]:
    start = date(2025, 1, 1)
    bars = []
    for index in range(count):
        session = start + timedelta(days=index)
        price = 100.0 + index
        bars.append(
            HistoricalBar(
                instrument_id="twse:2330",
                venue="TWSE",
                session_date=session.isoformat(),
                open=price,
                high=price + 1,
                low=price - 1,
                close=price + 0.5,
                volume=1000 + index,
                turnover=1000000 + index,
                transactions=100 + index,
                change=0.5,
                source="TWSE:fixture",
            )
        )
    return tuple(bars)


@pytest.mark.parametrize("sessions", [20, 60, 120, 250])
def test_historical_window_supports_research_session_sizes(sessions):
    bars = _synthetic_bars(260)
    end_date = bars[-1].session_date

    window = build_historical_window(
        bars,
        instrument_id="twse:2330",
        venue="TWSE",
        end_date=end_date,
        sessions=sessions,
    )

    assert len(window.bars) == sessions
    assert window.requested_sessions == sessions
    assert window.sufficient_history is True
    assert window.coverage_ratio == 1.0
    assert window.last_session == end_date
    assert window.lookahead_blocked is True
    assert window.corporate_action_adjusted is False
    assert window.price_mode == "raw_unadjusted"


def test_historical_window_blocks_future_bars():
    bars = _synthetic_bars(30)
    cutoff = bars[-2].session_date

    window = build_historical_window(
        bars,
        instrument_id="twse:2330",
        venue="TWSE",
        end_date=cutoff,
        sessions=30,
    )

    assert window.last_session == cutoff
    assert all(bar.session_date <= cutoff for bar in window.bars)
    assert window.sufficient_history is False
    assert window.coverage_ratio == 29 / 30


def test_conflicting_duplicate_session_fails_closed():
    bars = list(_synthetic_bars(5))
    bars.append(replace(bars[-1], close=9999.0))

    with pytest.raises(HistoricalIntegrityError, match="conflicting duplicate"):
        build_historical_window(
            bars,
            instrument_id="twse:2330",
            venue="TWSE",
            end_date=bars[-1].session_date,
            sessions=5,
        )


def test_historical_service_has_no_provider_or_execution_dependency():
    source = (
        ROOT
        / "research"
        / "tw"
        / "services"
        / "historical_window.py"
    ).read_text(encoding="utf-8")

    assert "providers." not in source
    assert "foxyya.execution" not in source
    assert "urllib" not in source
    assert "requests" not in source
