#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import signal
import threading
import time
from urllib.parse import urlparse, parse_qs
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from foxyya.config import load_runtime_config
from foxyya.execution import HOUR
from foxyya.ledger import EventLedger
from foxyya.live import PublicSnapshotBuilder
from foxyya.market import PublicBinanceClient
from foxyya.portfolio import replay_books
from foxyya.runner import ForwardRunner
from intel_feeds import aggregate_news, fetch_bls_calendar
from runtime_view import project_runtime
from backtest.artifacts import validate_run_artifacts
import sqlite3

BACKTEST_MODE = "HISTORICAL BACKTEST"
BACKTEST_LABEL = "歷史模擬・非 Forward Performance"
BACKTEST_RUN_ID = re.compile(r"^[A-Za-z0-9._-]+$")


class RuntimeState:
    def __init__(self, strategy_version: str):
        self._lock = threading.Lock()
        self.started_ms = int(time.time() * 1000)
        self.strategy_version = strategy_version
        self.last_cycle = None
        self.last_error = None
        self.cycle_count = 0

    def record_cycle(self, payload: dict) -> None:
        with self._lock:
            self.last_cycle = payload
            self.last_error = None
            self.cycle_count += 1

    def record_error(self, exc: Exception, now_ms: int) -> None:
        with self._lock:
            self.last_error = {
                "time_ms": now_ms,
                "type": type(exc).__name__,
                "message": str(exc),
                "fills_frozen": True,
            }

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "ok": self.last_error is None,
                "paper_only": True,
                "real_order_lock": True,
                "canonical_book": "5x",
                "canonical_book_role": "PRIMARY",
                "strategy_version": self.strategy_version,
                "started_ms": self.started_ms,
                "uptime_seconds": max(0, int((time.time() * 1000 - self.started_ms) / 1000)),
                "cycle_count": self.cycle_count,
                "last_cycle": self.last_cycle,
                "last_error": self.last_error,
            }


def run_cycle(ledger: EventLedger, runner: ForwardRunner, builder: PublicSnapshotBuilder, now_ms: int) -> dict:
    state = replay_books(ledger, runner.initial_nav)["books"]["5x"]
    funding_symbols = sorted({p["symbol"] for p in state["positions"].values()})
    snap = builder.build(now_ms=now_ms, funding_symbols=funding_symbols)
    open_ms = (now_ms // HOUR) * HOUR
    fills = runner.execute_open(snap, open_ms=open_ms, observed_ms=now_ms) if now_ms - open_ms <= 5 * 60_000 else []
    funding = runner.apply_funding(snap, now_ms=now_ms)
    managed = runner.manage_positions(snap, now_ms=now_ms)
    revalidated = runner.revalidate(snap, now_ms=now_ms)
    scanned = runner.scan_if_new_close(snap, now_ms=now_ms)
    return {
        "time_ms": now_ms,
        "universe": snap.get("eligible_universe_count"),
        "fills": [x.get("kind") for x in fills],
        "funding": [x.get("kind") for x in funding],
        "managed": [x.get("kind") for x in managed],
        "revalidated": len(revalidated),
        "scan": scanned["funnel"] if scanned else None,
        "diagnostics": runner.diagnostics(now_ms),
    }


def _load_backtest_payload(root: Path, run_id: str) -> dict | None:
    run_id = str(run_id)
    if not run_id or run_id in {".", ".."} or not BACKTEST_RUN_ID.fullmatch(run_id):
        raise ValueError("invalid backtest run id")
    root = Path(root).resolve()
    run_dir = (root / run_id).resolve()
    try:
        run_dir.relative_to(root)
    except ValueError as exc:
        raise ValueError("invalid backtest run id") from exc
    if not run_dir.is_dir():
        return None

    try:
        payload = validate_run_artifacts(run_dir)
    except (OSError, ValueError, KeyError, TypeError, AttributeError, sqlite3.Error):
        return None
    return {
        "status": "OK",
        "mode": BACKTEST_MODE,
        "label": BACKTEST_LABEL,
        "run_config": payload["run_config"],
        "metrics": payload["metrics"],
        "report": payload["report"],
    }


def _latest_backtest_payload(root: Path) -> dict | None:
    root = Path(root).resolve()
    if not root.is_dir():
        return None
    candidates = []
    for child in root.iterdir():
        if not child.is_dir() or not BACKTEST_RUN_ID.fullmatch(child.name):
            continue
        try:
            resolved = child.resolve()
            resolved.relative_to(root)
        except (OSError, ValueError):
            continue
        payload = _load_backtest_payload(root, child.name)
        if payload is None:
            continue
        end_ms = payload.get("run_config", {}).get("end_ms")
        try:
            key = (int(end_ms), child.name)
        except (TypeError, ValueError):
            continue
        candidates.append((key, payload))
    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0])
    return candidates[-1][1]


