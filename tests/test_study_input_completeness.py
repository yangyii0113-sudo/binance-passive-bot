from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone

import pytest

from backtest.binance_history import (
    CONTEXT_SYMBOLS,
    DAY_MS,
    HOUR_MS,
    INTERVAL_MS,
    BinancePublicDataArchiveClient,
    fetch_study_inputs,
)


def _utc_ms(year, month, day, hour=0):
    return int(datetime(year, month, day, hour, tzinfo=timezone.utc).timestamp() * 1000)


class CompleteFixture:
    retrieval_mode = "TEST_FIXTURE"

    def exchange_info(self):
        return {"symbols": [{"symbol": "ETHUSDT"}]}

    def klines(self, symbol, interval, *, start_ms, end_ms):
        step = INTERVAL_MS[interval]
        first = ((start_ms + step - 1) // step) * step
        return [[t, "100", "102", "98", "101", "10", t + step - 1, "10000000"]
                for t in range(first, end_ms, step)]

    def funding(self, symbol, *, start_ms, end_ms):
        step = 8 * HOUR_MS
        first = ((start_ms + step - 1) // step) * step
        return [{"symbol": symbol, "fundingTime": t + (t // step) % 4,
                 "fundingRate": "0.0001"}
                for t in range(first, end_ms, step)]


def _fetch(client=None, *, end_ms=3 * DAY_MS, execution_days=1, warmup_days=1):
    return fetch_study_inputs(client=client or CompleteFixture(), end_ms=end_ms,
                              execution_days=execution_days, warmup_days=warmup_days,
                              retrieved_at_ms=end_ms)


@pytest.mark.parametrize("symbol", CONTEXT_SYMBOLS)
@pytest.mark.parametrize("interval", INTERVAL_MS)
@pytest.mark.parametrize("in_warmup", [True, False])
def test_missing_native_bar_in_any_required_series_fails_closed(symbol, interval, in_warmup):
    class MissingBar(CompleteFixture):
        def klines(self, requested_symbol, requested_interval, **window):
            rows = super().klines(requested_symbol, requested_interval, **window)
            if (requested_symbol, requested_interval) == (symbol, interval):
                missing_open = DAY_MS if in_warmup else 2 * DAY_MS
                return [row for row in rows if row[0] != missing_open]
            return rows

    with pytest.raises(ValueError, match="missing required"):
        _fetch(MissingBar())


@pytest.mark.parametrize("symbol", CONTEXT_SYMBOLS)
@pytest.mark.parametrize("interval", INTERVAL_MS)
def test_empty_required_native_series_fails_closed(symbol, interval):
    class EmptySeries(CompleteFixture):
        def klines(self, requested_symbol, requested_interval, **window):
            if (requested_symbol, requested_interval) == (symbol, interval):
                return []
            return super().klines(requested_symbol, requested_interval, **window)

    with pytest.raises(ValueError, match="missing required"):
        _fetch(EmptySeries())


@pytest.mark.parametrize("symbol", CONTEXT_SYMBOLS)
@pytest.mark.parametrize("damage", ["empty", "first", "middle", "last", "missing_rate", "nan_rate"])
def test_incomplete_or_unusable_funding_cannot_be_accepted_as_zero(symbol, damage):
    class MissingFunding(CompleteFixture):
        def funding(self, requested_symbol, **window):
            rows = super().funding(requested_symbol, **window)
            if requested_symbol != symbol:
                return rows
            if damage == "empty":
                return []
            if damage in {"first", "middle", "last"}:
                del rows[{"first": 0, "middle": 2, "last": -1}[damage]]
            elif damage == "missing_rate":
                rows[0].pop("fundingRate")
            elif damage == "nan_rate":
                rows[0]["fundingRate"] = "nan"
            return rows

    with pytest.raises(ValueError, match="funding"):
        _fetch(MissingFunding())


@pytest.mark.parametrize("damage", ["misaligned", "wrong_close", "duplicate", "reordered"])
def test_malformed_native_bar_geometry_and_order_fail_closed(damage):
    class BadBars(CompleteFixture):
        def klines(self, symbol, interval, **window):
            rows = super().klines(symbol, interval, **window)
            if (symbol, interval) == ("SOLUSDT", "4h"):
                if damage == "misaligned":
                    rows[0][0] += HOUR_MS
                    rows[0][6] += HOUR_MS
                elif damage == "wrong_close":
                    rows[0][6] -= 1
                elif damage == "duplicate":
                    rows.insert(1, deepcopy(rows[0]))
                else:
                    rows[0], rows[1] = rows[1], rows[0]
            return rows

    with pytest.raises(ValueError, match="kline|native"):
        _fetch(BadBars())


def test_non_midnight_end_only_requires_fully_closed_native_bars_and_preserves_funding_ms():
    class ClosedOnly(CompleteFixture):
        def klines(self, symbol, interval, **window):
            return [row for row in super().klines(symbol, interval, **window)
                    if row[6] < window["end_ms"]]

    end_ms = 3 * DAY_MS + 10 * HOUR_MS
    payload = _fetch(ClosedOnly(), end_ms=end_ms)
    assert payload["end_ms"] == end_ms
    assert any(row["fundingTime"] % HOUR_MS for row in payload["funding_rows_by_symbol"]["BTCUSDT"])
    assert all(row[6] < end_ms for row in payload["rows_by_symbol"]["ETHUSDT"]["1d"])


def test_last_completed_month_is_archive_boundary_and_full_window_length_is_preserved():
    requested = _utc_ms(2026, 9, 9, 10)

    class ArchivedCompleteFixture(CompleteFixture, BinancePublicDataArchiveClient):
        retrieval_mode = BinancePublicDataArchiveClient.retrieval_mode

    payload = _fetch(ArchivedCompleteFixture(), end_ms=requested,
                     execution_days=365, warmup_days=200)
    boundary = _utc_ms(2026, 9, 1)
    assert payload["end_ms"] == boundary
    assert payload["requested_end_ms"] == requested
    assert payload["data_lag_ms"] == requested - boundary
    assert payload["execution_start_ms"] == boundary - 365 * DAY_MS
    assert payload["warmup_start_ms"] == boundary - 565 * DAY_MS
    assert payload["end_boundary_policy"] == "LAST_COMPLETED_UTC_MONTH_WITH_REQUIRED_INPUT_COVERAGE"


def test_missing_monthly_funding_archive_fails_without_silent_daily_tail():
    downloads = []
    client = BinancePublicDataArchiveClient(download=lambda url: downloads.append(url))
    with pytest.raises(ValueError, match="funding.*archive"):
        client.funding("ETHUSDT", start_ms=_utc_ms(2026, 9, 1), end_ms=_utc_ms(2026, 9, 9))
    assert not any("/daily/fundingRate/" in url for url in downloads)
