from __future__ import annotations

from copy import deepcopy

import pytest

from backtest.public_data import (
    DAY,
    fetch_funding_range,
    fetch_kline_range,
    fetch_research_dataset,
)
from foxyya.execution import HOUR


def bar(open_ms: int, interval_ms: int, close: float):
    return [
        open_ms,
        str(close - 1),
        str(close + 1),
        str(close - 2),
        str(close),
        "10",
        open_ms + interval_ms - 1,
        "10000000",
        100,
        "5",
        "5000000",
        "0",
    ]


class FakePublicClient:
    def __init__(self):
        self.kline_calls = []
        self.funding_calls = []
        self.exchange_info_calls = 0
        self.rows = {}
        self.funding = {}

    def exchange_info(self):
        self.exchange_info_calls += 1
        return {
            "symbols": [
                {
                    "symbol": symbol,
                    "baseAsset": symbol.removesuffix("USDT"),
                    "quoteAsset": "USDT",
                    "status": "TRADING",
                    "contractType": "PERPETUAL",
                    "onboardDate": 0,
                    "filters": [{"filterType": "LOT_SIZE", "stepSize": "0.001"}],
                }
                for symbol in ("BTCUSDT", "ETHUSDT", "SOLUSDT")
            ]
        }

    def klines(self, symbol, interval, limit=200, start_time=None, end_time=None):
        self.kline_calls.append((symbol, interval, limit, start_time, end_time))
        return [
            deepcopy(row)
            for row in self.rows.get((symbol, interval), [])
            if int(row[0]) >= int(start_time) and int(row[0]) <= int(end_time)
        ][:limit]

    def funding_rate(self, symbol, start_time=None, end_time=None, limit=100):
        self.funding_calls.append((symbol, limit, start_time, end_time))
        return [
            deepcopy(row)
            for row in self.funding.get(symbol, [])
            if int(start_time) <= int(row["fundingTime"]) <= int(end_time)
        ][:limit]


def test_kline_loader_pages_by_bounded_windows_and_keeps_only_closed_rows():
    client = FakePublicClient()
    client.rows[("ETHUSDT", "1h")] = [bar(i * HOUR, HOUR, 100 + i) for i in range(6)]
    # Add a future/partial row that must never be admitted for end_ms=6H.
    client.rows[("ETHUSDT", "1h")].append(bar(6 * HOUR, HOUR, 999))

    rows = fetch_kline_range(
        client,
        "ETHUSDT",
        "1h",
        0,
        6 * HOUR,
        limit=2,
        max_window_ms=2 * HOUR,
    )

    assert [int(row[0]) for row in rows] == [i * HOUR for i in range(6)]
    assert all(int(row[6]) < 6 * HOUR for row in rows)
    assert len(client.kline_calls) == 3
    assert all(call[2] == 2 for call in client.kline_calls)
    assert all(call[4] - call[3] < 2 * HOUR for call in client.kline_calls)


def test_kline_loader_fails_closed_on_gap_or_conflicting_duplicate():
    client = FakePublicClient()
    client.rows[("ETHUSDT", "1h")] = [bar(0, HOUR, 100), bar(2 * HOUR, HOUR, 102)]
    with pytest.raises(ValueError, match="contiguous"):
        fetch_kline_range(client, "ETHUSDT", "1h", 0, 3 * HOUR, max_window_ms=3 * HOUR)

    client = FakePublicClient()
    first = bar(0, HOUR, 100)
    conflict = bar(0, HOUR, 101)
    client.rows[("ETHUSDT", "1h")] = [first, conflict, bar(HOUR, HOUR, 102)]
    with pytest.raises(ValueError, match="conflicting duplicate"):
        fetch_kline_range(client, "ETHUSDT", "1h", 0, 2 * HOUR, max_window_ms=2 * HOUR)


