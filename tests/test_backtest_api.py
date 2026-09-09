from __future__ import annotations

import json
import threading
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import urlopen
from http.server import ThreadingHTTPServer

import service
from test_artifact_integrity import make_run
from backtest.binance_history import DAY_MS


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
    old, _ = make_run(root)
    new, _ = make_run(root, end_ms=1001 * DAY_MS)
    before = {p: p.stat().st_mtime_ns for p in new.iterdir()}
    server = _server(root)
    try:
        status, payload = _get(server, "/api/backtest/latest")
        assert status == 200
        assert payload["status"] == "OK"
        assert payload["mode"] == "HISTORICAL BACKTEST"
        assert payload["label"] == "歷史模擬・非 Forward Performance"
        assert payload["run_config"]["run_id"] == new.name
        assert payload["metrics"]["mode"] == "HISTORICAL BACKTEST"
        assert payload["report"]["provenance"]["run_id"] == new.name
        assert {p: p.stat().st_mtime_ns for p in new.iterdir()} == before
    finally:
        server.shutdown(); server.server_close()


def test_backtest_report_lookup_rejects_traversal_and_reads_specific_run(tmp_path: Path):
    root = tmp_path / "backtests"
    run, _ = make_run(root)

    server = _server(root)
    try:
        status, payload = _get(server, "/api/backtest/report?run_id=" + run.name)
        assert status == 200
        assert payload["run_config"]["run_id"] == run.name

        status, payload = _get(server, "/api/backtest/report?run_id=../paper")
        assert status == 400
        assert payload["status"] == "INVALID_RUN_ID"
    finally:
        server.shutdown(); server.server_close()
