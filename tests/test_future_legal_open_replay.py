from pathlib import Path

import pytest

from backtest.historical_clock import HOUR_MS, HistoricalClock
from backtest.historical_market import HistoricalDataset, HistoricalMarketAdapter
from foxyya.ledger import EventLedger
from foxyya.runner import ForwardRunner
from foxyya.setups import SignalDecision


def _row(open_ms, *, open_=100.0, close=100.0):
    return [
        int(open_ms),
        str(open_),
        str(max(open_, close) + 1.0),
        str(min(open_, close) - 1.0),
        str(close),
        "100",
        int(open_ms + HOUR_MS - 1),
        "1000000",
    ]


def _exchange_info():
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


def test_real_shared_core_rejects_backfill_and_fills_only_precommitted_future_open(tmp_path: Path):
    decision_close_ms = 10 * HOUR_MS - 1
    decision_persist_ms = 10 * HOUR_MS + 1
    scheduled_open_ms = 11 * HOUR_MS

    rows_1h = [_row(i * HOUR_MS, open_=100 + i * 0.01, close=100 + i * 0.01) for i in range(12)]
    # The 11H candle intentionally has a wildly different unfinished close.
    rows_1h[11] = _row(11 * HOUR_MS, open_=101.0, close=999.0)

    dataset = HistoricalDataset(
        exchange_info=_exchange_info(),
        rows_by_symbol={"ETHUSDT": {"1h": rows_1h, "4h": [], "1d": []}},
        funding_rows_by_symbol={},
        retrieved_at_ms=13 * HOUR_MS,
    )
    clock = HistoricalClock(decision_persist_ms, 12 * HOUR_MS)
    market = HistoricalMarketAdapter(dataset, clock, primary_symbol="ETHUSDT")
    ledger = EventLedger(tmp_path / "events.sqlite")
    runner = ForwardRunner(ledger, initial_nav=1000.0)

    decision = SignalDecision(
        symbol="ETHUSDT",
        side="LONG",
        family="A",
        qualified=True,
        reason="TEST",
        rank=1,
        regime="TREND",
        signal_id="phase2-test-signal",
        decision_close_ms=decision_close_ms,
        stop=90.0,
        trigger=100.0,
    )

    try:
        intent = runner.execution.create_intent(
            decision,
            decision_persist_ms=decision_persist_ms,
            reference_price=100.0,
            step=0.001,
            bucket="ETH_BETA",
        )
        assert intent["kind"] == "INTENT_CREATED"
        assert intent["scheduled_open_ms"] == scheduled_open_ms
        assert intent["scheduled_open_ms"] > intent["decision_persist_ms"]

        with pytest.raises(ValueError, match="fill timestamp must equal precommitted future open"):
            runner.execution.fill_due_intent(
                intent["intent_id"],
                10 * HOUR_MS,
                100.0,
                observed_ms=10 * HOUR_MS + 1,
            )
        assert [e for e in ledger.events() if e.get("kind") == "PAPER_ENTRY"] == []

        clock.advance_to(scheduled_open_ms - 1)
        preopen_snapshot = market.snapshot()
        revalidated = runner.revalidate(preopen_snapshot, now_ms=clock.now_ms)
        assert len(revalidated) == 1
        assert revalidated[0]["kind"] == "INTENT_REVALIDATED"
        assert revalidated[0]["observed_ms"] < scheduled_open_ms

        clock.advance_to(scheduled_open_ms + 1)
        open_snapshot = market.snapshot()
        visible_1h = open_snapshot["klines"]["ETHUSDT"]["1h"]
        assert all(bar["close"] != 999.0 for bar in visible_1h)
        assert open_snapshot["hour_open_prices"]["ETHUSDT"] == 101.0

        fills = runner.execute_open(
            open_snapshot,
            open_ms=scheduled_open_ms,
            observed_ms=clock.now_ms,
        )
        assert len(fills) == 1
        assert fills[0]["kind"] == "PAPER_ENTRY"
        assert fills[0]["fill_ms"] == scheduled_open_ms
        assert fills[0]["fill_ms"] > decision_persist_ms
        assert fills[0]["real_orders"] is False

        entries = [e for e in ledger.events() if e.get("kind") == "PAPER_ENTRY"]
        assert len(entries) == 1
        assert ledger.verify() is True
    finally:
        ledger.close()