def test_funding_loader_paginates_from_last_seen_timestamp_without_duplicates():
    client = FakePublicClient()
    client.funding["ETHUSDT"] = [
        {"symbol": "ETHUSDT", "fundingTime": i * 8 * HOUR, "fundingRate": "0.0001", "markPrice": str(100 + i)}
        for i in range(5)
    ]

    rows = fetch_funding_range(client, "ETHUSDT", 0, 5 * 8 * HOUR, limit=2)

    assert [int(row["fundingTime"]) for row in rows] == [i * 8 * HOUR for i in range(5)]
    assert len(client.funding_calls) == 3
    assert client.funding_calls[1][2] == 8 * HOUR + 1
    assert client.funding_calls[2][2] == 3 * 8 * HOUR + 1


def _seed_research_rows(client, warmup_start, end_ms):
    for interval, step in (("1h", HOUR), ("4h", 4 * HOUR), ("1d", DAY)):
        aligned_start = (warmup_start // step) * step
        aligned_end = (end_ms // step) * step
        count = max(0, (aligned_end - aligned_start) // step)
        client.rows[("ETHUSDT", interval)] = [bar(aligned_start + i * step, step, 100 + i) for i in range(count)]
    aligned_1h_start = (warmup_start // HOUR) * HOUR
    aligned_1h_end = (end_ms // HOUR) * HOUR
    for symbol in ("BTCUSDT", "SOLUSDT"):
        count = max(0, (aligned_1h_end - aligned_1h_start) // HOUR)
        client.rows[(symbol, "1h")] = [bar(aligned_1h_start + i * HOUR, HOUR, 100 + i) for i in range(count)]


def test_research_dataset_fetches_native_eth_timeframes_context_and_warmup():
    client = FakePublicClient()
    start_ms = 100 * DAY
    end_ms = start_ms + 3 * DAY
    warmup_days = 2
    warmup_start = start_ms - warmup_days * DAY
    _seed_research_rows(client, warmup_start, end_ms)
    client.funding["ETHUSDT"] = [
        {"symbol": "ETHUSDT", "fundingTime": start_ms + 8 * HOUR, "fundingRate": "0.0001", "markPrice": "100"}
    ]

    result = fetch_research_dataset(
        client,
        symbol="ETHUSDT",
        start_ms=start_ms,
        end_ms=end_ms,
        warmup_days=warmup_days,
    )

    assert result["warmup_start_ms"] == warmup_start
    assert set(result["klines"]["ETHUSDT"]) == {"1h", "4h", "1d"}
    assert set(result["context_1h"]) == {"BTCUSDT", "SOLUSDT"}
    assert result["funding_rows"]["ETHUSDT"][0]["fundingTime"] == start_ms + 8 * HOUR
    assert result["exchange_info"]["symbols"]
    assert result["source"] == "BINANCE_USD_M_PUBLIC"


def test_research_dataset_aligns_each_native_interval_without_exposing_partial_context_bar():
    client = FakePublicClient()
    # A realistic trailing-365D execution window may end at 10:00 UTC, which
    # is a legal 1H boundary but not a native 4H or Daily boundary.
    start_ms = 100 * DAY + 10 * HOUR
    end_ms = start_ms + 3 * DAY
    warmup_days = 2
    warmup_start = start_ms - warmup_days * DAY
    _seed_research_rows(client, warmup_start, end_ms)

    result = fetch_research_dataset(
        client,
        symbol="ETHUSDT",
        start_ms=start_ms,
        end_ms=end_ms,
        warmup_days=warmup_days,
    )

    eth = result["klines"]["ETHUSDT"]
    assert int(eth["1h"][-1][6]) == end_ms - 1
    assert int(eth["4h"][-1][6]) == (end_ms // (4 * HOUR)) * (4 * HOUR) - 1
    assert int(eth["1d"][-1][6]) == (end_ms // DAY) * DAY - 1
    assert int(eth["4h"][-1][6]) < end_ms
    assert int(eth["1d"][-1][6]) < end_ms
