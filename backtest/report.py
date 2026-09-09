from __future__ import annotations

import json
from pathlib import Path

MODE = "HISTORICAL BACKTEST"
LABEL = "歷史模擬・非 Forward Performance"


def _write_json_atomic(path: Path, payload: dict) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    tmp.replace(path)


def build_report(metrics: dict, run_config: dict, manifest: dict) -> dict:
    model = run_config.get("execution_fidelity") or "HOURLY_OPEN_AND_FULLY_CLOSED_BAR_SAMPLING"
    return {
        "schema": "foxyya-backtest-report/1",
        "mode": MODE,
        "label": LABEL,
        "provenance": {
            "run_id": run_config.get("run_id"),
            "symbol": run_config.get("symbol"),
            "strategy_version": run_config.get("strategy_version"),
            "git_sha": run_config.get("git_sha"),
            "manifest_sha256": run_config.get("manifest_sha256"),
            "source_family": manifest.get("source_family"),
            "retrieved_at_ms": manifest.get("retrieved_at_ms"),
            "retrieval_mode": run_config.get("retrieval_mode"),
            "exchange_info_source": run_config.get("exchange_info_source"),
            "requested_end_utc": run_config.get("requested_end_utc"),
            "data_lag_ms": run_config.get("data_lag_ms"),
            "end_boundary_policy": run_config.get("end_boundary_policy"),
            "funding_coverage_policy": run_config.get("funding_coverage_policy"),
            "execution_start_utc": run_config.get("execution_start_utc"),
            "execution_end_utc": run_config.get("execution_end_utc"),
            "execution_start_taipei": run_config.get("execution_start_taipei"),
            "execution_end_taipei": run_config.get("execution_end_taipei"),
        },
        "execution_fidelity": {
            "model": model,
            "intrabar_path": "UNAVAILABLE",
            "position_management_sampling": "historical replay samples legal 1H open and fully closed bars; no fabricated intrabar mark path",
            "paper_only": bool(run_config.get("paper_only", True)),
            "real_orders": bool(run_config.get("real_orders", False)),
        },
        "performance": metrics.get("performance", {}),
        "cost_attribution": metrics.get("cost_attribution", {}),
        "funnel": metrics.get("funnel", {}),
        "risk": metrics.get("risk", {}),
        "segments": metrics.get("segments", {}),
        "monthly_returns": metrics.get("monthly_returns", []),
        "integrity": run_config.get("integrity", {}),
    }


def _markdown(report: dict) -> str:
    p = report.get("performance", {})
    c = report.get("cost_attribution", {})
    prov = report.get("provenance", {})
    fidelity = report.get("execution_fidelity", {})
    lines = [
        "# FOXYYA HISTORICAL BACKTEST",
        "",
        f"**{LABEL}**",
        "",
        f"- Run ID: `{prov.get('run_id')}`",
        f"- Symbol: `{prov.get('symbol')}`",
        f"- Strategy: `{prov.get('strategy_version')}`",
        f"- Git SHA: `{prov.get('git_sha')}`",
        f"- Manifest SHA-256: `{prov.get('manifest_sha256')}`",
        f"- Source: `{prov.get('source_family')}`",
        f"- UTC Window: `{prov.get('execution_start_utc')}` → `{prov.get('execution_end_utc')}`",
        f"- Asia/Taipei Window: `{prov.get('execution_start_taipei')}` → `{prov.get('execution_end_taipei')}`",
        "",
        "## Performance",
        "",
        f"- Closed trades: {p.get('closed_trades')}",
        f"- Win rate: {p.get('win_rate')} (n={p.get('win_rate_n')})",
        f"- Net return: {p.get('net_return')}",
        f"- Net P&L: {p.get('net_pnl_usdt')} USDT",
        f"- Avg / Expectancy R: {p.get('avg_r')} / {p.get('expectancy_r')}",
        f"- Profit factor: {p.get('profit_factor')}",
        f"- Max drawdown: {p.get('max_drawdown')}",
        "",
        "## Cost Attribution",
        "",
        f"- Raw gross P&L: {c.get('gross_raw_pnl_usdt')} USDT",
        f"- Slippage cost: {c.get('slippage_usdt')} USDT",
        f"- Fees: {c.get('fees_usdt')} USDT",
        f"- Funding: {c.get('funding_usdt')} USDT",
        f"- Closed-trade net P&L: {c.get('net_pnl_usdt')} USDT",
        "",
        "## Execution Fidelity",
        "",
        f"- Model: `{fidelity.get('model')}`",
        "- intrabar path: **UNAVAILABLE**",
        "- Research Grade v1 does not reconstruct an intrabar mark-price path. It uses deterministic legal 1H open / fully closed-bar sampling and never fabricates missing intrabar evidence.",
        "- This report is historical simulation only and is never Forward Performance.",
        "",
    ]
    return "\n".join(lines)


def write_run_artifacts(
    run_dir: Path,
    *,
    input_payload: dict,
    manifest: dict,
    run_config: dict,
    metrics: dict,
    report: dict,
) -> dict[str, Path]:
    run_dir = Path(run_dir)
    run_dir.mkdir(parents=True, exist_ok=True)
    events = run_dir / "events.sqlite"
    if not events.exists():
        raise ValueError("events.sqlite must exist before report artifacts are written")

    paths = {
        "input_data": run_dir / "input_data.json",
        "manifest": run_dir / "data_manifest.json",
        "run_config": run_dir / "run_config.json",
        "metrics": run_dir / "metrics.json",
        "report_json": run_dir / "report.json",
        "report_md": run_dir / "report.md",
        "events": events,
    }
    _write_json_atomic(paths["input_data"], input_payload)
    _write_json_atomic(paths["manifest"], manifest)
    _write_json_atomic(paths["run_config"], run_config)
    _write_json_atomic(paths["metrics"], metrics)
    _write_json_atomic(paths["report_json"], report)
    tmp_md = paths["report_md"].with_suffix(".md.tmp")
    tmp_md.write_text(_markdown(report), encoding="utf-8")
    tmp_md.replace(paths["report_md"])
    return paths
