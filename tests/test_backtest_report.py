from pathlib import Path

from backtest.report import build_report, write_run_artifacts


def test_report_contains_provenance_labels_and_execution_fidelity(tmp_path: Path):
    metrics = {
        "mode": "HISTORICAL BACKTEST",
        "label": "歷史模擬・非 Forward Performance",
        "performance": {"closed_trades": 12, "win_rate": 0.5, "win_rate_n": 12, "net_return": 0.08,
                        "profit_factor": 1.2, "expectancy_r": 0.1, "max_drawdown": 0.06},
        "cost_attribution": {"fees_usdt": 4.0, "slippage_usdt": 3.0, "funding_usdt": -0.5, "net_pnl_usdt": 80.0},
        "segments": {"family": {}, "side": {}, "regime": {}, "book": {}},
        "funnel": {"qualified": 30, "filled": 12, "qualified_to_filled": 0.4},
        "risk": {"max_reserved_risk_fraction": 0.015, "portfolio_cap_fraction": 0.015},
    }
    run_config = {
        "run_id": "bt-test",
        "symbol": "ETHUSDT",
        "strategy_version": "FOXYYA-EXEC-V2-20260908",
        "git_sha": "abc123",
        "execution_start_utc": "2025-09-09T00:00:00+00:00",
        "execution_end_utc": "2026-09-09T00:00:00+00:00",
        "execution_start_taipei": "2025-09-09T08:00:00+08:00",
        "execution_end_taipei": "2026-09-09T08:00:00+08:00",
        "execution_fidelity": "HOURLY_OPEN_AND_FULLY_CLOSED_BAR_SAMPLING",
        "paper_only": True,
        "real_orders": False,
        "manifest_sha256": "a" * 64,
    }
    manifest = {"source_family": "Binance USD-M Public Data", "retrieved_at_ms": 1, "datasets": {}}
    report = build_report(metrics, run_config, manifest)
    assert report["mode"] == "HISTORICAL BACKTEST"
    assert report["label"] == "歷史模擬・非 Forward Performance"
    assert report["provenance"]["run_id"] == "bt-test"
    assert report["provenance"]["git_sha"] == "abc123"
    assert report["execution_fidelity"]["model"] == "HOURLY_OPEN_AND_FULLY_CLOSED_BAR_SAMPLING"
    assert report["execution_fidelity"]["intrabar_path"] == "UNAVAILABLE"


def test_writer_creates_complete_atomic_run_artifact_set(tmp_path: Path):
    run_dir = tmp_path / "bt-test"
    run_dir.mkdir()
    (run_dir / "events.sqlite").write_bytes(b"sqlite-placeholder")
    input_payload = {"rows_by_symbol": {"ETHUSDT": {"1h": []}}}
    manifest = {"source_family": "Binance USD-M Public Data"}
    run_config = {"run_id": "bt-test", "manifest_sha256": "b" * 64}
    metrics = {"mode": "HISTORICAL BACKTEST", "performance": {"closed_trades": 0}}
    report = {"mode": "HISTORICAL BACKTEST", "label": "歷史模擬・非 Forward Performance"}

    paths = write_run_artifacts(
        run_dir,
        input_payload=input_payload,
        manifest=manifest,
        run_config=run_config,
        metrics=metrics,
        report=report,
    )
    expected = {"input_data.json", "data_manifest.json", "run_config.json", "metrics.json", "report.json", "report.md", "events.sqlite"}
    assert expected <= {p.name for p in run_dir.iterdir()}
    assert set(paths) == {"input_data", "manifest", "run_config", "metrics", "report_json", "report_md", "events"}
    text = (run_dir / "report.md").read_text(encoding="utf-8")
    assert "HISTORICAL BACKTEST" in text
    assert "歷史模擬・非 Forward Performance" in text
    assert "intrabar" in text.lower()
    assert not list(run_dir.glob("*.tmp"))
