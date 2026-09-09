from __future__ import annotations

import hashlib
import json
from bisect import bisect_right
from copy import deepcopy

from backtest.historical_clock import HOUR_MS, HistoricalClock

SUPPORTED_INTERVALS = ("1h", "4h", "1d")
INTERVAL_MS = {"1h": HOUR_MS, "4h": 4 * HOUR_MS, "1d": 24 * HOUR_MS}
SNAPSHOT_LIMITS = {"1h": 140, "4h": 100, "1d": 80}
FUNDING_LOOKBACK_MS = 24 * HOUR_MS
DEFAULT_SOURCE_FAMILY = "Binance USD-M Public Data"


def _canonical_bytes(value) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")


def _sha256(value) -> str:
    return hashlib.sha256(_canonical_bytes(value)).hexdigest()


def _bar(row) -> dict:
    return {
        "open_time_ms": int(row[0]),
        "open": float(row[1]),
        "high": float(row[2]),
        "low": float(row[3]),
        "close": float(row[4]),
        "volume": float(row[5]),
        "close_ms": int(row[6]),
        "closed": True,
    }


def _gap_summary(closes: list[int], expected_delta_ms: int) -> dict:
    gaps = []
    missing_bar_count = 0
    for previous, current in zip(closes, closes[1:]):
        actual_delta = int(current) - int(previous)
        if actual_delta == expected_delta_ms:
            continue
        missing_bars = max(0, (actual_delta - 1) // expected_delta_ms)
        missing_bar_count += missing_bars
        gaps.append({
            "previous_close_ms": int(previous),
            "next_close_ms": int(current),
            "expected_delta_ms": int(expected_delta_ms),
            "actual_delta_ms": int(actual_delta),
            "missing_bars": int(missing_bars),
        })
    return {
        "gap_count": len(gaps),
        "missing_bar_count": int(missing_bar_count),
        "gaps": gaps,
    }


class HistoricalDataset:
    """Immutable, validated public historical inputs with reproducible hashes."""

    def __init__(
        self,
        *,
        exchange_info: dict,
        rows_by_symbol: dict[str, dict[str, list[list]]],
        funding_rows_by_symbol: dict[str, list[dict]] | None = None,
        retrieved_at_ms: int,
        source_family: str = DEFAULT_SOURCE_FAMILY,
    ):
        self._exchange_info = deepcopy(exchange_info)
        self.retrieved_at_ms = int(retrieved_at_ms)
        self.source_family = str(source_family)
        self._rows_by_symbol: dict[str, dict[str, tuple[tuple, ...]]] = {}
        self._close_times_by_symbol: dict[str, dict[str, tuple[int, ...]]] = {}
        self._funding_rows_by_symbol: dict[str, tuple[dict, ...]] = {}
        self._funding_times_by_symbol: dict[str, tuple[int, ...]] = {}

        for symbol, interval_map in sorted(rows_by_symbol.items()):
            normalized: dict[str, tuple[tuple, ...]] = {}
            close_times: dict[str, tuple[int, ...]] = {}
            for interval in SUPPORTED_INTERVALS:
                rows = interval_map.get(interval, [])
                normalized[interval] = self._validate_rows(symbol, interval, rows)
                close_times[interval] = tuple(int(row[6]) for row in normalized[interval])
            unsupported = set(interval_map) - set(SUPPORTED_INTERVALS)
            if unsupported:
                raise ValueError(f"unsupported historical interval: {sorted(unsupported)[0]}")
            symbol = str(symbol)
            self._rows_by_symbol[symbol] = normalized
            self._close_times_by_symbol[symbol] = close_times

        for symbol, rows in sorted((funding_rows_by_symbol or {}).items()):
            symbol = str(symbol)
            if symbol not in self._rows_by_symbol:
                raise ValueError("funding symbol missing from historical rows")
            normalized_funding = self._validate_funding(rows)
            self._funding_rows_by_symbol[symbol] = normalized_funding
            self._funding_times_by_symbol[symbol] = tuple(int(row["fundingTime"]) for row in normalized_funding)

        for symbol in self._rows_by_symbol:
            self._funding_rows_by_symbol.setdefault(symbol, tuple())
            self._funding_times_by_symbol.setdefault(symbol, tuple())

    @property
    def exchange_info(self) -> dict:
        return deepcopy(self._exchange_info)

    @staticmethod
    def _validate_rows(symbol: str, interval: str, rows) -> tuple[tuple, ...]:
        normalized = []
        seen_close = set()
        previous_close = None
        for raw in rows:
            row = tuple(raw)
            if len(row) < 8:
                raise ValueError(f"historical row too short: {symbol} {interval}")
            open_ms = int(row[0])
            close_ms = int(row[6])
            if close_ms in seen_close:
                raise ValueError("duplicate historical close timestamp")
            if previous_close is not None and close_ms < previous_close:
                raise ValueError("non-monotonic historical rows")
            if close_ms <= open_ms:
                raise ValueError("historical close must be after open")
            seen_close.add(close_ms)
            previous_close = close_ms
            normalized.append(row)
        return tuple(normalized)

    @staticmethod
    def _validate_funding(rows) -> tuple[dict, ...]:
        normalized = []
        seen = set()
        previous = None
        for raw in rows:
            row = deepcopy(dict(raw))
            if "fundingTime" not in row:
                raise ValueError("fundingTime required")
            timestamp = int(row["fundingTime"])
            if timestamp in seen:
                raise ValueError("duplicate historical funding timestamp")
            if previous is not None and timestamp < previous:
                raise ValueError("non-monotonic historical funding rows")
            seen.add(timestamp)
            previous = timestamp
            normalized.append(row)
        return tuple(normalized)

    @property
    def symbols(self) -> tuple[str, ...]:
        return tuple(sorted(self._rows_by_symbol))

    def rows(self, symbol: str, interval: str) -> tuple[tuple, ...]:
        if interval not in SUPPORTED_INTERVALS:
            raise ValueError(f"unsupported historical interval: {interval}")
        return self._rows_by_symbol.get(symbol, {}).get(interval, tuple())

    def close_times(self, symbol: str, interval: str) -> tuple[int, ...]:
        if interval not in SUPPORTED_INTERVALS:
            raise ValueError(f"unsupported historical interval: {interval}")
        return self._close_times_by_symbol.get(symbol, {}).get(interval, tuple())

    def funding_rows(self, symbol: str) -> tuple[dict, ...]:
        return tuple(deepcopy(row) for row in self._funding_rows_by_symbol.get(symbol, tuple()))

    def funding_times(self, symbol: str) -> tuple[int, ...]:
        return self._funding_times_by_symbol.get(symbol, tuple())

    def manifest(self) -> dict:
        datasets: dict[str, dict] = {}
        for symbol in self.symbols:
            symbol_manifest: dict[str, dict] = {}
            for interval in SUPPORTED_INTERVALS:
                rows = [list(row) for row in self.rows(symbol, interval)]
                closes = [int(row[6]) for row in rows]
                symbol_manifest[interval] = {
                    "symbol": symbol,
                    "interval": interval,
                    "first_close_ms": closes[0] if closes else None,
                    "last_close_ms": closes[-1] if closes else None,
                    "row_count": len(rows),
                    "sha256": _sha256(rows),
                    **_gap_summary(closes, INTERVAL_MS[interval]),
                }
            funding = list(self.funding_rows(symbol))
            funding_times = [int(row["fundingTime"]) for row in funding]
            symbol_manifest["funding"] = {
                "symbol": symbol,
                "dataset": "funding",
                "first_funding_ms": funding_times[0] if funding_times else None,
                "last_funding_ms": funding_times[-1] if funding_times else None,
                "row_count": len(funding),
                "sha256": _sha256(funding),
            }
            datasets[symbol] = symbol_manifest
        return {
            "source_family": self.source_family,
            "retrieved_at_ms": self.retrieved_at_ms,
            "exchange_info_sha256": _sha256(self._exchange_info),
            "datasets": datasets,
        }


class HistoricalMarketAdapter:
    """Clock-bounded market snapshot adapter for the shared FOXYYA core."""

    def __init__(self, dataset: HistoricalDataset, clock: HistoricalClock, *, primary_symbol: str):
        if primary_symbol not in dataset.symbols:
            raise ValueError("primary symbol missing from historical dataset")
        self.dataset = dataset
        self.clock = clock
        self.primary_symbol = primary_symbol
        self._symbol_info = {
            item.get("symbol"): item
            for item in self.dataset.exchange_info.get("symbols", [])
            if item.get("symbol")
        }

    def _visible_tuple(self, symbol: str, interval: str) -> tuple[tuple, ...]:
        rows = self.dataset.rows(symbol, interval)
        closes = self.dataset.close_times(symbol, interval)
        cutoff = bisect_right(closes, int(self.clock.now_ms))
        return rows[:cutoff]

    def visible_rows(self, symbol: str, interval: str) -> list[list]:
        return [list(row) for row in self._visible_tuple(symbol, interval)]

    def _snapshot_rows(self, symbol: str, interval: str) -> tuple[tuple, ...]:
        visible = self._visible_tuple(symbol, interval)
        return visible[-SNAPSHOT_LIMITS[interval]:]

    def _step(self, symbol: str) -> float:
        for item in self._symbol_info.get(symbol, {}).get("filters", []):
            if item.get("filterType") in ("LOT_SIZE", "MARKET_LOT_SIZE"):
                try:
                    value = float(item.get("stepSize", 0))
                except (TypeError, ValueError):
                    continue
                if value > 0:
                    return value
        return 0.001

    def _ticker(self, symbol: str) -> dict:
        visible = self._visible_tuple(symbol, "1h")
        if not visible:
            return {
                "symbol": symbol,
                "lastPrice": 0.0,
                "priceChangePercent": 0.0,
                "quoteVolume": 0.0,
            }
        window = visible[-24:]
        first_open = float(window[0][1])
        last_close = float(window[-1][4])
        pct = ((last_close / first_open) - 1.0) * 100.0 if first_open else 0.0
        quote_volume = sum(float(row[7]) for row in window)
        return {
            "symbol": symbol,
            "lastPrice": last_close,
            "priceChangePercent": pct,
            "quoteVolume": quote_volume,
        }

    def _current_hour_open(self, symbol: str) -> float | None:
        current_open_ms = (self.clock.now_ms // HOUR_MS) * HOUR_MS
        for row in reversed(self.dataset.rows(symbol, "1h")):
            open_ms = int(row[0])
            if open_ms == current_open_ms and open_ms <= self.clock.now_ms:
                return float(row[1])
            if open_ms < current_open_ms:
                break
        return None

    def _visible_funding(self, symbol: str) -> list[dict]:
        rows = self.dataset.funding_rows(symbol)
        times = self.dataset.funding_times(symbol)
        right = bisect_right(times, int(self.clock.now_ms))
        left = bisect_right(times, int(self.clock.now_ms) - FUNDING_LOOKBACK_MS - 1)
        return [deepcopy(row) for row in rows[left:right]]

    def snapshot(self) -> dict:
        tickers = {symbol: self._ticker(symbol) for symbol in self.dataset.symbols}
        klines = {}
        steps = {}
        marks = {}
        opens = {}
        realized_funding = {}
        funding_rates = {}

        for symbol in self.dataset.symbols:
            klines[symbol] = {
                interval: [_bar(row) for row in self._snapshot_rows(symbol, interval)]
                for interval in SUPPORTED_INTERVALS
            }
            steps[symbol] = self._step(symbol)
            if klines[symbol]["1h"]:
                marks[symbol] = float(klines[symbol]["1h"][-1]["close"])
            current_open = self._current_hour_open(symbol)
            if current_open is not None:
                opens[symbol] = current_open
            funding = self._visible_funding(symbol)
            realized_funding[symbol] = funding
            if funding:
                try:
                    funding_rates[symbol] = float(funding[-1].get("fundingRate", 0))
                except (TypeError, ValueError):
                    funding_rates[symbol] = 0.0

        def ret(symbol: str) -> float:
            try:
                return float(tickers.get(symbol, {}).get("priceChangePercent", 0)) / 100.0
            except (TypeError, ValueError):
                return 0.0

        visible_symbols = [symbol for symbol in self.dataset.symbols if klines[symbol]["1h"]]
        breadth = (
            sum(ret(symbol) > 0 for symbol in visible_symbols) / len(visible_symbols)
            if visible_symbols
            else 0.5
        )
        return {
            "exchange_info": self.dataset.exchange_info,
            "tickers": tickers,
            "klines": klines,
            "steps": steps,
            "marks": marks,
            "funding_rates": funding_rates,
            "hour_open_prices": opens,
            "realized_funding": realized_funding,
            "major_returns": {
                "BTC": ret("BTCUSDT"),
                "ETH": ret("ETHUSDT"),
                "SOL": ret("SOLUSDT"),
            },
            "breadth": breadth,
            "volatility": "NORMAL",
            "benchmark_return_24h": ret("BTCUSDT"),
            "eligible_universe_count": len(visible_symbols),
            "built_at_ms": self.clock.now_ms,
            "historical": True,
            "historical_provenance": {
                "source_family": self.dataset.source_family,
                "retrieved_at_ms": self.dataset.retrieved_at_ms,
                "mark_proxy": "last_fully_closed_1h_close",
                "ticker_24h": "derived_from_latest_24_visible_native_1h_rows",
                "snapshot_limits": dict(SNAPSHOT_LIMITS),
                "funding_lookback_ms": FUNDING_LOOKBACK_MS,
            },
        }
