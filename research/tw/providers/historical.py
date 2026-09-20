from __future__ import annotations

from collections.abc import Sequence
from datetime import date
from urllib.parse import urlencode

from ..history import HistoricalBar
from .http import JsonTransport, ProviderError, UrllibJsonTransport
from .parsing import clean_text, parse_decimal, parse_int, parse_roc_date


TWSE_HEADER_ALIASES = {
    "日期": "date",
    "成交股數": "volume",
    "成交金額": "turnover",
    "開盤價": "open",
    "最高價": "high",
    "最低價": "low",
    "收盤價": "close",
    "漲跌價差": "change",
    "成交筆數": "transactions",
}

TPEX_HEADER_ALIASES = {
    "日 期": "date",
    "成交張數": "volume",
    "成交仟元": "turnover",
    "開盤": "open",
    "最高": "high",
    "最低": "low",
    "收盤": "close",
    "漲跌": "change",
    "筆數": "transactions",
}

REQUIRED = {
    "date",
    "volume",
    "turnover",
    "open",
    "high",
    "low",
    "close",
    "change",
    "transactions",
}


def _month_starts(start_date: str, end_date: str) -> tuple[date, ...]:
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)
    if start > end:
        raise ValueError("start_date must not be after end_date")

    cursor = date(start.year, start.month, 1)
    final = date(end.year, end.month, 1)
    months: list[date] = []
    while cursor <= final:
        months.append(cursor)
        if cursor.month == 12:
            cursor = date(cursor.year + 1, 1, 1)
        else:
            cursor = date(cursor.year, cursor.month + 1, 1)
    return tuple(months)


def _index_map(fields: object, aliases: dict[str, str]) -> dict[str, int]:
    if not isinstance(fields, list):
        raise ProviderError("historical fields are missing")
    indexes: dict[str, int] = {}
    for index, raw in enumerate(fields):
        canonical = aliases.get(clean_text(raw))
        if canonical:
            indexes[canonical] = index
    missing = REQUIRED - set(indexes)
    if missing:
        raise ProviderError(
            "historical fields missing: " + ",".join(sorted(missing))
        )
    return indexes


def _cell(row: list, indexes: dict[str, int], key: str):
    index = indexes[key]
    return row[index] if index < len(row) else None


def _bar(
    *,
    row: list,
    indexes: dict[str, int],
    instrument_id: str,
    venue: str,
    source: str,
    tpex_units: bool,
) -> HistoricalBar | None:
    session_date = parse_roc_date(_cell(row, indexes, "date"))
    if session_date is None:
        return None

    volume = parse_int(_cell(row, indexes, "volume"))
    turnover = parse_int(_cell(row, indexes, "turnover"))
    if tpex_units:
        volume = volume * 1000 if volume is not None else None
        turnover = turnover * 1000 if turnover is not None else None

    return HistoricalBar(
        instrument_id=instrument_id,
        venue=venue,
        session_date=session_date,
        open=parse_decimal(_cell(row, indexes, "open")),
        high=parse_decimal(_cell(row, indexes, "high")),
        low=parse_decimal(_cell(row, indexes, "low")),
        close=parse_decimal(_cell(row, indexes, "close")),
        volume=volume,
        turnover=turnover,
        transactions=parse_int(_cell(row, indexes, "transactions")),
        change=parse_decimal(_cell(row, indexes, "change")),
        source=source,
        price_mode="raw_unadjusted",
    )


