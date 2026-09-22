from __future__ import annotations

import re
from collections.abc import Sequence
from datetime import date
from urllib.parse import urlencode

from ..calculations import derive_change_percent
from ..contracts import Availability, Observation
from .http import JsonTransport, ProviderError, UrllibJsonTransport
from .parsing import clean_text, parse_decimal, parse_int, parse_roc_date


_TWSE_QUOTE_REQUIRED = (
    "證券代號",
    "成交股數",
    "成交筆數",
    "成交金額",
    "開盤價",
    "最高價",
    "最低價",
    "收盤價",
    "漲跌(+/-)",
    "漲跌價差",
)

_FMTQIK_ALIASES = {
    "日期": "date",
    "成交股數": "trade_volume",
    "成交金額": "trade_value",
    "成交筆數": "transaction_count",
    "發行量加權股價指數": "index_close",
    "漲跌點數": "index_change",
}


def _available(value: object, observed_at: str | None) -> Availability:
    return (
        Availability.AVAILABLE
        if value is not None and observed_at is not None
        else Availability.UNAVAILABLE
    )


def _payload_date(payload: dict) -> str | None:
    value = payload.get("date")
    return parse_roc_date(value) if value is not None else None


def _signed_twse_change(direction: object, magnitude: object) -> float | None:
    value = parse_decimal(magnitude)
    if value is None:
        return None
    if value == 0:
        return 0.0

    text = clean_text(direction).lower()
    if "green" in text:
        return -abs(value)
    if "red" in text:
        return abs(value)

    plain = re.sub(r"<[^>]+>", "", text).strip()
    if plain in {"-", "－", "−"}:
        return -abs(value)
    if plain in {"+", "＋"}:
        return abs(value)

    # The magnitude column is normally unsigned. Do not guess a sign when the
    # official direction field is absent/unknown; preserve the value as
    # unavailable instead of creating false market direction.
    return value if value < 0 else None


def _quote_table(payload: dict) -> tuple[list, list]:
    for table in payload.get("tables") or ():
        if not isinstance(table, dict):
            continue
        fields = table.get("fields")
        data = table.get("data")
        if (
            isinstance(fields, list)
            and isinstance(data, list)
            and all(field in fields for field in _TWSE_QUOTE_REQUIRED)
        ):
            return fields, data

    fields = payload.get("fields9")
    data = payload.get("data9")
    if (
        isinstance(fields, list)
        and isinstance(data, list)
        and all(field in fields for field in _TWSE_QUOTE_REQUIRED)
    ):
        return fields, data
    raise ProviderError("TWSE MI_INDEX quote table missing required fields")


