from __future__ import annotations

from collections.abc import Sequence

from ..contracts import Availability, Instrument, Observation
from .http import JsonTransport, ProviderError, UrllibJsonTransport
from .parsing import clean_text, parse_decimal, parse_int, parse_roc_date


def _first(row: dict, *keys: str):
    for key in keys:
        if key in row and clean_text(row.get(key)):
            return row.get(key)
    return None


class TPExProvider:
    BASE_URL = "https://www.tpex.org.tw/openapi/v1"
    QUOTES_URL = BASE_URL + "/tpex_mainboard_daily_close_quotes"
    INDEX_URL = BASE_URL + "/tpex_daily_trading_index"
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

    @staticmethod
    def _availability(value: object, observed_at: str | None) -> Availability:
        return (
            Availability.AVAILABLE
            if value is not None and observed_at is not None
            else Availability.UNAVAILABLE
        )

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
                availability=self._availability(value, observed_at),
                metadata={"venue": "TPEX", "symbol": symbol},
            )
            for field, value in fields
        )

    def _index_observations(self, row: dict) -> tuple[Observation, ...]:
        # TPEx public OpenAPI field labels have changed across dataset
        # generations. Keep acquisition isolated and normalize known aliases.
        # Production-live schema verification remains a P1 exit-gate item.
        observed_at = parse_roc_date(
            _first(row, "Date", "TradeDate", "資料日期", "交易日期")
        )
        source = "TPEx:tpex_daily_trading_index"
        fields = (
            (
                "index_close",
                parse_decimal(
                    _first(
                        row,
                        "Index",
                        "Close",
                        "OTCIndex",
                        "櫃買指數",
                    )
                ),
            ),
            (
                "index_change",
                parse_decimal(_first(row, "Change", "漲跌")),
            ),
            (
                "trade_volume",
                parse_int(
                    _first(
                        row,
                        "TradeVolume",
                        "TradingShares",
                        "成交股數",
                    )
                ),
            ),
            (
                "trade_value",
                parse_int(
                    _first(
                        row,
                        "TradeValue",
                        "TransactionAmount",
                        "成交金額",
                    )
                ),
            ),
            (
                "transaction_count",
                parse_int(
                    _first(
                        row,
                        "Transaction",
                        "TransactionNumber",
                        "筆數",
                    )
                ),
            ),
        )
        return tuple(
            Observation(
                instrument_id="tpex:OTC",
                field=field,
                value=value,
                source=source,
                observed_at=observed_at,
                availability=self._availability(value, observed_at),
                metadata={"venue": "TPEX", "symbol": "OTC"},
            )
            for field, value in fields
        )

    def fetch_market_observations(self) -> Sequence[Observation]:
        rows = self._rows(self.INDEX_URL)
        dated = [
            (
                parse_roc_date(
                    _first(row, "Date", "TradeDate", "資料日期", "交易日期")
                ),
                row,
            )
            for row in rows
        ]
        dated = [item for item in dated if item[0] is not None]
        if not dated:
            return ()
        _, latest = max(dated, key=lambda item: item[0])
        return self._index_observations(latest)

    def fetch_all_instrument_observations(self) -> Sequence[Observation]:
        observations: list[Observation] = []
        for row in self._rows(self.QUOTES_URL):
            if not clean_text(row.get("SecuritiesCompanyCode")):
                continue
            observations.extend(self._quote_observations(row))
        return tuple(observations)

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
