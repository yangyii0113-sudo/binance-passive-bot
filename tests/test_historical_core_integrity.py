from __future__ import annotations

import hashlib
import json
from pathlib import Path

from backtest.historical_clock import HistoricalClock, HOUR_MS
from backtest.historical_market import HistoricalDataset, HistoricalMarketAdapter
from backtest.research_ledger import PRODUCTION_LEDGER, ResearchLedgerFactory, deterministic_run_id
from foxyya import VERSION


def _row(open_ms, close_ms, open_=100, close=101, quote_volume=1_000_000):
    return [
        open_ms,
        str(open_),
        str(max(open_, close) + 2),
        str(min(open_, close) - 2),
        str(close),
        "100",
        close_ms,
        str(quote_volume),
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


def _canonical_bytes(value) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")


def test_historical_core_is_deterministic_no_lookahead_and_ledger_isolated(tmp_path: Path):
    dataset = HistoricalDataset(
        exchange_info=_exchange_info(),
        rows_by_symbol={
            "ETHUSDT": {
                "1h": [
                    _row(0, HOUR_MS, open_=100, close=101),
                    _row(HOUR_MS, 2 * HOUR_MS, open_=101, close=102),
                    _row(2 * HOUR_MS, 3 * HOUR_MS, open_=102, close=999),
                ],
                "4h": [_row(0, 4 * HOUR_MS, open_=100, close=104)],
                "1d": [_row(0, 24 * HOUR_MS, open_=100, close=110)],
            }
        },
        funding_rows_by_symbol={
            "ETHUSDT": [
                {"fundingTime": HOUR_MS, "fundingRate": "0.0001", "markPrice": "101"},
                {"fundingTime": 3 * HOUR_MS, "fundingRate": "0.0002", "markPrice": "103"},
            ]
        },
        retrieved_at_ms=10 * HOUR_MS,
    )
    clock = HistoricalClock(0, 30 * HOUR_MS, now_ms=2 * HOUR_MS - 1)
    market = HistoricalMarketAdapter(dataset, clock, primary_symbol="ETHUSDT")

    before = market.snapshot()
    assert len(before["klines"]["ETHUSDT"]["1h"]) == 1
    assert before["klines"]["ETHUSDT"]["4h"] == []
    assert before["klines"]["ETHUSDT"]["1d"] == []
    assert before["marks"]["ETHUSDT"] == 101.0

    clock.advance_to(2 * HOUR_MS)
    after = market.snapshot()
    assert len(after["klines"]["ETHUSDT"]["1h"]) == 2
    assert after["klines"]["ETHUSDT"]["1h"][-1]["close"] == 102.0
    assert all(bar["close"] != 999.0 for bar in after["klines"]["ETHUSDT"]["1h"])
    assert len(after["realized_funding"]["ETHUSDT"]) == 1

    manifest = dataset.manifest()
    manifest_path = tmp_path / "data_manifest.json"
    manifest_path.write_bytes(_canonical_bytes(manifest))
    manifest_sha = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    dataset_hashes = {
        interval: record["sha256"]
        for interval, record in manifest["datasets"]["ETHUSDT"].items()
        if "sha256" in record
    }

    run_config = {
        "mode": "HISTORICAL BACKTEST",
        "label": "歷史模擬・非 Forward Performance",
        "primary_symbol": "ETHUSDT",
        "mark_proxy": after["historical_provenance"]["mark_proxy"],
        "manifest_sha256": manifest_sha,
    }
    run_id = deterministic_run_id(
        strategy_version=VERSION,
        git_sha="phase1-integrity-fixture",
        symbol="ETHUSDT",
        start_ms=0,
        end_ms=30 * HOUR_MS,
        config=run_config,
    )
    assert run_id == deterministic_run_id(
        strategy_version=VERSION,
        git_sha="phase1-integrity-fixture",
        symbol="ETHUSDT",
        start_ms=0,
        end_ms=30 * HOUR_MS,
        config=run_config,
    )

    root = tmp_path / "artifacts" / "backtests"
    ledger, ledger_path = ResearchLedgerFactory(root).open(run_id)
    try:
        ledger.append({
            "event_id": f"run-start:{run_id}",
            "kind": "BACKTEST_RUN_STARTED",
            "run_id": run_id,
            "mode": "HISTORICAL BACKTEST",
            "strategy_version": VERSION,
            "git_sha": "phase1-integrity-fixture",
            "symbol": "ETHUSDT",
            "start_ms": 0,
            "end_ms": 30 * HOUR_MS,
            "manifest_sha256": manifest_sha,
            "input_hashes": dataset_hashes,
            "paper_only": True,
            "real_orders": False,
        })
        assert ledger.verify() is True
        event = ledger.events()[0]
        assert event["run_id"] == run_id
        assert event["paper_only"] is True
        assert event["real_orders"] is False
        assert event["manifest_sha256"] == manifest_sha
    finally:
        ledger.close()

    resolved_root = root.resolve()
    assert ledger_path == (resolved_root / run_id / "events.sqlite").resolve()
    assert ledger_path.is_relative_to(resolved_root)
    assert ledger_path != PRODUCTION_LEDGER.resolve()
    assert PRODUCTION_LEDGER.resolve() not in ledger_path.parents
