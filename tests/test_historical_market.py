import pytest

from backtest.historical_clock import HistoricalClock, HOUR_MS
from backtest.historical_market import HistoricalDataset, HistoricalMarketAdapter


def row(open_ms, close_ms, open_=100, high=110, low=90, close=105, volume=10, quote_volume=1000):
    return [open_ms, str(open_), str(high), str(low), str(close), str(volume), close_ms, str(quote_volume)]


def exchange_info(*symbols):
    records = []
    for symbol in symbols:
        base = symbol.removesuffix("USDT")
        records.append({
            "symbol": symbol,
            "baseAsset": base,
            "quoteAsset": "USDT",
            "status": "TRADING",
            "contractType": "PERPETUAL",
            "onboardDate": 0,
            "filters": [{"filterType": "LOT_SIZE", "stepSize": "0.001"}],
        })
    return {"symbols": records}


def dataset(rows_by_symbol, *, funding=None, retrieved_at_ms=999):
    return HistoricalDataset(
        exchange_info=exchange_info(*rows_by_symbol.keys()),
        rows_by_symbol=rows_by_symbol,
        funding_rows_by_symbol=funding or {},
        retrieved_at_ms=retrieved_at_ms,
    )


def test_each_native_interval_filters_by_its_own_close_time():
    clock = HistoricalClock(0, 30 * HOUR_MS, now_ms=2 * HOUR_MS)
    data = dataset({
        "ETHUSDT": {
            "1h": [row(0, HOUR_MS), row(HOUR_MS, 2 * HOUR_MS), row(2 * HOUR_MS, 3 * HOUR_MS)],
            "4h": [row(0, 4 * HOUR_MS)],
            "1d": [row(0, 24 * HOUR_MS)],
        }
    })
    market = HistoricalMarketAdapter(data, clock, primary_symbol="ETHUSDT")

    assert len(market.visible_rows("ETHUSDT", "1h")) == 2
    assert market.visible_rows("ETHUSDT", "4h") == []
    assert market.visible_rows("ETHUSDT", "1d") == []


def test_current_hour_open_is_visible_without_leaking_current_bar_close():
    clock = HistoricalClock(0, 5 * HOUR_MS, now_ms=2 * HOUR_MS + 1)
    data = dataset({
        "ETHUSDT": {
            "1h": [
                row(0, HOUR_MS, open_=90, close=95),
                row(HOUR_MS, 2 * HOUR_MS, open_=95, close=100),
                row(2 * HOUR_MS, 3 * HOUR_MS, open_=101, close=999),
            ],
            "4h": [],
            "1d": [],
        }
    })
    market = HistoricalMarketAdapter(data, clock, primary_symbol="ETHUSDT")
    snapshot = market.snapshot()

    assert len(snapshot["klines"]["ETHUSDT"]["1h"]) == 2
    assert snapshot["klines"]["ETHUSDT"]["1h"][-1]["close"] == 100.0
    assert snapshot["hour_open_prices"]["ETHUSDT"] == 101.0
    assert snapshot["marks"]["ETHUSDT"] == 100.0
    assert snapshot["historical_provenance"]["mark_proxy"] == "last_fully_closed_1h_close"


def test_multi_symbol_context_uses_only_visible_native_1h_rows():
    clock = HistoricalClock(0, 30 * HOUR_MS, now_ms=24 * HOUR_MS)
    rows = {}
    for symbol, final_close in (("BTCUSDT", 120), ("ETHUSDT", 110), ("SOLUSDT", 80)):
        series = []
        for i in range(24):
            close = 100 + (final_close - 100) * ((i + 1) / 24)
            series.append(row(i * HOUR_MS, (i + 1) * HOUR_MS, open_=100 if i == 0 else series[-1][4], close=close, quote_volume=1000))
        series.append(row(24 * HOUR_MS, 25 * HOUR_MS, open_=final_close, close=9999, quote_volume=999999))
        rows[symbol] = {"1h": series, "4h": [], "1d": []}

    snapshot = HistoricalMarketAdapter(dataset(rows), clock, primary_symbol="ETHUSDT").snapshot()

    assert snapshot["major_returns"]["BTC"] > 0
    assert snapshot["major_returns"]["ETH"] > 0
    assert snapshot["major_returns"]["SOL"] < 0
    assert snapshot["tickers"]["ETHUSDT"]["quoteVolume"] == pytest.approx(24_000.0)
    assert snapshot["tickers"]["ETHUSDT"]["lastPrice"] == pytest.approx(110.0)


def test_non_monotonic_or_duplicate_rows_fail_closed():
    with pytest.raises(ValueError, match="non-monotonic historical rows"):
        dataset({"ETHUSDT": {"1h": [row(HOUR_MS, 2 * HOUR_MS), row(0, HOUR_MS)], "4h": [], "1d": []}})

    with pytest.raises(ValueError, match="duplicate historical close timestamp"):
        dataset({"ETHUSDT": {"1h": [row(0, HOUR_MS), row(0, HOUR_MS)], "4h": [], "1d": []}})