class TWSEHistoricalProvider:
    BASE_URL = "https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY"

    def __init__(self, transport: JsonTransport | None = None) -> None:
        self.transport = transport or UrllibJsonTransport()

    @classmethod
    def url_for_month(cls, symbol: str, month: date) -> str:
        query = urlencode(
            {
                "date": month.strftime("%Y%m01"),
                "stockNo": symbol,
                "response": "json",
            }
        )
        return f"{cls.BASE_URL}?{query}"

    def fetch_month(self, symbol: str, month: date) -> Sequence[HistoricalBar]:
        payload = self.transport.get_json(self.url_for_month(symbol, month))
        if not isinstance(payload, dict):
            raise ProviderError("TWSE STOCK_DAY payload is not an object")
        stat = clean_text(payload.get("stat"))
        if stat != "OK":
            if "沒有" in stat or "查無" in stat or "no data" in stat.lower():
                return ()
            raise ProviderError(f"TWSE STOCK_DAY status: {stat!r}")

        indexes = _index_map(payload.get("fields"), TWSE_HEADER_ALIASES)
        rows = payload.get("data")
        if not isinstance(rows, list):
            raise ProviderError("TWSE STOCK_DAY data is not a list")

        result = []
        for row in rows:
            if not isinstance(row, list):
                continue
            bar = _bar(
                row=row,
                indexes=indexes,
                instrument_id=f"twse:{symbol}",
                venue="TWSE",
                source="TWSE:STOCK_DAY",
                tpex_units=False,
            )
            if bar is not None:
                result.append(bar)
        return tuple(result)

    def fetch_range(
        self,
        symbol: str,
        start_date: str,
        end_date: str,
    ) -> Sequence[HistoricalBar]:
        start = date.fromisoformat(start_date)
        end = date.fromisoformat(end_date)
        result: list[HistoricalBar] = []
        for month in _month_starts(start_date, end_date):
            result.extend(self.fetch_month(symbol, month))
        return tuple(
            sorted(
                (
                    bar
                    for bar in result
                    if start <= date.fromisoformat(bar.session_date) <= end
                ),
                key=lambda bar: bar.session_date,
            )
        )


class TPExHistoricalProvider:
    BASE_URL = "https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock"

    def __init__(self, transport: JsonTransport | None = None) -> None:
        self.transport = transport or UrllibJsonTransport()

    @classmethod
    def url_for_month(cls, symbol: str, month: date) -> str:
        query = urlencode(
            {
                "code": symbol,
                "date": month.strftime("%Y/%m/01"),
                "response": "json",
            }
        )
        return f"{cls.BASE_URL}?{query}"

    def fetch_month(self, symbol: str, month: date) -> Sequence[HistoricalBar]:
        payload = self.transport.get_json(self.url_for_month(symbol, month))
        if not isinstance(payload, dict):
            raise ProviderError("TPEx tradingStock payload is not an object")
        stat = clean_text(payload.get("stat"))
        if stat and stat.upper() != "OK":
            if "沒有" in stat or "查無" in stat or "no data" in stat.lower():
                return ()
            raise ProviderError(f"TPEx tradingStock status: {stat!r}")

        tables = payload.get("tables")
        if not isinstance(tables, list) or not tables:
            return ()

        table = next(
            (
                item
                for item in tables
                if isinstance(item, dict)
                and isinstance(item.get("fields"), list)
                and isinstance(item.get("data"), list)
            ),
            None,
        )
        if table is None:
            return ()

        indexes = _index_map(table.get("fields"), TPEX_HEADER_ALIASES)
        result = []
        for row in table.get("data", []):
            if not isinstance(row, list):
                continue
            bar = _bar(
                row=row,
                indexes=indexes,
                instrument_id=f"tpex:{symbol}",
                venue="TPEX",
                source="TPEx:tradingStock",
                tpex_units=True,
            )
            if bar is not None:
                result.append(bar)
        return tuple(result)

    def fetch_range(
        self,
        symbol: str,
        start_date: str,
        end_date: str,
    ) -> Sequence[HistoricalBar]:
        start = date.fromisoformat(start_date)
        end = date.fromisoformat(end_date)
        result: list[HistoricalBar] = []
        for month in _month_starts(start_date, end_date):
            result.extend(self.fetch_month(symbol, month))
        return tuple(
            sorted(
                (
                    bar
                    for bar in result
                    if start <= date.fromisoformat(bar.session_date) <= end
                ),
                key=lambda bar: bar.session_date,
            )
        )
