from __future__ import annotations

from copy import deepcopy
from typing import Iterable

from foxyya.execution import HOUR

from .data_manifest import build_data_manifest
from .historical_clock import HistoricalClock


class HistoricalDataError(ValueError):
    """Raised when historical market inputs fail integrity checks."""


_REQUIRED_INTERVALS = ("1d", "4h", "1h")
_DAY = 24 * HOUR


def _validate_kline_rows(symbol: str, interval: str, rows: Iterable[list]) -> None:
    prev_open = None
    prev_close = None
    for index, row in enumerate(rows):
        if not isinstance(row, (list, tuple)) or len(row) <= 7:
            raise HistoricalDataError(f"{symbol} {interval} row {index} is not a Binance kline row")
        try:
            open_ms = int(row[0])
            close_ms = int(row[6])
            float(row[1]); float(row[2]); float(row[3]); float(row[4]); float(row[5]); float(row[7])
        except (TypeError, ValueError) as exc:
            raise HistoricalDataError(f"{symbol} {interval} row {index} contains invalid values") from exc
        if close_ms < open_ms:
            raise HistoricalDataError(f"{symbol} {interval} close precedes open")
        if prev_open is not None and (open_ms <= prev_open or close_ms <= prev_close):
            raise HistoricalDataError(f"{symbol} {interval} timestamps must be strictly increasing")
        prev_open = open_ms
        prev_close = close_ms


def _validate_funding_rows(symbol: str, rows: Iterable[dict]) -> None:
    previous = None
    for index, row in enumerate(rows):
        if not isinstance(row, dict) or "fundingTime" not in row:
            raise HistoricalDataError(f"{symbol} funding row {index} is invalid")
        try:
            current = int(row["fundingTime"])
            float(row.get("fundingRate", 0))
        except (TypeError, ValueError) as exc:
            raise HistoricalDataError(f"{symbol} funding row {index} contains invalid values") from exc
        if previous is not None and current <= previous:
            raise HistoricalDataError(f"{symbol} funding timestamps must be strictly increasing")
        previous = current


def _bar(row: list) -> dict:
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


def _visible_closed(rows: list, now_ms: int) -> list:
    return [row for row in rows if int(row[6]) <= int(now_ms)]


def _step(symbol_info: dict) -> float:
    for filt in symbol_info.get("filters", []):
        if filt.get("filterType") in ("LOT_SIZE", "MARKET_LOT_SIZE"):
            try:
                value = float(filt.get("stepSize", 0))
            except (TypeError, ValueError):
                value = 0.0
            if value > 0:
                return value
    return 0.001


def _return_24h(rows: list) -> float:
    if not rows:
        return 0.0
    latest = float(rows[-1][4])
    if len(rows) >= 25:
        base = float(rows[-25][4])
    else:
        base = float(rows[0][4])
    return latest / base - 1 if base else 0.0


def _historical_ticker(symbol: str, visible_1h: list) -> dict | None:
    if not visible_1h:
        return None
    recent = visible_1h[-24:]
    last_price = float(visible_1h[-1][4])
    quote_volume = sum(float(row[7]) for row in recent)
    ret = _return_24h(visible_1h)
    return {
        "symbol": symbol,
        "lastPrice": str(last_price),
        "priceChangePercent": str(ret * 100),
        "quoteVolume": str(quote_volume),
    }


