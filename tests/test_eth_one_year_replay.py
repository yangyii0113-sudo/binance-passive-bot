from __future__ import annotations

import json
from pathlib import Path

import backtest.cli as cli
from backtest.binance_history import DAY_MS, HOUR_MS
from backtest.cli import run_eth_365_study


def _rows(start_ms: int, end_ms: int, step: int):
    rows = []
    for t in range(start_ms, end_ms, step):
        # Flat market intentionally prevents trend-aligned entries in this deterministic fixture.
        rows.append([t, "100", "101", "99", "100", "10", t + step - 1, "10000000", 10, "5", "5000000", "0"])
    return rows


def _payload(end_ms: int, execution_days: int, warmup_days: int):
    execution_start = end_ms - execution_days * DAY_MS
    warmup_start = execution_start - warmup_days * DAY_MS
    exchange_info = {
        "symbols": [{
            "symbol": "ETHUSDT", "baseAsset": "ETH", "quoteAsset": "USDT", "status": "TRADING",
            "contractType": "PERPETUAL", "onboardDate": 0,
            "filters": [{"filterType": "LOT_SIZE", "stepSize": "0.001"}],
        }]
    }
    rows_by_symbol = {}
    for symbol in ("BTCUSDT", "ETHUSDT", "SOLUSDT"):
        rows_by_symbol[symbol] = {
            "1h": _rows(warmup_start, end_ms, HOUR_MS),
            "4h": _rows(warmup_start, end_ms, 4 * HOUR_MS),
            "1d": _rows(warmup_start, end_ms, DAY_MS),
        }
    return {
        "schema": "foxyya-binance-study-input/1",
        "source_family": "Binance USD-M Public Data",
        "retrieval_mode": "TEST_FIXTURE",
        "exchange_info_source": "TEST_FIXTURE",
        "retrieved_at_ms": 123456789,
        "requested_end_ms": end_ms,
        "data_lag_ms": 0,
        "execution_start_ms": execution_start,
        "warmup_start_ms": warmup_start,
        "end_ms": end_ms,
        "execution_days": execution_days,
        "warmup_days": warmup_days,
        "tradable_symbols": ["ETHUSDT"],
        "context_symbols": ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
        "exchange_info": exchange_info,
        "rows_by_symbol": rows_by_symbol,
        "funding_rows_by_symbol": {"BTCUSDT": [], "ETHUSDT": [], "SOLUSDT": []},
    }


def test_study_runner_writes_complete_artifacts_and_excludes_warmup_from_event_window(tmp_path: Path):
    end_ms = 1000 * DAY_MS
    execution_days = 1
    warmup_days = 60
    payload = _payload(end_ms, execution_days, warmup_days)

    result = run_eth_365_study(
        output_root=tmp_path,
        now_ms=end_ms + 12345,
        input_payload=payload,
        execution_days=execution_days,
        warmup_days=warmup_days,
        git_sha="fixture-git-sha",
    )

    run_dir = Path(result["run_dir"])
    assert run_dir.parent == tmp_path
    assert result["status"] == "SUCCESS"
    assert result["symbol"] == "ETHUSDT"
    assert result["integrity"]["backfill_count"] == 0
    assert result["integrity"]["duplicate_fills"] == 0
    assert result["integrity"]["ledger_integrity"] is True

    expected = {"events.sqlite", "input_data.json", "data_manifest.json", "run_config.json", "metrics.json", "report.json", "report.md"}
    assert expected <= {p.name for p in run_dir.iterdir()}

    config = json.loads((run_dir / "run_config.json").read_text(encoding="utf-8"))
    assert config["start_ms"] == end_ms - DAY_MS
    assert config["end_ms"] == end_ms
    assert config["warmup_start_ms"] == end_ms - (1 + warmup_days) * DAY_MS
    assert config["paper_only"] is True
    assert config["real_orders"] is False
    assert config["git_sha"] == "fixture-git-sha"
    assert len(config["manifest_sha256"]) == 64
    assert "+08:00" in config["execution_start_taipei"]

    metrics = json.loads((run_dir / "metrics.json").read_text(encoding="utf-8"))
    assert metrics["mode"] == "HISTORICAL BACKTEST"
    assert metrics["performance"]["closed_trades"] == 0
    assert metrics["start_ms"] == end_ms - DAY_MS
    assert metrics["end_ms"] == end_ms

    report = json.loads((run_dir / "report.json").read_text(encoding="utf-8"))
    assert report["label"] == "歷史模擬・非 Forward Performance"
    assert report["execution_fidelity"]["intrabar_path"] == "UNAVAILABLE"


def test_study_runner_accepts_explicit_archive_safe_end_and_records_requested_boundary(monkeypatch, tmp_path: Path):
    archive_end = 1000 * DAY_MS
    requested_end = archive_end + 10 * HOUR_MS
    execution_days = 1
    warmup_days = 60
    payload = _payload(archive_end, execution_days, warmup_days)
    payload["retrieval_mode"] = "BINANCE_OFFICIAL_PUBLIC_ARCHIVE"
    payload["exchange_info_source"] = "VERIFIED_ETHUSDT_EXCHANGE_INFO_SNAPSHOT_2026-09-09"
    payload["requested_end_ms"] = requested_end
    payload["data_lag_ms"] = requested_end - archive_end

    monkeypatch.setattr(cli, "fetch_study_inputs", lambda **kwargs: payload)
    result = cli.run_eth_365_study(
        output_root=tmp_path,
        now_ms=requested_end + 12345,
        input_payload=None,
        execution_days=execution_days,
        warmup_days=warmup_days,
        git_sha="archive-fixture-git-sha",
    )
    config = json.loads((Path(result["run_dir"]) / "run_config.json").read_text(encoding="utf-8"))
    assert config["end_ms"] == archive_end
    assert config["requested_end_ms"] == requested_end
    assert config["data_lag_ms"] == requested_end - archive_end
    assert config["retrieval_mode"] == "BINANCE_OFFICIAL_PUBLIC_ARCHIVE"
    assert config["exchange_info_source"] == "VERIFIED_ETHUSDT_EXCHANGE_INFO_SNAPSHOT_2026-09-09"
