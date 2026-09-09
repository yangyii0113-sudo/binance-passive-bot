from __future__ import annotations

import json
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

HOUR_MS = 3_600_000
DAY_MS = 86_400_000
INTERVAL_MS = {"1h": HOUR_MS, "4h": 4 * HOUR_MS, "1d": DAY_MS}
ALLOWED_PATHS = {"/fapi/v1/exchangeInfo", "/fapi/v1/klines", "/fapi/v1/fundingRate"}
CONTEXT_SYMBOLS = ("BTCUSDT", "ETHUSDT", "SOLUSDT")
SOURCE_FAMILY = "Binance USD-M Public Data"


class BinancePublicHistoryClient:
    """Read-only Binance USD-M historical client with an explicit public-path allowlist."""

    def __init__(
        self,
        *,
        base_url: str = "https://fapi.binance.com",
        transport=None,
        timeout: float = 20.0,
        page_limit: int = 1500,
        funding_page_limit: int = 1000,
    ):
        self.base_url = base_url.rstrip("/")
        self.transport = transport
        self.timeout = float(timeout)
        self.page_limit = int(page_limit)
        self.funding_page_limit = int(funding_page_limit)
        if self.page_limit <= 0 or self.page_limit > 1500:
            raise ValueError("invalid kline page limit")
        if self.funding_page_limit <= 0 or self.funding_page_limit > 1000:
            raise ValueError("invalid funding page limit")

    def _default_transport(self, path: str, params: dict):
        query = urlencode(params)
        url = f"{self.base_url}{path}" + (f"?{query}" if query else "")
        request = Request(url, headers={"User-Agent": "FOXYYA-Historical-Research/1.0"}, method="GET")
        with urlopen(request, timeout=self.timeout) as response:
            return json.loads(response.read().decode("utf-8"))

    def _get(self, path: str, params: dict):
        if path not in ALLOWED_PATHS:
            raise ValueError("path is not an allowed public historical endpoint")
        if self.transport is not None:
            return self.transport(path, dict(params))
        return self._default_transport(path, dict(params))

    @staticmethod
    def _validate_timestamp_rows(rows: list, *, index: int, label: str) -> list:
        out = []
        seen = set()
        previous = None
        for raw in rows:
            row = raw
            try:
                timestamp = int(row[index] if not isinstance(row, dict) else row[index])
            except Exception as exc:
                raise ValueError(f"invalid {label} timestamp") from exc
            if timestamp in seen:
                raise ValueError(f"duplicate {label} timestamp")
            if previous is not None and timestamp < previous:
                raise ValueError(f"non-monotonic {label} timestamp")
            seen.add(timestamp)
            previous = timestamp
            out.append(row)
        return out

    def exchange_info(self) -> dict:
        payload = self._get("/fapi/v1/exchangeInfo", {})
        if not isinstance(payload, dict) or not isinstance(payload.get("symbols"), list):
            raise ValueError("invalid exchangeInfo payload")
        return payload

    def klines(self, symbol: str, interval: str, *, start_ms: int, end_ms: int) -> list[list]:
        if interval not in INTERVAL_MS:
            raise ValueError("unsupported interval")
        start_ms = int(start_ms)
        end_ms = int(end_ms)
        if end_ms <= start_ms:
            raise ValueError("invalid kline window")
        cursor = start_ms
        step = INTERVAL_MS[interval]
        rows: list[list] = []
        while cursor < end_ms:
            page = self._get(
                "/fapi/v1/klines",
                {
                    "symbol": str(symbol),
                    "interval": interval,
                    "startTime": cursor,
                    "endTime": end_ms - 1,
                    "limit": self.page_limit,
                },
            )
            if not isinstance(page, list):
                raise ValueError("invalid kline payload")
            if not page:
                break
            for raw in page:
                if not isinstance(raw, list) or len(raw) < 8:
                    raise ValueError("invalid kline row")
                open_ms = int(raw[0])
                if open_ms < start_ms or open_ms >= end_ms:
                    continue
                rows.append(raw)
            if len(page) < self.page_limit:
                break
            last_open = int(page[-1][0])
            next_cursor = last_open + step
            if next_cursor <= cursor:
                raise ValueError("non-advancing kline pagination")
            cursor = next_cursor
        # Validate after all pages so duplicates across pages also fail closed.
        seen = set()
        previous = None
        for row in rows:
            timestamp = int(row[0])
            if timestamp in seen:
                raise ValueError("duplicate kline timestamp")
            if previous is not None and timestamp < previous:
                raise ValueError("non-monotonic kline timestamp")
            seen.add(timestamp)
            previous = timestamp
        return rows

    def funding(self, symbol: str, *, start_ms: int, end_ms: int) -> list[dict]:
        start_ms = int(start_ms)
        end_ms = int(end_ms)
        if end_ms <= start_ms:
            raise ValueError("invalid funding window")
        cursor = start_ms
        rows: list[dict] = []
        while cursor < end_ms:
            page = self._get(
                "/fapi/v1/fundingRate",
                {
                    "symbol": str(symbol),
                    "startTime": cursor,
                    "endTime": end_ms - 1,
                    "limit": self.funding_page_limit,
                },
            )
            if not isinstance(page, list):
                raise ValueError("invalid funding payload")
            if not page:
                break
            for raw in page:
                if not isinstance(raw, dict) or "fundingTime" not in raw:
                    raise ValueError("invalid funding row")
                timestamp = int(raw["fundingTime"])
                if start_ms <= timestamp < end_ms:
                    rows.append(dict(raw))
            if len(page) < self.funding_page_limit:
                break
            last_time = int(page[-1]["fundingTime"])
            next_cursor = last_time + 1
            if next_cursor <= cursor:
                raise ValueError("non-advancing funding pagination")
            cursor = next_cursor
        seen = set()
        previous = None
        for row in rows:
            timestamp = int(row["fundingTime"])
            if timestamp in seen:
                raise ValueError("duplicate funding timestamp")
            if previous is not None and timestamp < previous:
                raise ValueError("non-monotonic funding timestamp")
            seen.add(timestamp)
            previous = timestamp
        return rows


