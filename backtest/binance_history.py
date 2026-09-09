from __future__ import annotations

import csv
import io
import json
import time
import zipfile
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

HOUR_MS = 3_600_000
DAY_MS = 86_400_000
INTERVAL_MS = {"1h": HOUR_MS, "4h": 4 * HOUR_MS, "1d": DAY_MS}
ALLOWED_PATHS = {"/fapi/v1/exchangeInfo", "/fapi/v1/klines", "/fapi/v1/fundingRate"}
CONTEXT_SYMBOLS = ("BTCUSDT", "ETHUSDT", "SOLUSDT")
SOURCE_FAMILY = "Binance USD-M Public Data"
ARCHIVE_BASE_URL = "https://data.binance.vision/data/futures/um"
ARCHIVE_EXCHANGE_INFO_SOURCE = "VERIFIED_ETHUSDT_EXCHANGE_INFO_SNAPSHOT_2026-09-09"
ARCHIVE_EXCHANGE_INFO_SNAPSHOT_MS = 1_788_912_000_000

# Minimal ETHUSDT metadata required by FOXYYA scanner/sizing. Values were verified from
# Binance USD-M public exchange information on 2026-09-09. Archive data itself does not
# contain exchangeInfo, so this snapshot is explicit provenance rather than fabricated data.
ETHUSDT_EXCHANGE_INFO_SNAPSHOT = {
    "timezone": "UTC",
    "serverTime": ARCHIVE_EXCHANGE_INFO_SNAPSHOT_MS,
    "symbols": [{
        "symbol": "ETHUSDT",
        "pair": "ETHUSDT",
        "contractType": "PERPETUAL",
        "deliveryDate": 4_133_404_800_000,
        "onboardDate": 1_598_252_400_000,
        "status": "TRADING",
        "baseAsset": "ETH",
        "quoteAsset": "USDT",
        "marginAsset": "USDT",
        "pricePrecision": 2,
        "quantityPrecision": 3,
        "filters": [
            {"filterType": "PRICE_FILTER", "minPrice": "39.86", "maxPrice": "306177", "tickSize": "0.01"},
            {"filterType": "LOT_SIZE", "minQty": "0.001", "maxQty": "10000", "stepSize": "0.001"},
            {"filterType": "MARKET_LOT_SIZE", "minQty": "0.001", "maxQty": "2000", "stepSize": "0.001"},
            {"filterType": "MIN_NOTIONAL", "notional": "5"},
        ],
    }],
}


def _normalize_timestamp_ms(value) -> int:
    timestamp = int(str(value).strip())
    # Futures archives are milliseconds today. Keep a defensive conversion for any
    # future archive migration to microseconds without changing public API semantics.
    if abs(timestamp) >= 10**15:
        timestamp //= 1000
    return timestamp


def _month_start(ms: int) -> datetime:
    dt = datetime.fromtimestamp(int(ms) / 1000, tz=timezone.utc)
    return datetime(dt.year, dt.month, 1, tzinfo=timezone.utc)


def _next_month(dt: datetime) -> datetime:
    return datetime(dt.year + (1 if dt.month == 12 else 0), 1 if dt.month == 12 else dt.month + 1, 1, tzinfo=timezone.utc)


def _ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


