from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from foxyya.execution import HOUR


DAY = 24 * HOUR
TAIPEI = ZoneInfo("Asia/Taipei")


def resolve_trailing_window(now_ms: int, *, days: int = 365) -> tuple[int, int]:
    if int(days) <= 0:
        raise ValueError("days must be positive")
    now_ms = int(now_ms)
    end_ms = (now_ms // HOUR) * HOUR
    return end_ms - int(days) * DAY, end_ms


def _iso(ms: int, tz) -> str:
    return datetime.fromtimestamp(int(ms) / 1000, tz=timezone.utc).astimezone(tz).isoformat()


def _canonical(value: dict) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def build_run_config(
    *,
    symbol: str,
    start_ms: int,
    end_ms: int,
    strategy_version: str,
    git_sha: str,
    data_manifest_sha256: str,
    initial_nav: float,
    universe_scope: str,
) -> dict:
    symbol = str(symbol).upper()
    if not symbol or int(end_ms) <= int(start_ms):
        raise ValueError("invalid backtest window")
    if not strategy_version or not git_sha or not data_manifest_sha256:
        raise ValueError("strategy version, git sha and data manifest are required")
    if float(initial_nav) <= 0:
        raise ValueError("initial_nav must be positive")

    core = {
        "schema": "foxyya-backtest-run-config/1",
        "mode": "HISTORICAL_BACKTEST",
        "real_orders": False,
        "data_source": "BINANCE_USD_M_PUBLIC",
        "symbol": symbol,
        "start_ms": int(start_ms),
        "end_ms": int(end_ms),
        "strategy_version": str(strategy_version),
        "git_sha": str(git_sha),
        "data_manifest_sha256": str(data_manifest_sha256),
        "initial_nav_usdt": float(initial_nav),
        "universe_scope": str(universe_scope),
        "signal_timeframe": "1H_FULLY_CLOSED",
        "context_timeframes": ["4H_NATIVE", "1D_NATIVE"],
        "entry_timing": "FUTURE_LEGAL_1H_OPEN",
        "position_management": "HOURLY_MARK_OBSERVATION_APPROXIMATION",
        "cost_model": "PRODUCTION_SHARED_CORE",
        "paper_only": True,
        "real_order_lock": True,
    }
    run_id = "bt_" + hashlib.sha256(_canonical(core).encode("utf-8")).hexdigest()[:24]
    return {
        **core,
        "run_id": run_id,
        "window": {
            "start_utc": _iso(start_ms, timezone.utc),
            "end_utc": _iso(end_ms, timezone.utc),
            "start_asia_taipei": _iso(start_ms, TAIPEI),
            "end_asia_taipei": _iso(end_ms, TAIPEI),
            "end_exclusive": True,
        },
        "fidelity": {
            "signal_generation": "SHARED_PRODUCTION_RULES",
            "risk_sizing": "SHARED_PRODUCTION_RULES",
            "future_legal_open": "SHARED_PRODUCTION_RULES",
            "fees_slippage_funding_reserve": "SHARED_PRODUCTION_RULES",
            "position_management": "HOURLY_MARK_OBSERVATION_APPROXIMATION",
            "ranking_scope": str(universe_scope),
        },
        "warnings": [
            "Position management observes historical hourly marks rather than the live runtime's approximately 30-second mark cadence.",
            "Intrabar stop/TP/trailing path is therefore an explicit approximation and must not be presented as tick-accurate execution.",
            "If universe_scope is ETHUSDT_ISOLATED, cross-sectional rank thresholds are evaluated in an isolated single-symbol universe and are not full-universe production parity.",
        ],
    }
