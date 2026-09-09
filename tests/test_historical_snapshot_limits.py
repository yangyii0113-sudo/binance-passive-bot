from backtest.historical_clock import HistoricalClock, HOUR_MS, DAY_MS
from backtest.historical_market import HistoricalDataset, HistoricalMarketAdapter


def _rows(count, step, start=0):
    return [[t, "100", "101", "99", "100", "10", t + step - 1, "10000000", 1, "5", "5000000", "0"] for t in range(start, start + count * step, step)]


def test_historical_snapshot_matches_production_kline_lookback_limits():
    end = 240 * DAY_MS
    dataset = HistoricalDataset(
        exchange_info={"symbols":[{"symbol":"ETHUSDT","filters":[{"filterType":"LOT_SIZE","stepSize":"0.001"}]}]},
        rows_by_symbol={"ETHUSDT": {
            "1h": _rows(200, HOUR_MS),
            "4h": _rows(120, 4 * HOUR_MS),
            "1d": _rows(100, DAY_MS),
        }},
        funding_rows_by_symbol={"ETHUSDT": []},
        retrieved_at_ms=end,
    )
    clock = HistoricalClock(0, end, now_ms=end)
    snap = HistoricalMarketAdapter(dataset, clock, primary_symbol="ETHUSDT").snapshot()
    assert len(snap["klines"]["ETHUSDT"]["1h"]) == 140
    assert len(snap["klines"]["ETHUSDT"]["4h"]) == 100
    assert len(snap["klines"]["ETHUSDT"]["1d"]) == 80


def test_historical_realized_funding_matches_production_last_24h_window():
    end = 10 * DAY_MS
    dataset = HistoricalDataset(
        exchange_info={"symbols":[{"symbol":"ETHUSDT","filters":[]}]},
        rows_by_symbol={"ETHUSDT": {
            "1h": _rows(24 * 10, HOUR_MS),
            "4h": _rows(60, 4 * HOUR_MS),
            "1d": _rows(10, DAY_MS),
        }},
        funding_rows_by_symbol={"ETHUSDT": [
            {"fundingTime": end - 30 * HOUR_MS, "fundingRate": "0.0001", "markPrice": "100"},
            {"fundingTime": end - 20 * HOUR_MS, "fundingRate": "0.0002", "markPrice": "101"},
            {"fundingTime": end - 4 * HOUR_MS, "fundingRate": "0.0003", "markPrice": "102"},
        ]},
        retrieved_at_ms=end,
    )
    clock = HistoricalClock(0, end, now_ms=end)
    snap = HistoricalMarketAdapter(dataset, clock, primary_symbol="ETHUSDT").snapshot()
    assert [int(x["fundingTime"]) for x in snap["realized_funding"]["ETHUSDT"]] == [end - 20 * HOUR_MS, end - 4 * HOUR_MS]
