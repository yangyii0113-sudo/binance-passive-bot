from __future__ import annotations


def _provenance(run_config: dict) -> dict:
    keys = (
        "run_id",
        "symbol",
        "start_ms",
        "end_ms",
        "strategy_version",
        "git_sha",
        "data_manifest_sha256",
        "data_source",
        "universe_scope",
    )
    return {key: run_config.get(key) for key in keys}


def build_backtest_report(run_config: dict, metrics: dict, *, ledger_integrity: bool) -> dict:
    required = (
        "run_id",
        "symbol",
        "start_ms",
        "end_ms",
        "strategy_version",
        "git_sha",
        "data_manifest_sha256",
    )
    missing = [key for key in required if run_config.get(key) in (None, "")]
    integrity = metrics.get("integrity", {})
    valid = (
        bool(ledger_integrity)
        and not missing
        and int(integrity.get("backfill_count", 0)) == 0
        and int(integrity.get("duplicate_fill_count", 0)) == 0
        and int(integrity.get("orphan_closed_trade_count", 0)) == 0
    )

    return {
        "schema": "foxyya-backtest-report/1",
        "label": "HISTORICAL BACKTEST",
        "label_zh": "歷史模擬・非 Forward Performance",
        "status": "VALID_RESEARCH_RUN" if valid else "FAILED_INTEGRITY",
        "real_orders": False,
        "paper_only": True,
        "provenance": _provenance(run_config),
        "window": run_config.get("window", {}),
        "fidelity": run_config.get("fidelity", {}),
        "warnings": list(run_config.get("warnings", [])),
        "metrics": metrics,
        "integrity": {
            "ledger_integrity": bool(ledger_integrity),
            "missing_provenance": missing,
            **integrity,
        },
    }
