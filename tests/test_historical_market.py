import copy

import pytest

from backtest.data_manifest import build_data_manifest
from backtest.historical_clock import HistoricalClock
from backtest.historical_market import HistoricalDataError, HistoricalMarketAdapter
from foxyya.execution import HOUR


def raw_bar(open_ms, close_ms, close, *, volume="10", quote_volume="10000000"):
    return [
        open_ms,
        str(close - 1),
        str(close + 1),
        str(close - 2),
        str(close),
        str(volume),
        close_ms,
        str(quote_volume),
        100,
        "5",
        "5000000",
        "0",
    ]


def exchange_info():
    return {
        "symbols": [
            {
                "symbol": "ETHUSDT",
                "baseAsset": "ETH",
                "quoteAsset": "USDT",
                "status": "TRADING",
                "contractType": "PERPETUAL",
                "onboardDate": 0,
                "filters": [{"filterType": "LOT_SIZE", "stepSize": "0.001"}],
            }
        ]
    }


def dataset():
    return {
        "ETHUSDT": {
            "1h": [raw_bar(0, 999, 100), raw_bar(1000, 1999, 101), raw_bar(2000, 2999, 102)],
            "4h": [raw_bar(0, 1500, 100), raw_bar(1501, 2500, 101)],
            "1d": [raw_bar(0, 1200, 100), raw_bar(1201, 2600, 101)],
        }
    }


def test_each_interval_hides_bars_newer_than_historical_clock():
    clock = HistoricalClock(1999)
    adapter = HistoricalMarketAdapter(clock, exchange_info(), dataset(), trade_symbols=("ETHUSDT",))

    snapshot = adapter.snapshot()

    assert [b["close_ms"] for b in snapshot["klines"]["ETHUSDT"]["1h"]] == [999, 1999]
    assert [b["close_ms"] for b in snapshot["klines"]["ETHUSDT"]["4h"]] == [1500]
    assert [b["close_ms"] for b in snapshot["klines"]["ETHUSDT"]["1d"]] == [1200]
    assert snapshot["built_at_ms"] == 1999


def test_missing_interval_is_explicitly_unavailable_not_fabricated():
    data = dataset()
    del data["ETHUSDT"]["4h"]
    adapter = HistoricalMarketAdapter(HistoricalClock(3000), exchange_info(), data, trade_symbols=("ETHUSDT",))

    snapshot = adapter.snapshot()

    assert snapshot["klines"]["ETHUSDT"]["4h"] == []
    assert snapshot["data_status"]["ETHUSDT"]["4h"] == "UNAVAILABLE"


def test_duplicate_or_non_monotonic_kline_timestamps_fail_closed():
    duplicate = dataset()
    duplicate["ETHUSDT"]["1h"].append(copy.deepcopy(duplicate["ETHUSDT"]["1h"][-1]))
    with pytest.raises(HistoricalDataError, match="strictly increasing"):
        HistoricalMarketAdapter(HistoricalClock(4000), exchange_info(), duplicate, trade_symbols=("ETHUSDT",))

    reversed_data = dataset()
    reversed_data["ETHUSDT"]["1h"][1], reversed_data["ETHUSDT"]["1h"][2] = (
        reversed_data["ETHUSDT"]["1h"][2],
        reversed_data["ETHUSDT"]["1h"][1],
    )
    with pytest.raises(HistoricalDataError, match="strictly increasing"):
        HistoricalMarketAdapter(HistoricalClock(4000), exchange_info(), reversed_data, trade_symbols=("ETHUSDT",))


def test_manifest_hash_is_deterministic_and_changes_with_input():
    first = build_data_manifest(exchange_info(), dataset(), funding_rows={})
    second = build_data_manifest(copy.deepcopy(exchange_info()), copy.deepcopy(dataset()), funding_rows={})
    assert first["manifest_sha256"] == second["manifest_sha256"]

    changed = dataset()
    changed["ETHUSDT"]["1h"][0][4] = "999"
    third = build_data_manifest(exchange_info(), changed, funding_rows={})
    assert third["manifest_sha256"] != first["manifest_sha256"]


def test_market_context_is_part_of_manifest_provenance():
    context = {
        "BTCUSDT": [raw_bar(0, 999, 50000), raw_bar(1000, 1999, 51000)],
        "SOLUSDT": [raw_bar(0, 999, 100), raw_bar(1000, 1999, 105)],
    }
    first = build_data_manifest(exchange_info(), dataset(), funding_rows={}, context_1h=context)
    changed = copy.deepcopy(context)
    changed["BTCUSDT"][1][4] = "52000"
    second = build_data_manifest(exchange_info(), dataset(), funding_rows={}, context_1h=changed)

    assert first["manifest_sha256"] != second["manifest_sha256"]
    assert first["context_1h"]["BTCUSDT"]["row_count"] == 2


def test_adapter_manifest_includes_context_hash():
    context = {"BTCUSDT": [raw_bar(0, 999, 50000), raw_bar(1000, 1999, 51000)]}
    adapter = HistoricalMarketAdapter(
        HistoricalClock(1999),
        exchange_info(),
        dataset(),
        trade_symbols=("ETHUSDT",),
        context_1h=context,
    )
    assert adapter.manifest["context_1h"]["BTCUSDT"]["row_count"] == 2


def test_snapshot_uses_only_visible_values_for_ticker_mark_and_24h_metrics():
    clock = HistoricalClock(1999)
    adapter = HistoricalMarketAdapter(clock, exchange_info(), dataset(), trade_symbols=("ETHUSDT",))

    snapshot = adapter.snapshot()
    ticker = snapshot["tickers"]["ETHUSDT"]

    assert snapshot["marks"]["ETHUSDT"] == 101.0
    assert ticker["lastPrice"] == "101.0"
    assert float(ticker["quoteVolume"]) > 0
    assert snapshot["steps"]["ETHUSDT"] == 0.001


def test_hour_boundary_mark_uses_observable_current_open_not_pre_entry_previous_close():
    data = {
        "ETHUSDT": {
            "1h": [
                raw_bar(0, HOUR - 1, 100),
                raw_bar(HOUR, 2 * HOUR - 1, 105),
            ],
            "4h": [raw_bar(0, 4 * HOUR - 1, 100)],
            "1d": [raw_bar(0, 24 * HOUR - 1, 100)],
        }
    }
    adapter = HistoricalMarketAdapter(
        HistoricalClock(HOUR),
        exchange_info(),
        data,
        trade_symbols=("ETHUSDT",),
    )

    snapshot = adapter.snapshot()

    # Strategy/ticker context remains on the last fully closed candle.
    assert snapshot["tickers"]["ETHUSDT"]["lastPrice"] == "100.0"
    # Execution/position management may observe the new hour's open immediately.
    assert snapshot["hour_open_prices"]["ETHUSDT"] == 104.0
    assert snapshot["marks"]["ETHUSDT"] == 104.0

    adapter.clock.advance_to(HOUR + 30 * 60_000)
    midpoint = adapter.snapshot()
    assert midpoint["marks"]["ETHUSDT"] == 104.0
