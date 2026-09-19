from __future__ import annotations

from collections.abc import Sequence

from ..contracts import Availability, Instrument, Observation
from .http import JsonTransport, ProviderError, UrllibJsonTransport
from .parsing import (\n    clean_text,\n    derive_change_percent,\n    parse_decimal,\n    parse_int,\n    parse_roc_date,\n)


class TWSEProvider:
    BASE_URL = "https://openapi.twse.com.tw/v1"
    QUOTES_URL = BASE_URL + "/exchangeReport/STOCK_DAY_ALL"
    INDEX_URL = BASE_URL + "/exchangeReport/FMTQIK"
    COMPANY_URL = BASE_URL + "/opendata/t187ap03_L"

    def __init__(self, transport: JsonTransport | None = None) -> None:
        self.transport = transport or UrllibJsonTransport()

    @property
    def source_name(self) -> str:
        return "TWSE"

    def _rows(self, url: str) -> list[dict]:
        payload = self.transport.get_json(url)
        if not isinstance(payload, list):
            raise ProviderError(f"TWSE payload is not a list: {url}")
        return [row for row in payload if isinstance(row, dict)]

    def list_instruments(self) -> Sequence[Instrument]:
        instruments: list[Instrument] = []
        for row in self._rows(self.COMPANY_URL):
            symbol = clean_text(row.get("公司代號"))
            if not symbol:
                continue
            name = clean_text(row.get("公司簡稱")) or clean_text(row.get("公司名稱"))
            instruments.append(
                Instrument(
                    instrument_id=f"twse:{symbol}",
                    symbol=symbol,
                    name=name,
                    venue="TWSE",
                    sector=clean_text(row.get("產業別")) or None,
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
        symbol = clean_text(row.get("Code"))
        observed_at = parse_roc_date(row.get("Date"))
        instrument_id = f"twse:{symbol}"
        source = "TWSE:STOCK_DAY_ALL"

        close = parse_decimal(row.get("ClosingPrice"))
        change = parse_decimal(row.get("Change"))
        fields = (
            ("open", parse_decimal(row.get("OpeningPrice"))),
            ("high", parse_decimal(row.get("HighestPrice"))),
            ("low", parse_decimal(row.get("LowestPrice"))),
            ("close", close),
            ("change", change),
            ("change_percent", derive_change_percent(close, change)),
            ("trade_volume", parse_int(row.get("TradeVolume"))),
            ("trade_value", parse_int(row.get("TradeValue"))),
            ("transaction_count", parse_int(row.get("Transaction"))),
        )
        return tuple(
            Observation(
                instrument_id=instrument_id,
                field=field,
                value=value,
                source=source,
                observed_at=observed_at,
                availability=self._availability(value, observed_at),
                metadata={"venue": "TWSE", "symbol": symbol},
            )
            for field, value in fields
        )

    def _index_observations(self, row: dict) -> tuple[Observation, ...]:
        observed_at = parse_roc_date(row.get("Date"))
        source = "TWSE:FMTQIK"
        fields = (
            ("index_close", parse_decimal(row.get("TAIEX"))),
            ("index_change", parse_decimal(row.get("Change"))),
            ("trade_volume", parse_int(row.get("TradeVolume"))),
            ("trade_value", parse_int(row.get("TradeValue"))),
            ("transaction_count", parse_int(row.get("Transaction"))),
        )
        return tuple(
            Observation(
                instrument_id="twse:TAIEX",
                field=field,
                value=value,
                source=source,
                observed_at=observed_at,
                availability=self._availability(value, observed_at),
                metadata={"venue": "TWSE", "symbol": "TAIEX"},
            )
            for field, value in fields
        )

    def fetch_market_observations(self) -> Sequence[Observation]:
        rows = self._rows(self.INDEX_URL)
        dated = [
            (parse_roc_date(row.get("Date")), row)
            for row in rows
            if parse_roc_date(row.get("Date")) is not None
        ]
        if not dated:
            return ()
        _, latest = max(dated, key=lambda item: item[0])
        return self._index_observations(latest)

    def fetch_all_instrument_observations(self) -> Sequence[Observation]:
        observations: list[Observation] = []
        for row in self._rows(self.QUOTES_URL):
            if not clean_text(row.get("Code")):
                continue
            observations.extend(self._quote_observations(row))
        return tuple(observations)

    def fetch_instrument_observations(
        self,
        instrument_id: str,
    ) -> Sequence[Observation]:
        prefix = "twse:"
        if not instrument_id.startswith(prefix):
            return ()
        symbol = instrument_id[len(prefix):]
        for row in self._rows(self.QUOTES_URL):
            if clean_text(row.get("Code")) == symbol:
                return self._quote_observations(row)
        return ()
