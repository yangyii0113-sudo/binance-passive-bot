from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from backtest.binance_history import DAY_MS, HOUR_MS, fetch_study_inputs
from backtest.historical_clock import HistoricalClock
from backtest.historical_market import HistoricalDataset, HistoricalMarketAdapter
from backtest.metrics import build_metrics
from backtest.replay_engine import HistoricalReplayEngine
from backtest.report import build_report, write_run_artifacts
from backtest.research_ledger import ResearchLedgerFactory, deterministic_run_id

TAIPEI = ZoneInfo("Asia/Taipei")
EXECUTION_FIDELITY = "HOURLY_OPEN_AND_FULLY_CLOSED_BAR_SAMPLING"


def _canonical_bytes(value) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")


def _sha256(value) -> str:
    return hashlib.sha256(_canonical_bytes(value)).hexdigest()


def _git_sha(explicit: str | None = None) -> str:
    if explicit:
        return str(explicit)
    env_sha = os.getenv("GITHUB_SHA")
    if env_sha:
        return env_sha
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], stderr=subprocess.DEVNULL, text=True, timeout=5
        ).strip()
    except Exception:
        return "UNAVAILABLE"


def _iso(ms: int, tz) -> str:
    return datetime.fromtimestamp(int(ms) / 1000, tz=timezone.utc).astimezone(tz).isoformat()


def _integrity(events: list[dict], *, ledger_integrity: bool, start_ms: int, end_ms: int) -> dict:
    intents = {
        str(e.get("intent_id")): e
        for e in events
        if e.get("kind") == "INTENT_CREATED" and e.get("intent_id")
    }
    fills = [e for e in events if e.get("kind") == "PAPER_ENTRY"]
    fill_keys = [(e.get("position_id"), e.get("fill_ms")) for e in fills]
    duplicate_fills = len(fill_keys) - len(set(fill_keys))
    backfill_count = 0
    out_of_window_fills = 0
    real_order_events = 0
    for fill in fills:
        intent = intents.get(str(fill.get("intent_id")))
        fill_ms = int(fill.get("fill_ms", 0))
        if intent is None or fill_ms <= int(intent.get("decision_persist_ms", fill_ms)):
            backfill_count += 1
        if not (int(start_ms) <= fill_ms < int(end_ms)):
            out_of_window_fills += 1
        if fill.get("real_orders") is True:
            real_order_events += 1
    return {
        "ledger_integrity": bool(ledger_integrity),
        "duplicate_fills": int(duplicate_fills),
        "backfill_count": int(backfill_count),
        "out_of_window_fills": int(out_of_window_fills),
        "real_order_events": int(real_order_events),
        "execution_required_open_gaps": 0,
    }


def _validate_input_window(payload: dict, *, end_ms: int, execution_days: int, warmup_days: int) -> tuple[int, int]:
    expected_start = int(end_ms) - int(execution_days) * DAY_MS
    expected_warmup = expected_start - int(warmup_days) * DAY_MS
    if int(payload.get("end_ms", -1)) != int(end_ms):
        raise ValueError("historical input end_ms does not match resolved execution boundary")
    if int(payload.get("execution_start_ms", -1)) != expected_start:
        raise ValueError("historical input execution_start_ms mismatch")
    if int(payload.get("warmup_start_ms", -1)) != expected_warmup:
        raise ValueError("historical input warmup_start_ms mismatch")
    if payload.get("tradable_symbols") != ["ETHUSDT"]:
        raise ValueError("first formal study must trade ETHUSDT only")
    context = set(payload.get("context_symbols") or [])
    if not {"BTCUSDT", "ETHUSDT", "SOLUSDT"} <= context:
        raise ValueError("BTC/ETH/SOL context datasets are required")
    return expected_start, expected_warmup


