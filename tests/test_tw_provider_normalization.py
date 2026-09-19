from __future__ import annotations

import json
from pathlib import Path

from research.tw.contracts import Availability
from research.tw.providers.parsing import parse_decimal, parse_roc_date
from research.tw.providers.tpex import TPExProvider
from research.tw.providers.twse import TWSEProvider
from research.tw.registry import InstrumentRegistry


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests" / "fixtures" / "tw"


class FixtureTransport:
    def __init__(self, mapping: dict[str, str]) -> None:
        self.mapping = mapping

    def get_json(self, url: str):
        path = FIXTURES / self.mapping[url]
        return json.loads(path.read_text(encoding="utf-8"))


def _providers():
    mapping = {
        TWSEProvider.QUOTES_URL: "twse_stock_day_all.json",
        TWSEProvider.COMPANY_URL: "twse_company_profiles.json",
        TPExProvider.QUOTES_URL: "tpex_mainboard_daily_close_quotes.json",
        TPExProvider.COMPANY_URL: "tpex_company_profiles.json",
    }
    transport = FixtureTransport(mapping)
    return TWSEProvider(transport), TPExProvider(transport)


def test_roc_date_normalization():
    assert parse_roc_date("1150918") == "2026-09-18"
    assert parse_roc_date("115/09/18") == "2026-09-18"
    assert parse_roc_date("") is None


def test_numeric_normalization():
    assert parse_decimal("12,345.50") == 12345.5
    assert parse_decimal("--") is None


def test_twse_daily_quote_normalizes_to_canonical_observations():
    twse, _ = _providers()
    rows = twse.fetch_instrument_observations("twse:2330")
    by_field = {row.field: row for row in rows}

    assert by_field["close"].value == 1255.0
    assert by_field["trade_volume"].value == 12345678
    assert by_field["close"].observed_at == "2026-09-18"
    assert by_field["close"].source == "TWSE:STOCK_DAY_ALL"
    assert by_field["close"].availability == Availability.AVAILABLE


def test_tpex_daily_quote_normalizes_to_canonical_observations():
    _, tpex = _providers()
    rows = tpex.fetch_instrument_observations("tpex:6488")
    by_field = {row.field: row for row in rows}

    assert by_field["close"].value == 380.5
    assert by_field["change"].value == -3.5
    assert by_field["trade_volume"].value == 1234000
    assert by_field["close"].observed_at == "2026-09-18"
    assert by_field["close"].source == "TPEx:tpex_mainboard_daily_close_quotes"


def test_registry_merges_twse_and_tpex_without_collision():
    twse, tpex = _providers()
    registry = InstrumentRegistry((twse, tpex)).build()

    assert registry["twse:2330"].name == "台積電"
    assert registry["twse:2317"].venue == "TWSE"
    assert registry["tpex:6488"].name == "環球晶"
    assert registry["tpex:6488"].venue == "TPEX"