def make_handler(
    runtime: RuntimeState,
    ledger: EventLedger | None = None,
    platform_path: Path | None = None,
    initial_nav: float = 1000,
    backtest_root: Path | None = None,
):
    news_feeds = [
        ("CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"),
        ("Federal Reserve", "https://www.federalreserve.gov/feeds/press_all.xml"),
        ("BLS", "https://www.bls.gov/feed/bls_latest.rss"),
    ]
    cache = {"news": (0, None), "calendar": (0, None)}
    cache_lock = threading.Lock()
    backtest_root_path = Path(
        backtest_root if backtest_root is not None else os.getenv("FOXYYA_BACKTEST_ROOT", "/data/backtests")
    ).resolve()

    def cached(key, ttl_ms, loader):
        now = int(time.time() * 1000)
        with cache_lock:
            at, value = cache[key]
            if value is not None and now - at < ttl_ms:
                return value
        value = loader()
        with cache_lock:
            cache[key] = (now, value)
        return value

    def runtime_payload():
        payload = runtime.snapshot()
        payload["mode"] = "PAPER_ONLY"
        payload["execution_enabled"] = False
        if ledger is not None:
            try:
                ev = ledger.events()
                payload["ledger_events"] = len(ev)
                payload["ledger_integrity"] = bool(ledger.verify())
            except Exception as exc:
                payload["ledger_integrity"] = False
                payload["ledger_error"] = type(exc).__name__ + ': ' + str(exc)
        return payload

    class Handler(BaseHTTPRequestHandler):
        def _json(self, payload, status=200):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers(); self.wfile.write(body)

        def _backtest_unavailable(self):
            self._json({"status": "UNAVAILABLE", "mode": BACKTEST_MODE, "label": BACKTEST_LABEL}, 503)

        def _script(self, filename: str):
            file_path = Path(__file__).with_name(filename)
            if not file_path.is_file():
                self.send_response(404); self.end_headers(); return
            body = file_path.read_bytes()
            self.send_response(200); self.send_header("Content-Type", "text/javascript; charset=utf-8")
            self.send_header("Cache-Control", "no-store"); self.send_header("Content-Length", str(len(body)))
            self.end_headers(); self.wfile.write(body)

        def do_GET(self):
            u = urlparse(self.path); path = u.path
            if path == "/runtime_ui.js":
                self._script("runtime_ui.js"); return
            if path == "/backtest_ui.js":
                self._script("backtest_ui.js"); return
            if path == "/" and platform_path is not None and platform_path.exists():
                body = platform_path.read_bytes()
                marker = b"</body>"
                injection = b'<script src="/backtest_ui.js"></script></body>'
                if b'/backtest_ui.js' not in body and marker in body:
                    body = body.replace(marker, injection, 1)
                self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Cache-Control", "no-store"); self.send_header("Content-Length", str(len(body)))
                self.end_headers(); self.wfile.write(body); return
            if path in ("/", "/health", "/status", "/api/runtime/status"):
                payload = runtime_payload(); self._json(payload, 200 if payload["ok"] else 503); return
            if path == "/api/runtime/snapshot":
                if ledger is None:
                    self._json({"status": "UNAVAILABLE"}, 503); return
                try:
                    with ledger.lock:
                        ledger.verify()
                        ev = ledger.events()
                    payload = project_runtime(ev, initial_nav, int(time.time() * 1000))
                    self._json(payload)
                except Exception as exc:
                    self._json({"status": "UNAVAILABLE", "error": type(exc).__name__ + ': ' + str(exc)}, 503)
                return
            if path == "/api/runtime/events":
                if ledger is None: self._json({"schema":"foxyya-runtime-events/1","status":"UNAVAILABLE","events":[]},503); return
                try:
                    limit = max(1, min(2000, int(parse_qs(u.query).get("limit", ["500"])[0])))
                    ev = ledger.events()[-limit:]
                    self._json({"schema":"foxyya-runtime-events/1","status":"PAPER_ONLY","real_orders":False,"served_at":int(time.time()*1000),"events":ev})
                except Exception as exc:
                    self._json({"schema":"foxyya-runtime-events/1","status":"ERROR","events":[],"error":type(exc).__name__+': '+str(exc)},500)
                return
            if path == "/api/backtest/latest":
                payload = _latest_backtest_payload(backtest_root_path)
                if payload is None:
                    self._backtest_unavailable(); return
                self._json(payload); return
            if path == "/api/backtest/report":
                params = parse_qs(u.query)
                run_id = params.get("run_id", [""])[0]
                try:
                    payload = _load_backtest_payload(backtest_root_path, run_id)
                except ValueError:
                    self._json({"status": "INVALID_RUN_ID", "mode": BACKTEST_MODE, "label": BACKTEST_LABEL}, 400); return
                if payload is None:
                    self._backtest_unavailable(); return
                self._json(payload); return
            if path == "/api/intel/news":
                self._json(cached("news", 120_000, lambda: aggregate_news(news_feeds))); return
            if path == "/api/intel/calendar":
                self._json(cached("calendar", 30*60_000, fetch_bls_calendar)); return
            self.send_response(404); self.end_headers()

        def log_message(self, format, *args):
            return

    return Handler


