import hashlib
import json
from pathlib import Path

import pytest

from backtest.historical_clock import HistoricalClock
from backtest.historical_market import HistoricalMarketAdapter
from foxyya.execution import HOUR
from foxyya.runner import ForwardRunner


def _exchange_info():
    return {
        "symbols": [{
            "symbol": "ETHUSDT",
            "baseAsset": "ETH",
            "quoteAsset": "USDT",
            "status": "TRADING",
            "contractType": "PERPETUAL",
            "onboardDate": 0,
            "filters": [{"filterType": "LOT_SIZE", "stepSize": "0.001"}],
        }]
    }


def _rows(interval_ms: int, count: int, end_ms: int):
    start = end_ms - count * interval_ms
    rows = []
    for index in range(count):
        open_ms = start + index * interval_ms
        close_ms = open_ms + interval_ms - 1
        close = 100 + index * 2
        rows.append([
            open_ms,
            str(close - 1),
            str(close + 1),
            str(close - 2),
            str(close),
            "100",
            close_ms,
            "10000000",
            100,
            "50",
            "5000000",
            "0",
        ])
    return rows


def _adapter(end_ms: int):
    data = {
        "ETHUSDT": {
            "1h": _rows(HOUR, 80, end_ms),
            "4h": _rows(4 * HOUR, 80, end_ms),
            "1d": _rows(24 * HOUR, 80, end_ms),
        }
    }
    return HistoricalMarketAdapter(
        HistoricalClock(end_ms),
        _exchange_info(),
        data,
        trade_symbols=("ETHUSDT",),
    )


def _event_digest(events: list[dict]) -> str:
    raw = json.dumps(events, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    return hashlib.sha256(raw).hexdigest()


def test_research_ledger_rejects_canonical_production_path():
    from backtest.research_ledger import PRODUCTION_LEDGER_PATH, ResearchLedger

    with pytest.raises(ValueError, match="production paper ledger"):
        ResearchLedger(PRODUCTION_LEDGER_PATH)


def test_historical_replay_wraps_the_production_forward_runner(tmp_path: Path):
    from backtest.replay_engine import HistoricalReplayEngine

    engine = HistoricalReplayEngine(_adapter(100 * 24 * HOUR), tmp_path / "research.sqlite", initial_nav=1000)
    try:
        assert type(engine.runner) is ForwardRunner
        assert engine.mode == "HISTORICAL_BACKTEST"
        assert engine.real_orders is False
    finally:
        engine.close()


def test_identical_history_produces_identical_event_sequence(tmp_path: Path):
    from backtest.replay_engine import HistoricalReplayEngine

    end_ms = 100 * 24 * HOUR
    first = HistoricalReplayEngine(_adapter(end_ms), tmp_path / "first.sqlite", initial_nav=1000)
    second = HistoricalReplayEngine(_adapter(end_ms), tmp_path / "second.sqlite", initial_nav=1000)
    try:
        first_result = first.cycle_at(end_ms)
        second_result = second.cycle_at(end_ms)

        assert first_result["data_manifest_sha256"] == second_result["data_manifest_sha256"]
        assert first_result["event_digest"] == second_result["event_digest"]
        assert _event_digest(first.ledger.events()) == _event_digest(second.ledger.events())
        assert first.ledger.verify() is True
        assert second.ledger.verify() is True
    finally:
        first.close()
        second.close()
