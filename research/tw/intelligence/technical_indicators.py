"""Pure indicator math on validated values; None breaks recursive warm-up."""
from __future__ import annotations


def _smooth(values: list[float | None], period: int, alpha: float) -> list[float | None]:
    if period < 1:
        raise ValueError("period must be positive")
    result: list[float | None] = []
    seed: list[float] = []
    previous = None
    for value in values:
        if value is None:
            seed = []
            previous = None
        elif previous is not None:
            previous += alpha * (value - previous)
        else:
            seed.append(value)
            if len(seed) == period:
                previous = sum(seed) / period
        result.append(previous)
    return result


def ema(values: list[float | None], period: int) -> list[float | None]:
    return _smooth(values, period, 2 / (period + 1))


def rsi(closes: list[float | None], period: int = 14) -> list[float | None]:
    changes = [None] + [
        current - previous if current is not None and previous is not None else None
        for previous, current in zip(closes, closes[1:])
    ] if closes else []
    gains = _smooth([max(c, 0) if c is not None else None for c in changes], period, 1 / period)
    losses = _smooth([max(-c, 0) if c is not None else None for c in changes], period, 1 / period)
    return [
        None if gain is None or loss is None else
        50.0 if gain == loss == 0 else
        100.0 if loss == 0 else 100 - 100 / (1 + gain / loss)
        for gain, loss in zip(gains, losses)
    ]


def macd(closes: list[float | None], fast: int = 12, slow: int = 26,
         signal: int = 9) -> tuple[list[float | None], list[float | None], list[float | None]]:
    fast_values, slow_values = ema(closes, fast), ema(closes, slow)
    line = [a - b if a is not None and b is not None else None
            for a, b in zip(fast_values, slow_values)]
    signal_values = ema(line, signal)
    histogram = [a - b if a is not None and b is not None else None
                 for a, b in zip(line, signal_values)]
    return line, signal_values, histogram


def atr(highs: list[float | None], lows: list[float | None],
        closes: list[float | None], period: int = 14) -> list[float | None]:
    ranges: list[float | None] = []
    for index, (high, low, close) in enumerate(zip(highs, lows, closes)):
        previous = closes[index - 1] if index else None
        if high is None or low is None or close is None or previous is None:
            ranges.append(None)
        else:
            ranges.append(max(high - low, abs(high - previous), abs(low - previous)))
    return _smooth(ranges, period, 1 / period)