class BinancePublicHistoryClient:
    """Read-only Binance USD-M historical REST client with an explicit public-path allowlist."""

    retrieval_mode = "BINANCE_REST"
    exchange_info_source = "BINANCE_USDM_PUBLIC_REST_EXCHANGE_INFO"

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
                normalized = list(raw)
                normalized[0] = _normalize_timestamp_ms(normalized[0])
                normalized[6] = _normalize_timestamp_ms(normalized[6])
                open_ms = int(normalized[0])
                if start_ms <= open_ms < end_ms:
                    rows.append(normalized)
            if len(page) < self.page_limit:
                break
            last_open = _normalize_timestamp_ms(page[-1][0])
            next_cursor = last_open + step
            if next_cursor <= cursor:
                raise ValueError("non-advancing kline pagination")
            cursor = next_cursor
        return _validate_klines(rows)

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
                row = dict(raw)
                row["fundingTime"] = _normalize_timestamp_ms(row["fundingTime"])
                timestamp = int(row["fundingTime"])
                if start_ms <= timestamp < end_ms:
                    rows.append(row)
            if len(page) < self.funding_page_limit:
                break
            last_time = _normalize_timestamp_ms(page[-1]["fundingTime"])
            next_cursor = last_time + 1
            if next_cursor <= cursor:
                raise ValueError("non-advancing funding pagination")
            cursor = next_cursor
        return _validate_funding(rows)


