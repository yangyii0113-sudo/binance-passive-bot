from __future__ import annotations

from copy import deepcopy
from typing import Any

from foxyya.execution import HOUR


DAY = 24 * HOUR
MAX_KLINE_WINDOW_MS = 200 * DAY
DEFAULT_KLINE_LIMIT = 1000
DEFAULT_FUNDING_LIMIT = 1000
INTERVAL_MS = {
    "1h": HOUR,
    "4h": 4 * HOUR,
    "1d": DAY,
}


def _validate_window(start_ms: int, end_ms: int) -> tuple[int, int]:
    start_ms = int(start_ms)
    end_ms = int(end_ms)
    if start_ms < 0 or end_ms <= start_ms:
        raise ValueError("invalid historical data window")
    return start_ms, end_ms


def _canonical_row(row: Any) -> tuple:
    if not isinstance(row, (list, tuple)) or len(row) < 8:
        raise ValueError("invalid Binance kline row")
    return tuple(row)


def _merge_kline_rows(target: dict[int, list], rows: list, *, start_ms: int, end_ms: int) -> None:
    for raw in rows:
        row = list(_canonical_row(raw))
        open_ms = int(row[0])
        close_ms = int(row[6])
        if open_ms < start_ms or close_ms >= end_ms:
            continue
        previous = target.get(open_ms)
        if previous is not None and previous != row:
            raise ValueError(f"conflicting duplicate kline at {open_ms}")
        target[open_ms] = row


def _require_contiguous(rows: list[list], interval_ms: int, start_ms: int, end_ms: int) -> None:
    if not rows:
        raise ValueError("historical kline range is empty and not contiguous")
    first_open = int(rows[0][0])
    last_close = int(rows[-1][6])
    if first_open != start_ms or last_close != end_ms - 1:
        raise ValueError(
            f"historical kline coverage is not contiguous: expected [{start_ms},{end_ms}), "
            f"got [{first_open},{last_close + 1})"
        )
    previous_open = None
    for row in rows:
        open_ms = int(row[0])
        close_ms = int(row[6])
        if close_ms != open_ms + interval_ms - 1:
            raise ValueError(f"historical kline duration is not contiguous at {open_ms}")
        if previous_open is not None and open_ms != previous_open + interval_ms:
            raise ValueError(f"historical kline timestamps are not contiguous at {open_ms}")
        previous_open = open_ms


def fetch_kline_range(
    client,
    symbol: str,
    interval: str,
    start_ms: int,
    end_ms: int,
    *,
    limit: int = DEFAULT_KLINE_LIMIT,
    max_window_ms: int = MAX_KLINE_WINDOW_MS,
    require_contiguous: bool = True,
) -> list[list]:
    start_ms, end_ms = _validate_window(start_ms, end_ms)
    if interval not in INTERVAL_MS:
        raise ValueError(f"unsupported historical interval: {interval}")
    interval_ms = INTERVAL_MS[interval]
    if start_ms % interval_ms or end_ms % interval_ms:
        raise ValueError(f"{interval} range must align to native Binance interval boundaries")
    limit = int(limit)
    max_window_ms = int(max_window_ms)
    if limit <= 0 or max_window_ms <= 0:
        raise ValueError("pagination limits must be positive")

    page_span = min(max_window_ms, interval_ms * limit)
    if page_span < interval_ms:
        raise ValueError("pagination window is shorter than one interval")
    # Keep every request aligned to a whole number of native bars.
    page_span -= page_span % interval_ms

    collected: dict[int, list] = {}
    cursor = start_ms
    while cursor < end_ms:
        page_end = min(end_ms, cursor + page_span)
        rows = client.klines(
            symbol,
            interval,
            limit=limit,
            start_time=cursor,
            end_time=page_end - 1,
        )
        if not isinstance(rows, list):
            raise ValueError("Binance kline response must be a list")
        _merge_kline_rows(collected, rows, start_ms=start_ms, end_ms=end_ms)
        cursor = page_end

    result = [collected[key] for key in sorted(collected)]
    if require_contiguous:
        _require_contiguous(result, interval_ms, start_ms, end_ms)
    return result


def fetch_funding_range(
    client,
    symbol: str,
    start_ms: int,
    end_ms: int,
    *,
    limit: int = DEFAULT_FUNDING_LIMIT,
) -> list[dict]:
    start_ms, end_ms = _validate_window(start_ms, end_ms)
    limit = int(limit)
    if limit <= 0:
        raise ValueError("funding page limit must be positive")

    collected: dict[int, dict] = {}
    cursor = start_ms
    while cursor < end_ms:
        rows = client.funding_rate(
            symbol,
            start_time=cursor,
            end_time=end_ms - 1,
            limit=limit,
        )
        if not isinstance(rows, list):
            raise ValueError("Binance funding response must be a list")
        if not rows:
            break

        page_times = []
        for raw in rows:
            if not isinstance(raw, dict) or "fundingTime" not in raw:
                raise ValueError("invalid Binance funding row")
            row = deepcopy(raw)
            funding_ms = int(row["fundingTime"])
            if funding_ms < start_ms or funding_ms >= end_ms:
                continue
            previous = collected.get(funding_ms)
            if previous is not None and previous != row:
                raise ValueError(f"conflicting duplicate funding row at {funding_ms}")
            collected[funding_ms] = row
            page_times.append(funding_ms)

        if not page_times:
            break
        latest = max(page_times)
        if latest < cursor:
            raise ValueError("funding pagination did not advance")
        cursor = latest + 1
        if len(rows) < limit:
            break

    return [collected[key] for key in sorted(collected)]


def fetch_research_dataset(
    client,
    *,
    symbol: str,
    start_ms: int,
    end_ms: int,
    warmup_days: int = 90,
    context_symbols: tuple[str, ...] = ("BTCUSDT", "SOLUSDT"),
) -> dict:
    start_ms, end_ms = _validate_window(start_ms, end_ms)
    symbol = str(symbol).upper()
    warmup_days = int(warmup_days)
    if warmup_days < 0:
        raise ValueError("warmup_days cannot be negative")
    warmup_start_ms = start_ms - warmup_days * DAY
    if warmup_start_ms < 0:
        warmup_start_ms = 0

    exchange_info = client.exchange_info()
    if not isinstance(exchange_info, dict) or not isinstance(exchange_info.get("symbols"), list):
        raise ValueError("Binance exchangeInfo response is invalid")

    klines = {
        symbol: {
            interval: fetch_kline_range(client, symbol, interval, warmup_start_ms, end_ms)
            for interval in ("1h", "4h", "1d")
        }
    }
    context_1h = {
        context_symbol: fetch_kline_range(client, context_symbol, "1h", warmup_start_ms, end_ms)
        for context_symbol in context_symbols
        if context_symbol != symbol
    }
    funding_rows = {
        symbol: fetch_funding_range(client, symbol, start_ms, end_ms)
    }
    return {
        "source": "BINANCE_USD_M_PUBLIC",
        "exchange_info": exchange_info,
        "klines": klines,
        "context_1h": context_1h,
        "funding_rows": funding_rows,
        "warmup_start_ms": warmup_start_ms,
        "start_ms": start_ms,
        "end_ms": end_ms,
        "symbol": symbol,
        "context_symbols": list(context_symbols),
    }
