from __future__ import annotations

from collections.abc import Sequence

from ..contracts import Availability, Instrument, Observation
from .http import JsonTransport, ProviderError, UrllibJsonTransport
from .parsing import clean_text, parse_decimal, parse_int, parse_roc_date


class TPExProvider:
    BASE_URL = "https://www.tpex.org.tw/openapi/v1"
    QUOTES_URL = BASE_URL + "/tpex_mainboard_daily_close_quotes"
    COMPANY_URL = BASE_URL + "/mopsfin_t187ap03_O"

    def __init__(self, transport: JsonTransport | None = None) -> None:
        self.transport = transport or UrllibJsonTransport()

    @property
    def source_name(self) -> str:
        return "TPEx"

    def _rows(self, url: str) -> list[dict]:
        payload = self.transport.get_json(url)
        if not isinstance(payload, list):
            raise ProviderError(f"TPEx payload is not a list: {url}")
        return [row for row in payload if isinstance(row, dict)]

    def list_instruments(self) -> Sequence[Instrument]:
        instruments: list[Instrument] = []
        for row in self._rows(self.COMPANY_URL):
            symbol = clean_text(row.get("SecuritiesCompanyCode"))
            if not symbol:
                continue
            name = (
                clean_text(row.get("CompanyAbbreviation"))
                or clean_text(row.get("CompanyName"))
            )
            instruments.append(
                Instrument(
                    instrument_id=f"tpex:{symbol}",
                    symbol=symbol,
                    name=name,
                    venue="TPEX",
                    sector=clean_text(row.get("SecuritiesIndustryCode")) or None,
                )
            )
        return instruments

    def _quote_observations(self, row: dict) -> tuple[Observation, ...]:
        symbol = clean_text(row.get("SecuritiesCompanyCode"))
        observed_at = parse_roc_date(row.get("Date"))
        instrument_id = f"tpex:{symbol}"
        source = "TPEx:tpex_mainboard_daily_close_quotes"

        fields = (
            ("open", parse_decimal(row.get("Open"))),
            ("high", parse_decimal(row.get("High"))),
            ("low", parse_decimal(row.get("Low"))),
            ("close", parse_decimal(row.get("Close"))),
            ("change", parse_decimal(row.get("Change"))),
            ("trade_volume", parse_int(row.get("TradingShares"))),
            ("trade_value", parse_int(row.get("TransactionAmount"))),
            ("transaction_count", parse_int(row.get("TransactionNumber"))),
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
                metadata={"venue": "TPEX", "symbol": symbol},
            )
            for field, value in fields
        )

    def fetch_market_observations(self) -> Sequence[Observation]:
        # P1.3 OTC index normalization is intentionally a separate slice.
        return ()

    def fetch_instrument_observations(
        self,
        instrument_id: str,
    ) -> Sequence[Observation]:
        prefix = "tpex:"
        if not instrument_id.startswith(prefix):
            return ()
        symbol = instrument_id[len(prefix):]
        for row in self._rows(self.QUOTES_URL):
            if clean_text(row.get("SecuritiesCompanyCode")) == symbol:
                return self._quote_observations(row)
        return ()