class BinancePublicDataArchiveClient:
    """Official data.binance.vision fallback for regions where fapi REST is legally blocked."""

    retrieval_mode = "BINANCE_OFFICIAL_PUBLIC_ARCHIVE"
    exchange_info_source = ARCHIVE_EXCHANGE_INFO_SOURCE

    def __init__(self, *, base_url: str = ARCHIVE_BASE_URL, download=None, timeout: float = 45.0):
        self.base_url = base_url.rstrip("/")
        self.download = download
        self.timeout = float(timeout)

    def resolve_end_ms(self, requested_end_ms: int) -> int:
        requested_end_ms = int(requested_end_ms)
        # Daily archive files are published after a UTC day completes. When REST is
        # unavailable, end on the latest completely archived UTC day boundary.
        return (requested_end_ms // DAY_MS) * DAY_MS

    def exchange_info(self) -> dict:
        return json.loads(json.dumps(ETHUSDT_EXCHANGE_INFO_SNAPSHOT))

    def _default_download(self, url: str) -> bytes | None:
        request = Request(url, headers={"User-Agent": "FOXYYA-Historical-Research/1.0"}, method="GET")
        try:
            with urlopen(request, timeout=self.timeout) as response:
                return response.read()
        except HTTPError as exc:
            if exc.code == 404:
                return None
            raise

    def _download(self, url: str) -> bytes | None:
        if not url.startswith(self.base_url + "/"):
            raise ValueError("archive URL outside official Binance public-data root")
        return self.download(url) if self.download is not None else self._default_download(url)

    @staticmethod
    def _csv_rows(blob: bytes | None) -> list[list[str]]:
        if blob is None:
            return []
        try:
            with zipfile.ZipFile(io.BytesIO(blob)) as archive:
                names = [name for name in archive.namelist() if not name.endswith("/")]
                if len(names) != 1:
                    raise ValueError("archive zip must contain exactly one CSV file")
                raw = archive.read(names[0]).decode("utf-8-sig")
        except (zipfile.BadZipFile, UnicodeError) as exc:
            raise ValueError("invalid Binance public-data archive zip") from exc
        return [row for row in csv.reader(io.StringIO(raw)) if row]

    @staticmethod
    def _has_header(rows: list[list[str]]) -> bool:
        if not rows:
            return False
        try:
            _normalize_timestamp_ms(rows[0][0])
            return False
        except Exception:
            return True

    def _monthly_url(self, dataset: str, symbol: str, stamp: str, interval: str | None = None) -> str:
        if dataset == "klines":
            if interval not in INTERVAL_MS:
                raise ValueError("unsupported interval")
            return f"{self.base_url}/monthly/klines/{symbol}/{interval}/{symbol}-{interval}-{stamp}.zip"
        if dataset == "fundingRate":
            return f"{self.base_url}/monthly/fundingRate/{symbol}/{symbol}-fundingRate-{stamp}.zip"
        raise ValueError("unsupported archive dataset")

    def _daily_url(self, dataset: str, symbol: str, stamp: str, interval: str | None = None) -> str:
        if dataset == "klines":
            if interval not in INTERVAL_MS:
                raise ValueError("unsupported interval")
            return f"{self.base_url}/daily/klines/{symbol}/{interval}/{symbol}-{interval}-{stamp}.zip"
        if dataset == "fundingRate":
            return f"{self.base_url}/daily/fundingRate/{symbol}/{symbol}-fundingRate-{stamp}.zip"
        raise ValueError("unsupported archive dataset")

    def _period_blobs(self, dataset: str, symbol: str, *, start_ms: int, end_ms: int, interval: str | None = None):
        start_ms = int(start_ms); end_ms = int(end_ms)
        month = _month_start(start_ms)
        while _ms(month) < end_ms:
            next_month = _next_month(month)
            month_start_ms = _ms(month)
            next_month_ms = _ms(next_month)
            stamp = month.strftime("%Y-%m")
            if next_month_ms <= end_ms:
                url = self._monthly_url(dataset, symbol, stamp, interval)
                blob = self._download(url)
                if blob is not None:
                    yield blob
                    month = next_month
                    continue
            # Partial month, or monthly archive not available: use completed daily files.
            day = max(datetime.fromtimestamp(start_ms / 1000, tz=timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0), month)
            month_end = min(next_month_ms, end_ms)
            while _ms(day) < month_end:
                day_end = _ms(day + timedelta(days=1))
                if day_end > end_ms:
                    break
                url = self._daily_url(dataset, symbol, day.strftime("%Y-%m-%d"), interval)
                blob = self._download(url)
                if blob is not None:
                    yield blob
                day += timedelta(days=1)
            month = next_month

    def klines(self, symbol: str, interval: str, *, start_ms: int, end_ms: int) -> list[list]:
        if interval not in INTERVAL_MS:
            raise ValueError("unsupported interval")
        rows = []
        for blob in self._period_blobs("klines", str(symbol), start_ms=start_ms, end_ms=end_ms, interval=interval):
            csv_rows = self._csv_rows(blob)
            if self._has_header(csv_rows):
                csv_rows = csv_rows[1:]
            for raw in csv_rows:
                if len(raw) < 8:
                    raise ValueError("invalid archive kline row")
                row = list(raw)
                row[0] = _normalize_timestamp_ms(row[0])
                row[6] = _normalize_timestamp_ms(row[6])
                if int(start_ms) <= int(row[0]) < int(end_ms):
                    rows.append(row)
        rows.sort(key=lambda row: int(row[0]))
        return _validate_klines(rows)

    @staticmethod
    def _funding_from_csv(symbol: str, csv_rows: list[list[str]]) -> list[dict]:
        if not csv_rows:
            return []
        header = None
        try:
            _normalize_timestamp_ms(csv_rows[0][0])
        except Exception:
            header = [cell.strip() for cell in csv_rows.pop(0)]
        out = []
        for raw in csv_rows:
            if not raw:
                continue
            if header:
                record = {header[i]: raw[i] for i in range(min(len(header), len(raw)))}
                lower = {str(key).strip().lower(): value for key, value in record.items()}
                time_value = next((lower[key] for key in ("fundingtime", "funding_time", "calc_time", "timestamp") if key in lower), None)
                rate_value = next((lower[key] for key in ("fundingrate", "funding_rate", "last_funding_rate") if key in lower), None)
                mark_value = next((lower[key] for key in ("markprice", "mark_price") if key in lower), None)
            else:
                time_value = raw[0] if len(raw) >= 2 else None
                rate_value = raw[-1] if len(raw) >= 2 else None
                mark_value = None
            if time_value is None or rate_value is None:
                raise ValueError("unsupported archive funding schema")
            item = {
                "symbol": str(symbol),
                "fundingTime": _normalize_timestamp_ms(time_value),
                "fundingRate": str(rate_value),
            }
            if mark_value not in (None, ""):
                item["markPrice"] = str(mark_value)
            out.append(item)
        return out

    def funding(self, symbol: str, *, start_ms: int, end_ms: int) -> list[dict]:
        rows = []
        # Funding archives are normally monthly. `_period_blobs` also supports daily
        # files when present, while missing daily files simply leave the tail unavailable.
        for blob in self._period_blobs("fundingRate", str(symbol), start_ms=start_ms, end_ms=end_ms):
            rows.extend(self._funding_from_csv(str(symbol), self._csv_rows(blob)))
        rows = [row for row in rows if int(start_ms) <= int(row["fundingTime"]) < int(end_ms)]
        rows.sort(key=lambda row: int(row["fundingTime"]))
        return _validate_funding(rows)


def _validate_klines(rows: list[list]) -> list[list]:
    seen = set(); previous = None
    for row in rows:
        timestamp = int(row[0])
        if timestamp in seen:
            raise ValueError("duplicate kline timestamp")
        if previous is not None and timestamp < previous:
            raise ValueError("non-monotonic kline timestamp")
        seen.add(timestamp); previous = timestamp
    return rows


def _validate_funding(rows: list[dict]) -> list[dict]:
    seen = set(); previous = None
    for row in rows:
        timestamp = int(row["fundingTime"])
        if timestamp in seen:
            raise ValueError("duplicate funding timestamp")
        if previous is not None and timestamp < previous:
            raise ValueError("non-monotonic funding timestamp")
        seen.add(timestamp); previous = timestamp
    return rows


def _is_geo_block(exc: Exception) -> bool:
    return isinstance(exc, HTTPError) and int(exc.code) in {403, 451}


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
    fallback_client=None,
    retrieved_at_ms: int | None = None,
) -> dict:
    requested_end_ms = int(end_ms)
    end_ms = requested_end_ms
    execution_days = int(execution_days)
    warmup_days = int(warmup_days)
    if end_ms <= 0 or end_ms % HOUR_MS:
        raise ValueError("study end_ms must be a positive 1h boundary")
    if execution_days <= 0 or warmup_days < 0:
        raise ValueError("invalid study window")
    primary = client or BinancePublicHistoryClient()
    fallback = fallback_client if fallback_client is not None else (BinancePublicDataArchiveClient() if client is None else None)
    active = primary
    retrieved_at_ms = int(time.time() * 1000) if retrieved_at_ms is None else int(retrieved_at_ms)

    try:
        exchange_info = active.exchange_info()
    except Exception as exc:
        if fallback is None or not _is_geo_block(exc):
            raise
        active = fallback
        if not hasattr(active, "resolve_end_ms"):
            raise ValueError("archive fallback must expose resolve_end_ms") from exc
        end_ms = int(active.resolve_end_ms(requested_end_ms))
        if end_ms <= 0 or end_ms > requested_end_ms or end_ms % HOUR_MS:
            raise ValueError("invalid archive-safe execution boundary")
        exchange_info = active.exchange_info()

    execution_start_ms = end_ms - execution_days * DAY_MS
    warmup_start_ms = execution_start_ms - warmup_days * DAY_MS
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
            rows_by_symbol[symbol][interval] = active.klines(
                symbol,
                interval,
                start_ms=warmup_start_ms,
                end_ms=end_ms,
            )
        funding_by_symbol[symbol] = active.funding(symbol, start_ms=warmup_start_ms, end_ms=end_ms)

    _assert_execution_eth_hours(rows_by_symbol["ETHUSDT"]["1h"], execution_start_ms, end_ms)

    return {
        "schema": "foxyya-binance-study-input/1",
        "source_family": SOURCE_FAMILY,
        "retrieval_mode": str(getattr(active, "retrieval_mode", "UNAVAILABLE")),
        "exchange_info_source": str(getattr(active, "exchange_info_source", "UNAVAILABLE")),
        "retrieved_at_ms": retrieved_at_ms,
        "requested_end_ms": requested_end_ms,
        "data_lag_ms": requested_end_ms - end_ms,
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
