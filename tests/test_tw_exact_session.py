from __future__ import annotations

import json
from pathlib import Path

import pytest

from research.tw.contracts import Availability
from research.tw.providers.http import ProviderError
from research.tw.providers.session import TWSEExactSessionProvider


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests" / "fixtures" / "tw"


class FixtureTransport:
    def __init__(self, mapping: dict[str, str]) -> None:
        self.mapping = mapping

    def get_json(self, url: str):
        return json.loads(
            (FIXTURES / self.mapping[url]).read_text(encoding="utf-8")
        )


def _provider():
    day = "2026-09-22"
    return TWSEExactSessionProvider(
        FixtureTransport(
            {
                TWSEExactSessionProvider.quotes_url_for_date(day):
                    "twse_mi_index_20260922.json",
                TWSEExactSessionProvider.index_url_for_date(day):
                    "twse_fmtqik_20260922.json",
            }
        )
    )


def test_exact_twse_quotes_prove_requested_date_and_signed_change():
    rows = _provider().fetch_quotes("2026-09-22")
    by_key = {(item.instrument_id, item.field): item for item in rows}

    assert by_key[("twse:2330", "close")].value == 1260.0
    assert by_key[("twse:2330", "change")].value == 5.0
    assert by_key[("twse:2317", "change")].value == -1.0
    assert by_key[("twse:2330", "close")].observed_at == "2026-09-22"
    assert by_key[("twse:2330", "close")].source == "TWSE:MI_INDEX_RWD"
    assert by_key[("twse:2330", "close")].availability == Availability.AVAILABLE


def test_exact_twse_market_selects_only_requested_fmtqik_row():
    rows = _provider().fetch_market("2026-09-22")
    by_field = {item.field: item for item in rows}

    assert by_field["index_close"].value == 47800.17
    assert by_field["index_change"].value == 300.17
    assert by_field["trade_value"].value == 950000000000
    assert by_field["index_close"].observed_at == "2026-09-22"
    assert by_field["index_close"].source == "TWSE:FMTQIK_RWD"


def test_exact_twse_quote_date_mismatch_fails_closed():
    day = "2026-09-22"
    payload = json.loads(
        (FIXTURES / "twse_mi_index_20260922.json").read_text(encoding="utf-8")
    )
    payload["date"] = "20260921"

    class WrongDateTransport:
        def get_json(self, url: str):
            return payload

    provider = TWSEExactSessionProvider(WrongDateTransport())
    with pytest.raises(ProviderError, match="date mismatch"):
        provider.fetch_quotes(day)


def test_exact_twse_market_missing_requested_row_fails_closed():
    day = "2026-09-22"
    payload = json.loads(
        (FIXTURES / "twse_fmtqik_20260922.json").read_text(encoding="utf-8")
    )
    payload["data"] = payload["data"][:1]

    class MissingRowTransport:
        def get_json(self, url: str):
            return payload

    provider = TWSEExactSessionProvider(MissingRowTransport())
    with pytest.raises(ProviderError, match="no row"):
        provider.fetch_market(day)