def test_manifest_is_stable_has_provenance_and_changes_with_input_content():
    rows = {"ETHUSDT": {"1h": [row(0, HOUR_MS)], "4h": [], "1d": []}}
    first = dataset(rows, retrieved_at_ms=123)
    second = dataset(rows, retrieved_at_ms=123)
    changed = dataset({"ETHUSDT": {"1h": [row(0, HOUR_MS, close=106)], "4h": [], "1d": []}}, retrieved_at_ms=123)

    manifest = first.manifest()
    assert manifest == second.manifest()
    assert manifest["source_family"] == "Binance USD-M Public Data"
    assert manifest["retrieved_at_ms"] == 123
    assert manifest["datasets"]["ETHUSDT"]["1h"]["row_count"] == 1
    assert manifest["datasets"]["ETHUSDT"]["1h"]["first_close_ms"] == HOUR_MS
    assert manifest["datasets"]["ETHUSDT"]["1h"]["sha256"] != changed.manifest()["datasets"]["ETHUSDT"]["1h"]["sha256"]


def test_funding_visibility_is_bounded_by_historical_clock():
    clock = HistoricalClock(0, 10 * HOUR_MS, now_ms=2 * HOUR_MS)
    data = dataset(
        {"ETHUSDT": {"1h": [row(0, HOUR_MS), row(HOUR_MS, 2 * HOUR_MS)], "4h": [], "1d": []}},
        funding={"ETHUSDT": [
            {"fundingTime": HOUR_MS, "fundingRate": "0.0001", "markPrice": "100"},
            {"fundingTime": 3 * HOUR_MS, "fundingRate": "0.0002", "markPrice": "101"},
        ]},
    )
    snapshot = HistoricalMarketAdapter(data, clock, primary_symbol="ETHUSDT").snapshot()

    assert len(snapshot["realized_funding"]["ETHUSDT"]) == 1
    assert snapshot["realized_funding"]["ETHUSDT"][0]["fundingTime"] == HOUR_MS


def test_dataset_views_cannot_mutate_manifest_or_internal_funding():
    info = exchange_info("ETHUSDT")
    funding = {"ETHUSDT": [{"fundingTime": HOUR_MS, "fundingRate": "0.0001", "markPrice": "100"}]}
    data = HistoricalDataset(
        exchange_info=info,
        rows_by_symbol={"ETHUSDT": {"1h": [row(0, HOUR_MS)], "4h": [], "1d": []}},
        funding_rows_by_symbol=funding,
        retrieved_at_ms=123,
    )
    before = data.manifest()

    info["symbols"][0]["status"] = "MUTATED_CALLER_INPUT"
    funding["ETHUSDT"][0]["fundingRate"] = "9"
    info_view = data.exchange_info
    info_view["symbols"][0]["status"] = "MUTATED_VIEW"
    funding_view = data.funding_rows("ETHUSDT")
    funding_view[0]["fundingRate"] = "8"

    assert data.manifest() == before
    assert data.exchange_info["symbols"][0]["status"] == "TRADING"
    assert data.funding_rows("ETHUSDT")[0]["fundingRate"] == "0.0001"


def test_manifest_explicitly_surfaces_native_interval_gaps():
    data = dataset({
        "ETHUSDT": {
            "1h": [row(0, HOUR_MS), row(2 * HOUR_MS, 3 * HOUR_MS)],
            "4h": [row(0, 4 * HOUR_MS), row(8 * HOUR_MS, 12 * HOUR_MS)],
            "1d": [],
        }
    })
    manifest = data.manifest()["datasets"]["ETHUSDT"]

    assert manifest["1h"]["gap_count"] == 1
    assert manifest["1h"]["missing_bar_count"] == 1
    assert manifest["1h"]["gaps"][0]["expected_delta_ms"] == HOUR_MS
    assert manifest["1h"]["gaps"][0]["actual_delta_ms"] == 2 * HOUR_MS
    assert manifest["4h"]["gap_count"] == 1
    assert manifest["4h"]["missing_bar_count"] == 1
    assert manifest["1d"]["gap_count"] == 0


def test_funding_for_unknown_symbol_is_rejected():
    with pytest.raises(ValueError, match="funding symbol missing from historical rows"):
        HistoricalDataset(
            exchange_info=exchange_info("ETHUSDT"),
            rows_by_symbol={"ETHUSDT": {"1h": [], "4h": [], "1d": []}},
            funding_rows_by_symbol={"BTCUSDT": [{"fundingTime": HOUR_MS, "fundingRate": "0.0001"}]},
            retrieved_at_ms=123,
        )