def run_eth_365_study(
    *,
    output_root: Path,
    now_ms: int | None = None,
    input_payload: dict | None = None,
    execution_days: int = 365,
    warmup_days: int = 200,
    git_sha: str | None = None,
    config_path: Path = Path("FOXYYA_V2_CONFIG.json"),
) -> dict:
    run_start_ms = int(time.time() * 1000) if now_ms is None else int(now_ms)
    end_ms = (run_start_ms // HOUR_MS) * HOUR_MS
    if end_ms <= 0:
        raise ValueError("resolved execution end must be positive")
    execution_days = int(execution_days)
    warmup_days = int(warmup_days)
    if execution_days <= 0 or warmup_days < 0:
        raise ValueError("invalid execution/warmup days")

    if input_payload is None:
        input_payload = fetch_study_inputs(
            end_ms=end_ms,
            execution_days=execution_days,
            warmup_days=warmup_days,
        )
    else:
        # Deep-copy through canonical JSON so callers cannot mutate accepted inputs mid-run.
        input_payload = json.loads(_canonical_bytes(input_payload).decode("utf-8"))

    start_ms, warmup_start_ms = _validate_input_window(
        input_payload,
        end_ms=end_ms,
        execution_days=execution_days,
        warmup_days=warmup_days,
    )

    cfg = json.loads(Path(config_path).read_text(encoding="utf-8"))
    if cfg.get("real_order_lock") is not True:
        raise RuntimeError("refusing historical study: real_order_lock must remain true")
    strategy_version = str(cfg["strategy_version"])
    initial_nav = float(cfg["initial_nav_usdt"])
    resolved_git_sha = _git_sha(git_sha)

    dataset = HistoricalDataset(
        exchange_info=input_payload["exchange_info"],
        rows_by_symbol=input_payload["rows_by_symbol"],
        funding_rows_by_symbol=input_payload.get("funding_rows_by_symbol") or {},
        retrieved_at_ms=int(input_payload["retrieved_at_ms"]),
        source_family=str(input_payload.get("source_family") or "Binance USD-M Public Data"),
    )
    manifest = dataset.manifest()
    manifest_sha256 = _sha256(manifest)

    run_identity_config = {
        "initial_nav_usdt": initial_nav,
        "manifest_sha256": manifest_sha256,
        "execution_days": execution_days,
        "warmup_days": warmup_days,
        "execution_fidelity": EXECUTION_FIDELITY,
        "cost_model": cfg.get("cost_model", {}),
        "official_exit_model": cfg.get("official_exit_model", {}),
        "risk": cfg.get("risk", {}),
        "tradable_symbols": ["ETHUSDT"],
        "context_symbols": ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
    }
    run_id = deterministic_run_id(
        strategy_version=strategy_version,
        git_sha=resolved_git_sha,
        symbol="ETHUSDT",
        start_ms=start_ms,
        end_ms=end_ms,
        config=run_identity_config,
    )

    output_root = Path(output_root)
    factory = ResearchLedgerFactory(output_root)
    ledger, ledger_path = factory.open(run_id)
    run_dir = ledger_path.parent
    try:
        # A completed report for the same deterministic run ID is immutable evidence; never append a second replay.
        existing_report = run_dir / "report.json"
        existing_metrics = run_dir / "metrics.json"
        existing_config = run_dir / "run_config.json"
        if existing_report.exists() and existing_metrics.exists() and existing_config.exists():
            previous = json.loads(existing_config.read_text(encoding="utf-8"))
            if previous.get("manifest_sha256") != manifest_sha256:
                raise RuntimeError("existing deterministic run ID has different manifest hash")
            return {
                "status": "SUCCESS",
                "mode": "HISTORICAL BACKTEST",
                "label": "歷史模擬・非 Forward Performance",
                "run_id": run_id,
                "run_dir": str(run_dir),
                "symbol": "ETHUSDT",
                "manifest_sha256": manifest_sha256,
                "integrity": previous.get("integrity", {}),
                "reused_existing_artifacts": True,
            }

        clock = HistoricalClock(start_ms, end_ms)
        market = HistoricalMarketAdapter(dataset, clock, primary_symbol="ETHUSDT")
        replay = HistoricalReplayEngine(clock, market, ledger, initial_nav=initial_nav)
        replay_summary = replay.run(
            start_ms=start_ms,
            end_ms=end_ms,
            run_id=run_id,
            strategy_version=strategy_version,
            git_sha=resolved_git_sha,
        )
        events = ledger.events()
        integrity = _integrity(
            events,
            ledger_integrity=bool(replay_summary.get("ledger_integrity")),
            start_ms=start_ms,
            end_ms=end_ms,
        )
        if not integrity["ledger_integrity"]:
            raise RuntimeError("research ledger integrity failed")
        if integrity["duplicate_fills"]:
            raise RuntimeError("duplicate historical fills detected")
        if integrity["backfill_count"]:
            raise RuntimeError("historical backfill detected")
        if integrity["out_of_window_fills"]:
            raise RuntimeError("historical fill outside execution window")
        if integrity["real_order_events"]:
            raise RuntimeError("real-order event detected in historical study")

        metrics = build_metrics(
            events,
            initial_nav=initial_nav,
            start_ms=start_ms,
            end_ms=end_ms,
            symbol="ETHUSDT",
        )
        run_config = {
            "schema": "foxyya-backtest-run-config/1",
            "run_id": run_id,
            "symbol": "ETHUSDT",
            "strategy_version": strategy_version,
            "git_sha": resolved_git_sha,
            "run_started_ms": run_start_ms,
            "start_ms": start_ms,
            "end_ms": end_ms,
            "warmup_start_ms": warmup_start_ms,
            "execution_days": execution_days,
            "warmup_days": warmup_days,
            "execution_start_utc": _iso(start_ms, timezone.utc),
            "execution_end_utc": _iso(end_ms, timezone.utc),
            "warmup_start_utc": _iso(warmup_start_ms, timezone.utc),
            "execution_start_taipei": _iso(start_ms, TAIPEI),
            "execution_end_taipei": _iso(end_ms, TAIPEI),
            "warmup_start_taipei": _iso(warmup_start_ms, TAIPEI),
            "execution_fidelity": EXECUTION_FIDELITY,
            "intrabar_path": "UNAVAILABLE",
            "paper_only": True,
            "real_orders": False,
            "manifest_sha256": manifest_sha256,
            "source_family": dataset.source_family,
            "tradable_symbols": ["ETHUSDT"],
            "context_symbols": ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
            "initial_nav_usdt": initial_nav,
            "cost_model": cfg.get("cost_model", {}),
            "official_exit_model": cfg.get("official_exit_model", {}),
            "risk": cfg.get("risk", {}),
            "integrity": integrity,
            "replay_summary": replay_summary,
        }
        report = build_report(metrics, run_config, manifest)
        write_run_artifacts(
            run_dir,
            input_payload=input_payload,
            manifest=manifest,
            run_config=run_config,
            metrics=metrics,
            report=report,
        )
        return {
            "status": "SUCCESS",
            "mode": "HISTORICAL BACKTEST",
            "label": "歷史模擬・非 Forward Performance",
            "run_id": run_id,
            "run_dir": str(run_dir),
            "symbol": "ETHUSDT",
            "manifest_sha256": manifest_sha256,
            "integrity": integrity,
            "performance": metrics.get("performance", {}),
            "funnel": metrics.get("funnel", {}),
            "reused_existing_artifacts": False,
        }
    finally:
        ledger.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="FOXYYA historical research CLI")
    sub = parser.add_subparsers(dest="command", required=True)
    eth = sub.add_parser("eth365", help="Run formal ETHUSDT trailing-365-day historical study")
    eth.add_argument("--output-root", default="artifacts/backtests")
    eth.add_argument("--execution-days", type=int, default=365)
    eth.add_argument("--warmup-days", type=int, default=200)
    args = parser.parse_args(argv)

    if args.command == "eth365":
        result = run_eth_365_study(
            output_root=Path(args.output_root),
            execution_days=args.execution_days,
            warmup_days=args.warmup_days,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False))
        return 0
    raise ValueError("unknown command")


if __name__ == "__main__":
    raise SystemExit(main())
