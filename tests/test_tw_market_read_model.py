from __future__ import annotations

import json
from pathlib import Path

from research.tw.intelligence.institutional_flow import build_institutional_flow
from research.tw.intelligence.margin_short import build_margin_short_context
from research.tw.intelligence.market_regime import build_market_regime
from research.tw.intelligence.market_structure import build_market_structure
from research.tw.intelligence.sector_rotation import build_sector_rotation
from research.tw.providers.institutional import (
    TPExInstitutionalSummaryProvider,
    TWSEInstitutionalSummaryProvider,
)
from research.tw.providers.margin import TPExMarginProvider, TWSEMarginProvider
from research.tw.providers.tpex import TPExProvider
from research.tw.providers.twse import TWSEProvider
from research.tw.read_models import (
    MARKET_INTELLIGENCE_SCHEMA_VERSION,
    VenueIntelligenceBundle,
    market_intelligence_read_model,
)


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests" / "fixtures" / "tw"
DAY = "2026-09-18"


class FixtureTransport:
    def __init__(self, mapping: dict[str, str]) -> None:
        self.mapping = mapping

    def get_json(self, url: str):
        return json.loads(
            (FIXTURES / self.mapping[url]).read_text(encoding="utf-8")
        )


def _transport():
    twse_inst_url = TWSEInstitutionalSummaryProvider.url_for_date(DAY)
    return FixtureTransport(
        {
            TWSEProvider.QUOTES_URL: "twse_stock_day_all.json",
            TWSEProvider.INDEX_URL: "twse_fmtqik.json",
            TWSEProvider.COMPANY_URL: "twse_company_profiles.json",
            TPExProvider.QUOTES_URL: "tpex_mainboard_daily_close_quotes.json",
            TPExProvider.INDEX_URL: "tpex_daily_trading_index.json",
            TPExProvider.COMPANY_URL: "tpex_company_profiles.json",
            twse_inst_url: "twse_bfi82u.json",
            TPExInstitutionalSummaryProvider.URL:
                "tpex_3insti_summary.json",
            TWSEMarginProvider.URL: "twse_margin.json",
            TPExMarginProvider.URL: "tpex_margin.json",
        }
    )


def _bundle(venue: str, transport: FixtureTransport):
    if venue == "TWSE":
        provider = TWSEProvider(transport)
        instruments = tuple(provider.list_instruments())
        daily = tuple(provider.fetch_all_instrument_observations())
        market = tuple(provider.fetch_market_observations())
        institutional = build_institutional_flow(
            TWSEInstitutionalSummaryProvider(transport).fetch(DAY),
            venue="TWSE",
        )
        leverage = build_margin_short_context(
            TWSEMarginProvider(transport).fetch(),
            venue="TWSE",
        )
    else:
        provider = TPExProvider(transport)
        instruments = tuple(provider.list_instruments())
        daily = tuple(provider.fetch_all_instrument_observations())
        market = tuple(provider.fetch_market_observations())
        institutional = build_institutional_flow(
            TPExInstitutionalSummaryProvider(transport).fetch(),
            venue="TPEX",
        )
        leverage = build_margin_short_context(
            TPExMarginProvider(transport).fetch(),
            venue="TPEX",
        )

    structure = build_market_structure(
        daily + market,
        venue=venue,
        observed_at=DAY,
    )
    sectors = build_sector_rotation(
        daily,
        instruments,
        venue=venue,
        observed_at=DAY,
    )
    regime = build_market_regime(
        structure=structure,
        institutional=institutional,
        leverage=leverage,
        sectors=sectors,
    )
    return VenueIntelligenceBundle(
        structure=structure,
        institutional=institutional,
        leverage=leverage,
        sectors=sectors,
        regime=regime,
    )


def test_market_intelligence_read_model_is_json_serializable_and_stable():
    transport = _transport()
    payload = market_intelligence_read_model(
        twse=_bundle("TWSE", transport),
        tpex=_bundle("TPEX", transport),
    )

    encoded = json.dumps(payload, ensure_ascii=False)

    assert payload["schema_version"] == MARKET_INTELLIGENCE_SCHEMA_VERSION
    assert payload["market"] == "TW"
    assert payload["observed_at"] == DAY
    assert payload["execution_allowed"] is False
    assert set(payload["venues"]) == {"TWSE", "TPEX"}
    assert payload["quality"]["status"] in {"AVAILABLE", "PARTIAL"}

    twse = payload["venues"]["TWSE"]
    tpex = payload["venues"]["TPEX"]

    assert twse["market_structure"]["index"]["close"] is not None
    assert twse["institutional_flow"]["groups"]["foreign"]["net_amount"] is not None
    assert twse["leverage_context"]["margin_balance"] is not None
    assert twse["sector_rotation"]["sectors"]
    assert twse["market_regime"]["state"] != "insufficient_data"
    assert twse["market_regime"]["execution_allowed"] is False

    assert tpex["market_structure"]["index"]["close"] is not None
    assert tpex["sector_rotation"]["sectors"]
    assert tpex["market_regime"]["state"] != "insufficient_data"

    # Provider-native field names must never leak into the stable UI contract.
    assert "OpeningPrice" not in encoded
    assert "SecuritiesCompanyCode" not in encoded
    assert "PurchaseAmount" not in encoded


def test_read_model_exposes_timestamp_coverage_and_provenance():
    transport = _transport()
    payload = market_intelligence_read_model(
        twse=_bundle("TWSE", transport),
        tpex=_bundle("TPEX", transport),
    )

    for venue in ("TWSE", "TPEX"):
        model = payload["venues"][venue]
        assert model["observed_at"] == DAY
        assert model["quality"]["coverage_ratio"] > 0
        assert model["market_structure"]["index"]["provenance"]
        assert model["institutional_flow"]["provenance"]
        assert model["leverage_context"]["provenance"]
        assert model["sector_rotation"]["provenance"]


def test_read_model_module_has_no_provider_dependency():
    source = (
        ROOT / "research" / "tw" / "read_models.py"
    ).read_text(encoding="utf-8")

    assert "providers." not in source
    assert "urllib" not in source
    assert "requests" not in source
