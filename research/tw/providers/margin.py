from __future__ import annotations

from collections.abc import Sequence
from datetime import date
from urllib.parse import urlencode

from ..calculations import derive_change_percent
from ..contracts import Availability, Observation
from ..fields import (
    MARGIN_BALANCE,
    MARGIN_CHANGE,
    MARGIN_PREVIOUS_BALANCE,
    MARGIN_QUOTA,
    MARGIN_SHORT_RATIO_PERCENT,
    MARGIN_USAGE_PERCENT,
    SHORT_BALANCE,
    SHORT_CHANGE,
    SHORT_PREVIOUS_BALANCE,
    SHORT_QUOTA,
    SHORT_USAGE_PERCENT,
)
from .http import JsonTransport, ProviderError, UrllibJsonTransport
from .parsing import clean_text, parse_decimal, parse_int, parse_roc_date


def _first(row: dict, *keys: str):
    for key in keys:
        if key in row and clean_text(row.get(key)):
            return row.get(key)
    return None


def _safe_delta(today: int | None, previous: int | None) -> int | None:
    if today is None or previous is None:
        return None
    return today - previous


def _safe_ratio(numerator: int | None, denominator: int | None) -> float | None:
    if numerator is None or denominator in {None, 0}:
        return None
    return round(numerator / denominator * 100.0, 6)


def _safe_usage(balance: int | None, quota: int | None) -> float | None:
    if balance is None or quota in {None, 0}:
        return None
    return round(balance / quota * 100.0, 6)


def _obs(
    *,
    instrument_id: str,
    field: str,
    value,
    source: str,
    observed_at: str | None,
    venue: str,
    symbol: str,
) -> Observation:
    return Observation(
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
            "symbol": symbol,
            "unit": "provider_native",
        },
    )


class TWSEMarginProvider:
    URL = "https://openapi.twse.com.tw/v1/exchangeReport/MI_MARGN"
    RWD_BASE_URL = "https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN"

    def __init__(self, transport: JsonTransport | None = None) -> None:
        self.transport = transport or UrllibJsonTransport()

    @staticmethod
    def url_for_date(observed_date: str) -> str:
        iso = date.fromisoformat(observed_date)
        query = urlencode(
            {
                "date": iso.strftime("%Y%m%d"),
                "selectType": "ALL",
                "response": "json",
            }
        )
        return f"{TWSEMarginProvider.RWD_BASE_URL}?{query}"

    def _row_observations(
        self,
        *,
        row: dict,
        observed_at: str | None,
        source: str,
    ) -> tuple[Observation, ...]:
        symbol = clean_text(
            _first(
                row,
                "股票代號",
                "SecuritiesCompanyCode",
                "Code",
            )
        )
        if not symbol:
            return ()

        margin_balance = parse_int(
            _first(row, "融資今日餘額", "MarginPurchaseBalance")
        )
        margin_previous = parse_int(
            _first(row, "融資前日餘額", "MarginPurchaseBalancePreviousDay")
        )
        margin_quota = parse_int(
            _first(row, "融資限額", "MarginPurchaseQuota")
        )
        short_balance = parse_int(
            _first(row, "融券今日餘額", "ShortSaleBalance")
        )
        short_previous = parse_int(
            _first(row, "融券前日餘額", "ShortSaleBalancePreviousDay")
        )
        short_quota = parse_int(
            _first(row, "融券限額", "ShortSaleQuota")
        )

        values = (
            (MARGIN_BALANCE, margin_balance),
            (MARGIN_PREVIOUS_BALANCE, margin_previous),
            (MARGIN_CHANGE, _safe_delta(margin_balance, margin_previous)),
            (MARGIN_QUOTA, margin_quota),
            (
                MARGIN_USAGE_PERCENT,
                _safe_usage(margin_balance, margin_quota),
            ),
            (SHORT_BALANCE, short_balance),
            (SHORT_PREVIOUS_BALANCE, short_previous),
            (SHORT_CHANGE, _safe_delta(short_balance, short_previous)),
            (SHORT_QUOTA, short_quota),
            (
                SHORT_USAGE_PERCENT,
                _safe_usage(short_balance, short_quota),
            ),
            (
                MARGIN_SHORT_RATIO_PERCENT,
                _safe_ratio(short_balance, margin_balance),
            ),
        )
        return tuple(
            _obs(
                instrument_id=f"twse:{symbol}",
                field=field,
                value=value,
                source=source,
                observed_at=observed_at,
                venue="TWSE",
                symbol=symbol,
            )
            for field, value in values
        )

    def _fetch_openapi(self) -> Sequence[Observation]:
        payload = self.transport.get_json(self.URL)
        if not isinstance(payload, list):
            raise ProviderError("TWSE MI_MARGN payload is not a list")

        result: list[Observation] = []
        for row in payload:
            if not isinstance(row, dict):
                continue
            observed_at = parse_roc_date(
                _first(row, "Date", "日期", "資料日期")
            )
            result.extend(
                self._row_observations(
                    row=row,
                    observed_at=observed_at,
                    source="TWSE:MI_MARGN_OPENAPI",
                )
            )
        return tuple(result)

    def _fetch_rwd(self, observed_at: str) -> Sequence[Observation]:
        payload = self.transport.get_json(self.url_for_date(observed_at))
        if not isinstance(payload, dict):
            raise ProviderError("TWSE MI_MARGN RWD payload is not an object")
        if payload.get("stat") != "OK":
            raise ProviderError(
                f"TWSE MI_MARGN unavailable for {observed_at}: "
                f"{payload.get('stat')!r}"
            )

        tables = payload.get("tables")
        if not isinstance(tables, list):
            raise ProviderError("TWSE MI_MARGN RWD tables missing")

        detail = None
        for table in tables:
            if not isinstance(table, dict):
                continue
            fields = table.get("fields")
            if isinstance(fields, list) and "股票代號" in fields:
                detail = table
                break
        if detail is None and len(tables) >= 2 and isinstance(tables[1], dict):
            detail = tables[1]
        if detail is None:
            raise ProviderError("TWSE MI_MARGN detail table missing")

        fields = detail.get("fields")
        rows = detail.get("data")
        if not isinstance(rows, list):
            raise ProviderError("TWSE MI_MARGN detail rows missing")

        result: list[Observation] = []
        for raw in rows:
            if not isinstance(raw, list):
                continue
            if isinstance(fields, list) and len(fields) <= len(raw):
                row = {
                    str(fields[index]): raw[index]
                    for index in range(len(fields))
                }
            elif len(raw) >= 13:
                row = {
                    "股票代號": raw[0],
                    "股票名稱": raw[1],
                    "融資前日餘額": raw[5],
                    "融資今日餘額": raw[6],
                    "融券前日餘額": raw[11],
                    "融券今日餘額": raw[12],
                }
            else:
                continue

            result.extend(
                self._row_observations(
                    row=row,
                    observed_at=observed_at,
                    source="TWSE:MI_MARGN_RWD",
                )
            )
        return tuple(result)

    def fetch(
        self,
        observed_at: str | None = None,
    ) -> Sequence[Observation]:
        if observed_at is not None:
            return self._fetch_rwd(observed_at)
        return self._fetch_openapi()