def _assert_execution_eth_hours(rows: list[list], execution_start_ms: int, end_ms: int) -> None:
    available = {int(row[0]) for row in rows if execution_start_ms <= int(row[0]) < end_ms}
    for required in range(int(execution_start_ms), int(end_ms), HOUR_MS):
        if required not in available:
            raise ValueError(f"missing required execution 1h open: {required}")


def fetch_study_inputs(
    *,
    end_ms: int,
    execution_days: int = 365,
    warmup_days: int = 200,
    client=None,
    retrieved_at_ms: int | None = None,
) -> dict:
    end_ms = int(end_ms)
    execution_days = int(execution_days)
    warmup_days = int(warmup_days)
    if end_ms <= 0 or end_ms % HOUR_MS:
        raise ValueError("study end_ms must be a positive 1h boundary")
    if execution_days <= 0 or warmup_days < 0:
        raise ValueError("invalid study window")
    execution_start_ms = end_ms - execution_days * DAY_MS
    warmup_start_ms = execution_start_ms - warmup_days * DAY_MS
    client = client or BinancePublicHistoryClient()
    retrieved_at_ms = int(time.time() * 1000) if retrieved_at_ms is None else int(retrieved_at_ms)

    exchange_info = client.exchange_info()
    eth_symbols = [dict(item) for item in exchange_info.get("symbols", []) if item.get("symbol") == "ETHUSDT"]
    if len(eth_symbols) != 1:
        raise ValueError("ETHUSDT missing or ambiguous in exchangeInfo")
    filtered_exchange_info = {k: v for k, v in exchange_info.items() if k != "symbols"}
    filtered_exchange_info["symbols"] = eth_symbols

    rows_by_symbol: dict[str, dict[str, list[list]]] = {}
    funding_by_symbol: dict[str, list[dict]] = {}
    for symbol in CONTEXT_SYMBOLS:
        rows_by_symbol[symbol] = {}
        for interval in ("1h", "4h", "1d"):
            rows_by_symbol[symbol][interval] = client.klines(
                symbol,
                interval,
                start_ms=warmup_start_ms,
                end_ms=end_ms,
            )
        funding_by_symbol[symbol] = client.funding(symbol, start_ms=warmup_start_ms, end_ms=end_ms)

    _assert_execution_eth_hours(rows_by_symbol["ETHUSDT"]["1h"], execution_start_ms, end_ms)

    return {
        "schema": "foxyya-binance-study-input/1",
        "source_family": SOURCE_FAMILY,
        "retrieved_at_ms": retrieved_at_ms,
        "execution_start_ms": execution_start_ms,
        "warmup_start_ms": warmup_start_ms,
        "end_ms": end_ms,
        "execution_days": execution_days,
        "warmup_days": warmup_days,
        "tradable_symbols": ["ETHUSDT"],
        "context_symbols": list(CONTEXT_SYMBOLS),
        "exchange_info": filtered_exchange_info,
        "rows_by_symbol": rows_by_symbol,
        "funding_rows_by_symbol": funding_by_symbol,
    }
