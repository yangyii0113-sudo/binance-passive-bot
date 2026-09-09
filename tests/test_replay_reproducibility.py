import hashlib
import json
from pathlib import Path

from backtest.historical_clock import HOUR_MS, HistoricalClock
from backtest.historical_market import HistoricalDataset, HistoricalMarketAdapter
from backtest.replay_engine import HistoricalReplayEngine
from backtest.research_ledger import ResearchLedgerFactory
from foxyya import VERSION


def _row(open_ms, duration_ms, *, price=100.0, quote_volume=1000.0):
    close_ms = open_ms + duration_ms - 1
    return [
        int(open_ms),
        str(price),
        str(price + 1.0),
        str(price - 1.0),
        str(price + 0.1),
        "100",
        int(close_ms),
        str(quote_volume),
    ]


def _dataset():
    # Warm-up comfortably exceeds the Phase 2 minimums while keeping the
    # synthetic ticker intentionally below the production liquidity gate.
    rows_1h = [_row(i * HOUR_MS, HOUR_MS, price=100 + i * 0.001) for i in range(170)]
    rows_4h = [_row(i * 4 * HOUR_MS, 4 * HOUR_MS, price=100 + i * 0.004) for i in range(55)]
    rows_1d = [_row(i * 24 * HOUR_MS, 24 * HOUR_MS, price=100 + i * 0.024) for i in range(22)]
    exchange_info = {
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
    return HistoricalDataset(
        exchange_info=exchange_info,
        rows_by_symbol={
            "ETHUSDT": {
                "1h": rows_1h,
                "4h": rows_4h,
                "1d": rows_1d,
            }
        },
        funding_rows_by_symbol={"ETHUSDT": []},
        retrieved_at_ms=200 * HOUR_MS,
    )


def _canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def _manifest_sha(dataset):
    return hashlib.sha256(_canonical(dataset.manifest()).encode("utf-8")).hexdigest()


def _run(root: Path, *, run_id: str):
    start = 160 * HOUR_MS
    end = 163 * HOUR_MS
    dataset = _dataset()
    clock = HistoricalClock(start, end)
    market = HistoricalMarketAdapter(dataset, clock, primary_symbol="ETHUSDT")
    ledger, _ = ResearchLedgerFactory(root).open(run_id)
    try:
        engine = HistoricalReplayEngine(clock, market, ledger, initial_nav=1000.0)
        summary = engine.run(
            start_ms=start,
            end_ms=end,
            run_id=run_id,
            strategy_version=VERSION,
            git_sha="phase2-repro-sha",
        )
        events = ledger.events()
        assert ledger.verify() is True
        return summary, events, _manifest_sha(dataset)
    finally:
        ledger.close()


def test_identical_replay_inputs_produce_identical_events_and_manifest_provenance(tmp_path: Path):
    run_id = "bt-phase2-reproducible"
    summary_a, events_a, expected_manifest_sha = _run(tmp_path / "a", run_id=run_id)
    summary_b, events_b, expected_manifest_sha_b = _run(tmp_path / "b", run_id=run_id)

    assert expected_manifest_sha == expected_manifest_sha_b
    assert events_a == events_b
    assert summary_a == summary_b

    assert summary_a["manifest_sha256"] == expected_manifest_sha
    started = next(e for e in events_a if e["kind"] == "BACKTEST_RUN_STARTED")
    completed = next(e for e in events_a if e["kind"] == "BACKTEST_RUN_COMPLETED")
    assert started["manifest_sha256"] == expected_manifest_sha
    assert completed["manifest_sha256"] == expected_manifest_sha

    assert started["strategy_version"] == VERSION
    assert started["git_sha"] == "phase2-repro-sha"
    assert started["mode"] == "HISTORICAL BACKTEST"
    assert started["paper_only"] is True
    assert started["real_orders"] is False

    assert all(event.get("real_orders") is not True for event in events_a)
    intents = {e["intent_id"]: e for e in events_a if e.get("kind") == "INTENT_CREATED"}
    for entry in (e for e in events_a if e.get("kind") == "PAPER_ENTRY"):
        assert entry["fill_ms"] > intents[entry["intent_id"]]["decision_persist_ms"]
        assert entry["fill_ms"] < 163 * HOUR_MS

    assert summary_a["clock_end_ms"] < 163 * HOUR_MS