class TPExMarginProvider:
    URL = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_margin_balance"

    def __init__(self, transport: JsonTransport | None = None) -> None:
        self.transport = transport or UrllibJsonTransport()

    def fetch(self) -> Sequence[Observation]:
        payload = self.transport.get_json(self.URL)
        if not isinstance(payload, list):
            raise ProviderError("TPEx margin payload is not a list")

        result: list[Observation] = []
        for row in payload:
            if not isinstance(row, dict):
                continue

            symbol = clean_text(row.get("SecuritiesCompanyCode"))
            if not symbol:
                continue

            observed_at = parse_roc_date(row.get("Date"))
            margin_balance = parse_int(row.get("MarginPurchaseBalance"))
            margin_previous = parse_int(
                row.get("MarginPurchaseBalancePreviousDay")
            )
            margin_quota = parse_int(
                _first(
                    row,
                    "MarginPurchaseQuota",
                    "MarginPurchaseLimit",
                )
            )
            short_balance = parse_int(row.get("ShortSaleBalance"))
            short_previous = parse_int(
                row.get("ShortSaleBalancePreviousDay")
            )
            short_quota = parse_int(
                _first(
                    row,
                    "ShortSaleQuota",
                    "ShortSaleLimit",
                )
            )

            values = (
                (MARGIN_BALANCE, margin_balance),
                (MARGIN_PREVIOUS_BALANCE, margin_previous),
                (MARGIN_CHANGE, _safe_delta(margin_balance, margin_previous)),
                (MARGIN_QUOTA, margin_quota),
                (
                    MARGIN_USAGE_PERCENT,
                    _safe_usage(margin_balance, margin_quota),
                ),
                (SHORT_BALANCE, short_balance),
                (SHORT_PREVIOUS_BALANCE, short_previous),
                (SHORT_CHANGE, _safe_delta(short_balance, short_previous)),
                (SHORT_QUOTA, short_quota),
                (
                    SHORT_USAGE_PERCENT,
                    _safe_usage(short_balance, short_quota),
                ),
                (
                    MARGIN_SHORT_RATIO_PERCENT,
                    _safe_ratio(short_balance, margin_balance),
                ),
            )
            for field, value in values:
                result.append(
                    _obs(
                        instrument_id=f"tpex:{symbol}",
                        field=field,
                        value=value,
                        source="TPEx:tpex_mainboard_margin_balance",
                        observed_at=observed_at,
                        venue="TPEX",
                        symbol=symbol,
                    )
                )
        return tuple(result)
