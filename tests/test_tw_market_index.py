from __future__ import annotations

import json
from pathlib import Path

from research.tw.contracts import Availability
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


def test_twse_market_index_uses_latest_dated_row():
    provider = TWSEProvider(
        FixtureTransport({TWSEProvider.INDEX_URL: "twse_fmtqik.json"})
    )
    rows = provider.fetch_market_observations()
    by_field = {item.field: item for item in rows}

    assert by_field["index_close"].instrument_id == "twse:TAIEX"
    assert by_field["index_close"].value == 47180.75
    assert by_field["index_change"].value == 892.75
    assert by_field["trade_volume"].value == 12052158761
    assert by_field["index_close"].observed_at == "2026-09-18"
    assert by_field["index_close"].availability == Availability.AVAILABLE


def test_tpex_market_index_aliases_normalize_to_canonical_fields():
    provider = TPExProvider(
        FixtureTransport(
            {TPExProvider.INDEX_URL: "tpex_daily_trading_index.json"}
        )
    )
    rows = provider.fetch_market_observations()
    by_field = {item.field: item for item in rows}

    assert by_field["index_close"].instrument_id == "tpex:OTC"
    assert by_field["index_close"].value == 300.25
    assert by_field["index_change"].value == 2.15
    assert by_field["trade_value"].value == 85000000000
    assert by_field["index_close"].observed_at == "2026-09-18"
