from __future__ import annotations

from backtest.binance_history import BinancePublicHistoryClient, HOUR_MS, DAY_MS, fetch_study_inputs


def _kline(open_ms: int, price: float = 100.0):
    return [open_ms, str(price), str(price + 2), str(price - 2), str(price + 1), "10", open_ms + HOUR_MS - 1, "10000000", 10, "5", "5000000", "0"]


def test_client_rejects_any_path_outside_explicit_public_allowlist():
    called = []
    client = BinancePublicHistoryClient(transport=lambda path, params: called.append((path, params)))
    try:
        client._get("/fapi/v1/order", {})
        assert False, "private/signed endpoint must be rejected"
    except ValueError as exc:
        assert "public historical endpoint" in str(exc)
    assert called == []


def test_kline_pagination_is_monotonic_and_duplicate_rows_fail_closed():
    pages = {
        0: [_kline(0), _kline(HOUR_MS)],
        2 * HOUR_MS: [_kline(2 * HOUR_MS), _kline(3 * HOUR_MS)],
        4 * HOUR_MS: [],
    }

    def transport(path, params):
        assert path == "/fapi/v1/klines"
        return pages[int(params["startTime"])]

    client = BinancePublicHistoryClient(transport=transport, page_limit=2)
    rows = client.klines("ETHUSDT", "1h", start_ms=0, end_ms=4 * HOUR_MS)
    assert [int(row[0]) for row in rows] == [0, HOUR_MS, 2 * HOUR_MS, 3 * HOUR_MS]

    duplicate_client = BinancePublicHistoryClient(
        transport=lambda path, params: [_kline(0), _kline(0)], page_limit=1500
    )
    try:
        duplicate_client.klines("ETHUSDT", "1h", start_ms=0, end_ms=HOUR_MS)
        assert False, "duplicate timestamp must fail closed"
    except ValueError as exc:
        assert "duplicate" in str(exc).lower()


def test_funding_pagination_is_monotonic():
    def transport(path, params):
        start = int(params["startTime"])
        if start == 0:
            return [
                {"symbol": "ETHUSDT", "fundingTime": 1000, "fundingRate": "0.0001", "markPrice": "100"},
                {"symbol": "ETHUSDT", "fundingTime": 2000, "fundingRate": "0.0002", "markPrice": "101"},
            ]
        return []

    client = BinancePublicHistoryClient(transport=transport, funding_page_limit=2)
    rows = client.funding("ETHUSDT", start_ms=0, end_ms=3000)
    assert [int(x["fundingTime"]) for x in rows] == [1000, 2000]


def test_fetch_study_inputs_trades_only_eth_but_keeps_btc_eth_sol_context():
    end_ms = 24 * HOUR_MS
    execution_start = end_ms - DAY_MS

    class FakeClient:
        def exchange_info(self):
            return {
                "symbols": [
                    {"symbol": "BTCUSDT", "baseAsset": "BTC", "quoteAsset": "USDT", "status": "TRADING", "contractType": "PERPETUAL"},
                    {"symbol": "ETHUSDT", "baseAsset": "ETH", "quoteAsset": "USDT", "status": "TRADING", "contractType": "PERPETUAL"},
                    {"symbol": "SOLUSDT", "baseAsset": "SOL", "quoteAsset": "USDT", "status": "TRADING", "contractType": "PERPETUAL"},
                ]
            }

        def klines(self, symbol, interval, *, start_ms, end_ms):
            step = {"1h": HOUR_MS, "4h": 4 * HOUR_MS, "1d": DAY_MS}[interval]
            return [
                [t, "100", "102", "98", "101", "10", t + step - 1, "10000000", 10, "5", "5000000", "0"]
                for t in range(start_ms, end_ms, step)
            ]

        def funding(self, symbol, *, start_ms, end_ms):
            return []

    payload = fetch_study_inputs(
        client=FakeClient(), end_ms=end_ms, execution_days=1, warmup_days=0, retrieved_at_ms=1234
    )
    assert payload["execution_start_ms"] == execution_start
    assert payload["end_ms"] == end_ms
    assert [x["symbol"] for x in payload["exchange_info"]["symbols"]] == ["ETHUSDT"]
    assert sorted(payload["rows_by_symbol"]) == ["BTCUSDT", "ETHUSDT", "SOLUSDT"]
    assert len(payload["rows_by_symbol"]["ETHUSDT"]["1h"]) == 24
    assert payload["source_family"] == "Binance USD-M Public Data"


def test_fetch_study_inputs_fails_if_execution_eth_hour_is_missing():
    end_ms = 24 * HOUR_MS

    class MissingHourClient:
        def exchange_info(self):
            return {"symbols": [{"symbol": "ETHUSDT", "baseAsset": "ETH", "quoteAsset": "USDT", "status": "TRADING", "contractType": "PERPETUAL"}]}

        def klines(self, symbol, interval, *, start_ms, end_ms):
            step = {"1h": HOUR_MS, "4h": 4 * HOUR_MS, "1d": DAY_MS}[interval]
            rows = [[t, "100", "102", "98", "101", "10", t + step - 1, "10000000", 10, "5", "5000000", "0"] for t in range(start_ms, end_ms, step)]
            if symbol == "ETHUSDT" and interval == "1h":
                rows = [r for r in rows if int(r[0]) != 12 * HOUR_MS]
            return rows

        def funding(self, symbol, *, start_ms, end_ms):
            return []

    try:
        fetch_study_inputs(client=MissingHourClient(), end_ms=end_ms, execution_days=1, warmup_days=0, retrieved_at_ms=1)
        assert False, "missing required execution hour must fail closed"
    except ValueError as exc:
        assert "missing required execution 1h open" in str(exc)
