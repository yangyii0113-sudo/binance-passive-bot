from __future__ import annotations

import json
import threading
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import urlopen
from http.server import ThreadingHTTPServer

import service


def _get(server, path):
    url = f"http://127.0.0.1:{server.server_port}{path}"
    try:
        with urlopen(url) as response:
            return response.status, json.load(response)
    except HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


def _server(root: Path):
    runtime = service.RuntimeState("test")
    server = ThreadingHTTPServer(("127.0.0.1", 0), service.make_handler(runtime, None, backtest_root=root))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def test_backtest_api_is_unavailable_without_artifacts(tmp_path: Path):
    server = _server(tmp_path / "missing")
    try:
        status, payload = _get(server, "/api/backtest/latest")
        assert status == 503
        assert payload["status"] == "UNAVAILABLE"
        assert payload["mode"] == "HISTORICAL BACKTEST"
        assert payload["label"] == "歷史模擬・非 Forward Performance"
    finally:
        server.shutdown(); server.server_close()


def test_backtest_api_reads_latest_report_without_runtime_ledger(tmp_path: Path):
    root = tmp_path / "backtests"
    old = root / "bt-old"; new = root / "bt-new"
    old.mkdir(parents=True); new.mkdir(parents=True)
    for run_dir, end_ms in ((old, 100), (new, 200)):
        (run_dir / "run_config.json").write_text(json.dumps({
            "run_id": run_dir.name, "end_ms": end_ms, "symbol": "ETHUSDT", "paper_only": True, "real_orders": False,
        }), encoding="utf-8")
        (run_dir / "metrics.json").write_text(json.dumps({
            "mode": "HISTORICAL BACKTEST", "label": "歷史模擬・非 Forward Performance",
            "performance": {"closed_trades": end_ms},
        }), encoding="utf-8")
        (run_dir / "report.json").write_text(json.dumps({
            "mode": "HISTORICAL BACKTEST", "label": "歷史模擬・非 Forward Performance",
            "provenance": {"run_id": run_dir.name},
        }), encoding="utf-8")

    before = {p: p.stat().st_mtime_ns for p in new.iterdir()}
    server = _server(root)
    try:
        status, payload = _get(server, "/api/backtest/latest")
        assert status == 200
        assert payload["status"] == "OK"
        assert payload["mode"] == "HISTORICAL BACKTEST"
        assert payload["label"] == "歷史模擬・非 Forward Performance"
        assert payload["run_config"]["run_id"] == "bt-new"
        assert payload["metrics"]["performance"]["closed_trades"] == 200
        assert payload["report"]["provenance"]["run_id"] == "bt-new"
        assert {p: p.stat().st_mtime_ns for p in new.iterdir()} == before
    finally:
        server.shutdown(); server.server_close()


def test_backtest_report_lookup_rejects_traversal_and_reads_specific_run(tmp_path: Path):
    root = tmp_path / "backtests"
    run = root / "bt-specific"; run.mkdir(parents=True)
    (run / "run_config.json").write_text(json.dumps({"run_id": "bt-specific", "end_ms": 1}), encoding="utf-8")
    (run / "metrics.json").write_text(json.dumps({"mode": "HISTORICAL BACKTEST"}), encoding="utf-8")
    (run / "report.json").write_text(json.dumps({
        "mode": "HISTORICAL BACKTEST", "label": "歷史模擬・非 Forward Performance",
        "provenance": {"run_id": "bt-specific"},
    }), encoding="utf-8")

    server = _server(root)
    try:
        status, payload = _get(server, "/api/backtest/report?run_id=bt-specific")
        assert status == 200
        assert payload["run_config"]["run_id"] == "bt-specific"

        status, payload = _get(server, "/api/backtest/report?run_id=../paper")
        assert status == 400
        assert payload["status"] == "INVALID_RUN_ID"
    finally:
        server.shutdown(); server.server_close()