def main() -> None:
    config_path = Path(os.getenv("FOXYYA_CONFIG", "FOXYYA_V2_CONFIG.json"))
    db_path = Path(os.getenv("FOXYYA_DB", "/data/foxyya_v2_paper.sqlite"))
    backtest_root = Path(os.getenv("FOXYYA_BACKTEST_ROOT", "/data/backtests"))
    interval = max(5, int(os.getenv("FOXYYA_INTERVAL_SECONDS", "30")))
    port = int(os.getenv("PORT", "8080"))

    cfg = load_runtime_config(config_path)
    if not cfg.get("real_order_lock", False):
        raise RuntimeError("Refusing to start: real_order_lock must remain true")

    db_path.parent.mkdir(parents=True, exist_ok=True)
    ledger = EventLedger(db_path)
    runner = ForwardRunner(ledger, initial_nav=float(cfg["initial_nav_usdt"]))
    builder = PublicSnapshotBuilder(PublicBinanceClient())
    runtime = RuntimeState(cfg["strategy_version"])
    stop = threading.Event()

    def request_stop(*_):
        stop.set()

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)

    platform_path = Path(os.getenv("FOXYYA_PLATFORM_HTML", "FOXYYA_完整平台_v11.2_live_runtime.html"))
    server = ThreadingHTTPServer(
        ("0.0.0.0", port),
        make_handler(runtime, ledger, platform_path, float(cfg["initial_nav_usdt"]), backtest_root=backtest_root),
    )
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    print(json.dumps({"event": "service_started", "port": port, "db": str(db_path), "paper_only": True}), flush=True)

    try:
        while not stop.is_set():
            now_ms = int(time.time() * 1000)
            try:
                payload = run_cycle(ledger, runner, builder, now_ms)
                runtime.record_cycle(payload)
                print(json.dumps(payload, ensure_ascii=False), flush=True)
            except Exception as exc:
                runtime.record_error(exc, now_ms)
                print(json.dumps(runtime.snapshot(), ensure_ascii=False), flush=True)
            stop.wait(interval)
    finally:
        server.shutdown()
        server.server_close()
        ledger.close()


if __name__ == "__main__":
    main()
