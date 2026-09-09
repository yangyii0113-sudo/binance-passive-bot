from __future__ import annotations

import csv
import io
import zipfile
from datetime import datetime, timezone
from urllib.error import HTTPError

from backtest.binance_history import (
    BinancePublicDataArchiveClient,
    BinancePublicHistoryClient,
    HOUR_MS,
    DAY_MS,
    fetch_study_inputs,
)


def _kline(open_ms: int, price: float = 100.0):
    return [open_ms, str(price), str(price + 2), str(price - 2), str(price + 1), "10", open_ms + HOUR_MS - 1, "10000000", 10, "5", "5000000", "0"]


def _zip_csv(name: str, rows: list[list | tuple]) -> bytes:
    stream = io.StringIO()
    writer = csv.writer(stream, lineterminator="\n")
    writer.writerows(rows)
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(name, stream.getvalue().encode("utf-8"))
    return out.getvalue()


def _utc_ms(year, month, day, hour=0):
    return int(datetime(year, month, day, hour, tzinfo=timezone.utc).timestamp() * 1000)


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


def test_official_archive_parses_monthly_klines_and_funding_schema():
    aug = _utc_ms(2026, 8, 1)
    sep = _utc_ms(2026, 9, 1)
    downloads = []

    def download(url):
        downloads.append(url)
        if "/monthly/klines/ETHUSDT/1h/" in url:
            return _zip_csv(
                "ETHUSDT-1h-2026-08.csv",
                [["open_time","open","high","low","close","volume","close_time","quote_volume","count","taker_buy_volume","taker_buy_quote_volume","ignore"], _kline(aug)],
            )
        if "/monthly/fundingRate/ETHUSDT/" in url:
            return _zip_csv(
                "ETHUSDT-fundingRate-2026-08.csv",
                [["calc_time","last_funding_rate"], [aug + 8 * HOUR_MS, "0.0001"], [aug + 16 * HOUR_MS, "-0.0002"]],
            )
        return None

    client = BinancePublicDataArchiveClient(download=download)
    rows = client.klines("ETHUSDT", "1h", start_ms=aug, end_ms=sep)
    assert [int(row[0]) for row in rows] == [aug]
    funding = client.funding("ETHUSDT", start_ms=aug, end_ms=sep)
    assert [int(x["fundingTime"]) for x in funding] == [aug + 8 * HOUR_MS, aug + 16 * HOUR_MS]
    assert [x["fundingRate"] for x in funding] == ["0.0001", "-0.0002"]
    assert all(x["symbol"] == "ETHUSDT" for x in funding)
    assert any("ETHUSDT-1h-2026-08.zip" in url for url in downloads)
    assert any("ETHUSDT-fundingRate-2026-08.zip" in url for url in downloads)


def test_official_archive_uses_daily_files_for_incomplete_last_month_and_safe_end_boundary():
    sep1 = _utc_ms(2026, 9, 1)
    sep2 = _utc_ms(2026, 9, 2)
    sep9_10h = _utc_ms(2026, 9, 9, 10)
    downloads = []

    def download(url):
        downloads.append(url)
        if "ETHUSDT-1h-2026-09-01.zip" in url:
            return _zip_csv("ETHUSDT-1h-2026-09-01.csv", [_kline(sep1)])
        return None

    client = BinancePublicDataArchiveClient(download=download)
    assert client.resolve_end_ms(sep9_10h) == _utc_ms(2026, 9, 9)
    rows = client.klines("ETHUSDT", "1h", start_ms=sep1, end_ms=sep2)
    assert [int(row[0]) for row in rows] == [sep1]
    assert any("/daily/klines/ETHUSDT/1h/ETHUSDT-1h-2026-09-01.zip" in url for url in downloads)


def test_geo_blocked_rest_fails_over_to_official_archive_and_records_lag():
    requested_end = _utc_ms(2026, 9, 9, 10)
    archive_end = _utc_ms(2026, 9, 9)

    class GeoBlockedRest:
        retrieval_mode = "BINANCE_REST"
        def exchange_info(self):
            raise HTTPError("https://fapi.binance.com/fapi/v1/exchangeInfo", 451, "Unavailable For Legal Reasons", {}, None)

    class ArchiveFixture:
        retrieval_mode = "BINANCE_OFFICIAL_PUBLIC_ARCHIVE"
        exchange_info_source = "VERIFIED_ETHUSDT_EXCHANGE_INFO_SNAPSHOT_2026-09-09"
        def resolve_end_ms(self, value):
            return archive_end
        def exchange_info(self):
            return {"symbols": [{"symbol":"ETHUSDT","baseAsset":"ETH","quoteAsset":"USDT","status":"TRADING","contractType":"PERPETUAL","onboardDate":1598252400000,"filters":[{"filterType":"LOT_SIZE","stepSize":"0.001"}]}]}
        def klines(self, symbol, interval, *, start_ms, end_ms):
            step={"1h":HOUR_MS,"4h":4*HOUR_MS,"1d":DAY_MS}[interval]
            return [[t,"100","101","99","100","10",t+step-1,"10000000",1,"5","5000000","0"] for t in range(start_ms,end_ms,step)]
        def funding(self, symbol, *, start_ms, end_ms):
            return []

    payload = fetch_study_inputs(
        client=GeoBlockedRest(), fallback_client=ArchiveFixture(), end_ms=requested_end,
        execution_days=1, warmup_days=0, retrieved_at_ms=requested_end,
    )
    assert payload["end_ms"] == archive_end
    assert payload["requested_end_ms"] == requested_end
    assert payload["data_lag_ms"] == requested_end - archive_end
    assert payload["retrieval_mode"] == "BINANCE_OFFICIAL_PUBLIC_ARCHIVE"
    assert payload["exchange_info_source"] == "VERIFIED_ETHUSDT_EXCHANGE_INFO_SNAPSHOT_2026-09-09"
    assert payload["source_family"] == "Binance USD-M Public Data"


def test_fetch_study_inputs_trades_only_eth_but_keeps_btc_eth_sol_context():
    end_ms = 24 * HOUR_MS
    execution_start = end_ms - DAY_MS

    class FakeClient:
        retrieval_mode = "TEST_FIXTURE"
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
        retrieval_mode = "TEST_FIXTURE"
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
