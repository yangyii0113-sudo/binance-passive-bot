from __future__ import annotations

from collections.abc import Sequence
from datetime import date
from urllib.parse import urlencode

from ..contracts import Availability, Observation
from ..fields import (
    INSTITUTIONAL_BUY_AMOUNT,
    INSTITUTIONAL_NET_AMOUNT,
    INSTITUTIONAL_SELL_AMOUNT,
)
from .http import JsonTransport, ProviderError, UrllibJsonTransport
from .parsing import clean_text, parse_int, parse_roc_date


def _canonical_group(name: str) -> str:
    text = clean_text(name)
    lowered = text.lower()
    if "投信" in text or "investment trust" in lowered:
        return "investment_trust"
    # Foreign dealer rows contain the word 自營商 but belong to the
    # foreign-capital bucket in the TWSE BFI82U market summary.
    if "外資" in text or "陸資" in text or "foreign" in lowered:
        return "foreign"
    if "自營" in text or "dealer" in lowered:
        return "dealer"
    if "合計" in text or "total" in lowered:
        return "total"
    return "other"


def _observations(
    *,
    venue: str,
    source: str,
    observed_at: str | None,
    investor_name: str,
    buy: int | None,
    sell: int | None,
    net: int | None,
) -> tuple[Observation, ...]:
    group = _canonical_group(investor_name)
    instrument_id = f"{venue.lower()}:MARKET"
    values = (
        (INSTITUTIONAL_BUY_AMOUNT, buy),
        (INSTITUTIONAL_SELL_AMOUNT, sell),
        (INSTITUTIONAL_NET_AMOUNT, net),
    )
    return tuple(
        Observation(
            instrument_id=instrument_id,
            field=field,
            value=value,
            source=source,
            observed_at=observed_at,
            availability=(
                Availability.AVAILABLE
                if value is not None and observed_at is not None
                else Availability.UNAVAILABLE
            ),
            metadata={
                "venue": venue,
                "investor_name": investor_name,
                "investor_group": group,
            },
        )
        for field, value in values
    )


class TWSEInstitutionalSummaryProvider:
    BASE_URL = "https://www.twse.com.tw/rwd/zh/fund/BFI82U"

    def __init__(self, transport: JsonTransport | None = None) -> None:
        self.transport = transport or UrllibJsonTransport()

    @staticmethod
    def url_for_date(observed_date: str) -> str:
        iso = date.fromisoformat(observed_date)
        query = urlencode(
            {
                "response": "json",
                "dayDate": iso.strftime("%Y%m%d"),
                "type": "day",
            }
        )
        return f"{TWSEInstitutionalSummaryProvider.BASE_URL}?{query}"

    def fetch(self, observed_date: str) -> Sequence[Observation]:
        url = self.url_for_date(observed_date)
        payload = self.transport.get_json(url)
        if not isinstance(payload, dict):
            raise ProviderError("TWSE BFI82U payload is not an object")
        if payload.get("stat") != "OK":
            raise ProviderError(
                f"TWSE BFI82U unavailable for {observed_date}: "
                f"{payload.get('stat')!r}"
            )

        rows = payload.get("data")
        if not isinstance(rows, list):
            raise ProviderError("TWSE BFI82U data is not a list")

        result: list[Observation] = []
        for row in rows:
            if not isinstance(row, list) or len(row) < 4:
                continue
            investor_name = clean_text(row[0])
            if not investor_name:
                continue
            result.extend(
                _observations(
                    venue="TWSE",
                    source="TWSE:BFI82U",
                    observed_at=observed_date,
                    investor_name=investor_name,
                    buy=parse_int(row[1]),
                    sell=parse_int(row[2]),
                    net=parse_int(row[3]),
                )
            )
        return tuple(result)


class TPExInstitutionalSummaryProvider:
    URL = "https://www.tpex.org.tw/openapi/v1/tpex_3insti_summary"

    def __init__(self, transport: JsonTransport | None = None) -> None:
        self.transport = transport or UrllibJsonTransport()

    def fetch(self) -> Sequence[Observation]:
        payload = self.transport.get_json(self.URL)
        if not isinstance(payload, list):
            raise ProviderError("TPEx institutional summary payload is not a list")

        result: list[Observation] = []
        for row in payload:
            if not isinstance(row, dict):
                continue
            observed_at = parse_roc_date(row.get("Date"))
            investor_name = clean_text(row.get("Investor"))
            if not investor_name:
                continue
            result.extend(
                _observations(
                    venue="TPEX",
                    source="TPEx:tpex_3insti_summary",
                    observed_at=observed_at,
                    investor_name=investor_name,
                    buy=parse_int(row.get("PurchaseAmount")),
                    sell=parse_int(row.get("SaleAmount")),
                    net=parse_int(row.get("Net")),
                )
            )
        return tuple(result)