class TWSEExactSessionProvider:
    """Official exact-session TWSE recovery source for research integration.

    This provider is intentionally separate from the latest-snapshot OpenAPI
    adapter. It never rewrites observation dates: every returned observation is
    accepted only after the official response proves the requested session.
    """

    QUOTES_BASE_URL = "https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX"
    INDEX_BASE_URL = "https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK"

    def __init__(self, transport: JsonTransport | None = None) -> None:
        self.transport = transport or UrllibJsonTransport()

    @classmethod
    def quotes_url_for_date(cls, observed_date: str) -> str:
        iso = date.fromisoformat(observed_date)
        query = urlencode(
            {
                "date": iso.strftime("%Y%m%d"),
                "type": "ALLBUT0999",
                "response": "json",
            }
        )
        return f"{cls.QUOTES_BASE_URL}?{query}"

    @classmethod
    def index_url_for_date(cls, observed_date: str) -> str:
        iso = date.fromisoformat(observed_date)
        query = urlencode(
            {
                "date": iso.strftime("%Y%m%d"),
                "response": "json",
            }
        )
        return f"{cls.INDEX_BASE_URL}?{query}"

    def fetch_quotes(self, observed_date: str) -> Sequence[Observation]:
        payload = self.transport.get_json(self.quotes_url_for_date(observed_date))
        if not isinstance(payload, dict):
            raise ProviderError("TWSE MI_INDEX payload is not an object")
        if clean_text(payload.get("stat")).upper() != "OK":
            raise ProviderError(
                f"TWSE MI_INDEX unavailable for {observed_date}: "
                f"{payload.get('stat')!r}"
            )

        actual_date = _payload_date(payload)
        if actual_date != observed_date:
            raise ProviderError(
                f"TWSE MI_INDEX date mismatch: requested={observed_date}, "
                f"response={actual_date}"
            )

        fields, rows = _quote_table(payload)
        index = {field: fields.index(field) for field in _TWSE_QUOTE_REQUIRED}
        result: list[Observation] = []
        for raw in rows:
            if not isinstance(raw, list) or len(raw) <= max(index.values()):
                continue
            symbol = clean_text(raw[index["證券代號"]])
            if not symbol:
                continue

            close = parse_decimal(raw[index["收盤價"]])
            change = _signed_twse_change(
                raw[index["漲跌(+/-)"]],
                raw[index["漲跌價差"]],
            )
            values = (
                ("open", parse_decimal(raw[index["開盤價"]])),
                ("high", parse_decimal(raw[index["最高價"]])),
                ("low", parse_decimal(raw[index["最低價"]])),
                ("close", close),
                ("change", change),
                ("change_percent", derive_change_percent(close, change)),
                ("trade_volume", parse_int(raw[index["成交股數"]])),
                ("trade_value", parse_int(raw[index["成交金額"]])),
                ("transaction_count", parse_int(raw[index["成交筆數"]])),
            )
            for field, value in values:
                result.append(
                    Observation(
                        instrument_id=f"twse:{symbol}",
                        field=field,
                        value=value,
                        source="TWSE:MI_INDEX_RWD",
                        observed_at=actual_date,
                        availability=_available(value, actual_date),
                        metadata={
                            "venue": "TWSE",
                            "symbol": symbol,
                            "session_acquisition": "exact",
                        },
                    )
                )

        if not result:
            raise ProviderError(
                f"TWSE MI_INDEX normalized no observations for {observed_date}"
            )
        return tuple(result)

    def fetch_market(self, observed_date: str) -> Sequence[Observation]:
        payload = self.transport.get_json(self.index_url_for_date(observed_date))
        if not isinstance(payload, dict):
            raise ProviderError("TWSE FMTQIK payload is not an object")
        if clean_text(payload.get("stat")).upper() != "OK":
            raise ProviderError(
                f"TWSE FMTQIK unavailable for {observed_date}: "
                f"{payload.get('stat')!r}"
            )

        fields = payload.get("fields")
        rows = payload.get("data")
        if not isinstance(fields, list) or not isinstance(rows, list):
            raise ProviderError("TWSE FMTQIK fields/data missing")

        indexes: dict[str, int] = {}
        for position, raw_field in enumerate(fields):
            canonical = _FMTQIK_ALIASES.get(clean_text(raw_field))
            if canonical:
                indexes[canonical] = position
        required = {
            "date",
            "trade_volume",
            "trade_value",
            "transaction_count",
            "index_close",
            "index_change",
        }
        missing = required - set(indexes)
        if missing:
            raise ProviderError(
                "TWSE FMTQIK missing fields: " + ",".join(sorted(missing))
            )

        selected = None
        for raw in rows:
            if not isinstance(raw, list) or len(raw) <= max(indexes.values()):
                continue
            row_date = parse_roc_date(raw[indexes["date"]])
            if row_date == observed_date:
                selected = raw
                break
        if selected is None:
            raise ProviderError(
                f"TWSE FMTQIK has no row for requested session {observed_date}"
            )

        values = (
            ("index_close", parse_decimal(selected[indexes["index_close"]])),
            ("index_change", parse_decimal(selected[indexes["index_change"]])),
            ("trade_volume", parse_int(selected[indexes["trade_volume"]])),
            ("trade_value", parse_int(selected[indexes["trade_value"]])),
            (
                "transaction_count",
                parse_int(selected[indexes["transaction_count"]]),
            ),
        )
        return tuple(
            Observation(
                instrument_id="twse:TAIEX",
                field=field,
                value=value,
                source="TWSE:FMTQIK_RWD",
                observed_at=observed_date,
                availability=_available(value, observed_date),
                metadata={
                    "venue": "TWSE",
                    "symbol": "TAIEX",
                    "session_acquisition": "exact",
                },
            )
            for field, value in values
        )
