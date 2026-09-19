from __future__ import annotations

import json
from pathlib import Path

from research.tw.intelligence.institutional_flow import build_institutional_flow
from research.tw.providers.institutional import (
    TPExInstitutionalSummaryProvider,
    TWSEInstitutionalSummaryProvider,
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


def test_twse_bfi82u_normalizes_and_aggregates_components():
    date = "2026-09-18"
    url = TWSEInstitutionalSummaryProvider.url_for_date(date)
    provider = TWSEInstitutionalSummaryProvider(
        FixtureTransport({url: "twse_bfi82u.json"})
    )
    observations = provider.fetch(date)
    snapshot = build_institutional_flow(observations, venue="TWSE")

    foreign = snapshot.by_group("foreign")
    dealer = snapshot.by_group("dealer")
    trust = snapshot.by_group("investment_trust")
    total = snapshot.by_group("total")

    assert snapshot.observed_at == date
    assert foreign is not None and foreign.net_amount == 11
    assert foreign.component_count == 2
    assert dealer is not None and dealer.net_amount == -3
    assert dealer.component_count == 2
    assert trust is not None and trust.net_amount == 10
    assert total is not None and total.net_amount == 18
    assert snapshot.coverage_ratio == 1.0
    assert all(item.source for item in foreign.evidence)


def test_tpex_summary_normalizes_to_same_canonical_groups():
    provider = TPExInstitutionalSummaryProvider(
        FixtureTransport(
            {
                TPExInstitutionalSummaryProvider.URL:
                    "tpex_3insti_summary.json"
            }
        )
    )
    observations = provider.fetch()
    snapshot = build_institutional_flow(observations, venue="TPEX")

    assert snapshot.observed_at == "2026-09-18"
    assert snapshot.by_group("foreign").net_amount == -10
    assert snapshot.by_group("investment_trust").net_amount == 8
    assert snapshot.by_group("dealer").net_amount == -3
    assert snapshot.by_group("total").net_amount == -5
    assert snapshot.coverage_ratio == 1.0


def test_missing_group_degrades_coverage_instead_of_fabricating_zero():
    provider = TPExInstitutionalSummaryProvider(
        FixtureTransport(
            {
                TPExInstitutionalSummaryProvider.URL:
                    "tpex_3insti_summary.json"
            }
        )
    )
    observations = tuple(
        item
        for item in provider.fetch()
        if item.metadata.get("investor_group") != "dealer"
    )
    snapshot = build_institutional_flow(observations, venue="TPEX")
    dealer = snapshot.by_group("dealer")

    assert dealer is not None
    assert dealer.net_amount is None
    assert dealer.coverage_ratio == 0.0
    assert snapshot.coverage_ratio == 0.75