class HistoricalMarketAdapter:
    """Build a ForwardRunner-compatible snapshot from pre-fetched public history.

    Full historical arrays are retained internally, but snapshot() exposes only
    information observable at HistoricalClock.now_ms. Trade symbols are kept
    separate from optional context series so benchmark/regime data cannot
    accidentally expand the strategy universe.
    """

    def __init__(
        self,
        clock: HistoricalClock,
        exchange_info: dict,
        klines: dict,
        *,
        funding_rows: dict | None = None,
        trade_symbols: tuple[str, ...] | list[str] | None = None,
        context_1h: dict | None = None,
        volatility: str = "NORMAL",
    ):
        self.clock = clock
        self.exchange_info = deepcopy(exchange_info)
        self.klines = deepcopy(klines)
        self.funding_rows = deepcopy(funding_rows or {})
        self.context_1h = deepcopy(context_1h or {})
        self.volatility = str(volatility)
        self.trade_symbols = tuple(trade_symbols or sorted(self.klines))

        available_symbols = {row.get("symbol") for row in self.exchange_info.get("symbols", [])}
        missing_metadata = [symbol for symbol in self.trade_symbols if symbol not in available_symbols]
        if missing_metadata:
            raise HistoricalDataError(f"exchange_info missing trade symbols: {', '.join(missing_metadata)}")

        for symbol, intervals in self.klines.items():
            if not isinstance(intervals, dict):
                raise HistoricalDataError(f"{symbol} kline intervals must be a mapping")
            for interval, rows in intervals.items():
                _validate_kline_rows(symbol, interval, rows)
        for symbol, rows in self.context_1h.items():
            _validate_kline_rows(symbol, "context_1h", rows)
        for symbol, rows in self.funding_rows.items():
            _validate_funding_rows(symbol, rows)

        self.manifest = build_data_manifest(self.exchange_info, self.klines, funding_rows=self.funding_rows)

    def _filtered_exchange_info(self) -> dict:
        out = deepcopy(self.exchange_info)
        wanted = set(self.trade_symbols)
        out["symbols"] = [row for row in out.get("symbols", []) if row.get("symbol") in wanted]
        return out

    def _visible_context_returns(self, now_ms: int, trade_visible_1h: dict) -> dict:
        returns = {}
        combined = dict(self.context_1h)
        for symbol, rows in trade_visible_1h.items():
            combined.setdefault(symbol, rows)
        for symbol, rows in combined.items():
            visible = rows if symbol in trade_visible_1h and rows is trade_visible_1h[symbol] else _visible_closed(rows, now_ms)
            if visible:
                returns[symbol] = _return_24h(visible)
        return returns

    def snapshot(self) -> dict:
        now_ms = int(self.clock.now_ms)
        symbol_info = {row.get("symbol"): row for row in self.exchange_info.get("symbols", [])}
        output_klines = {}
        data_status = {}
        tickers = {}
        steps = {}
        marks = {}
        funding_rates = {}
        hour_open_prices = {}
        realized_funding = {}
        visible_raw_1h = {}
        current_open = (now_ms // HOUR) * HOUR

        for symbol in self.trade_symbols:
            intervals = self.klines.get(symbol, {})
            output_klines[symbol] = {}
            data_status[symbol] = {}
            for interval in _REQUIRED_INTERVALS:
                if interval not in intervals:
                    output_klines[symbol][interval] = []
                    data_status[symbol][interval] = "UNAVAILABLE"
                    continue
                visible = _visible_closed(intervals[interval], now_ms)
                output_klines[symbol][interval] = [_bar(row) for row in visible]
                data_status[symbol][interval] = "AVAILABLE" if visible else "NO_VISIBLE_DATA"
                if interval == "1h":
                    visible_raw_1h[symbol] = visible
                    for row in reversed(intervals[interval]):
                        open_ms = int(row[0])
                        if open_ms == current_open and open_ms <= now_ms:
                            hour_open_prices[symbol] = float(row[1])
                            break

            ticker = _historical_ticker(symbol, visible_raw_1h.get(symbol, []))
            if ticker is not None:
                tickers[symbol] = ticker
                marks[symbol] = float(ticker["lastPrice"])
            steps[symbol] = _step(symbol_info.get(symbol, {}))

            funding_visible = [row for row in self.funding_rows.get(symbol, []) if int(row["fundingTime"]) <= now_ms]
            if funding_visible:
                latest = funding_visible[-1]
                funding_rates[symbol] = float(latest.get("fundingRate", 0))
                realized_funding[symbol] = [
                    deepcopy(row)
                    for row in funding_visible
                    if now_ms - int(row["fundingTime"]) <= _DAY
                ]
            elif symbol in self.funding_rows:
                funding_rates[symbol] = 0.0
                realized_funding[symbol] = []

        context_returns = self._visible_context_returns(now_ms, visible_raw_1h)
        breadth_values = list(context_returns.values())
        breadth = (
            sum(value > 0 for value in breadth_values) / len(breadth_values)
            if breadth_values
            else 0.5
        )

        return {
            "exchange_info": self._filtered_exchange_info(),
            "tickers": tickers,
            "klines": output_klines,
            "steps": steps,
            "marks": marks,
            "funding_rates": funding_rates,
            "hour_open_prices": hour_open_prices,
            "realized_funding": realized_funding,
            "major_returns": {
                "BTC": context_returns.get("BTCUSDT", 0.0),
                "ETH": context_returns.get("ETHUSDT", 0.0),
                "SOL": context_returns.get("SOLUSDT", 0.0),
            },
            "breadth": breadth,
            "volatility": self.volatility,
            "benchmark_return_24h": context_returns.get("BTCUSDT", 0.0),
            "eligible_universe_count": len(tickers),
            "built_at_ms": now_ms,
            "data_status": data_status,
            "data_manifest_sha256": self.manifest["manifest_sha256"],
            "historical": True,
            "real_orders": False,
        }
