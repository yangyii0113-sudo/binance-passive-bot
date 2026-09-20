#!/usr/bin/env python3
"""Read-only official TWSE/TPEx history -> P3.3 acceptance; no credentials."""
from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research.tw.contracts import ResearchState
from research.tw.history import HistoricalWindow
from research.tw.intelligence.technical import build_technical_research
from research.tw.providers.historical import TPExHistoricalProvider, TWSEHistoricalProvider
from research.tw.providers.http import UrllibJsonTransport
from research.tw.services.historical_window import build_historical_window


def technical_smoke_summary(window: HistoricalWindow) -> dict:
    snapshot = build_technical_research(window)
    if (snapshot.state == ResearchState.INSUFFICIENT_DATA
        or snapshot.coverage_ratio != 1 or snapshot.execution_allowed
        or snapshot.volume_confirmation == "insufficient_data"
        or snapshot.volatility_state == "insufficient_data"):
        unavailable = [item.name for item in snapshot.daily.metrics if item.value is None]
        raise RuntimeError(
            f"{window.instrument_id} technical acceptance failed: "
            f"sessions={len(window.bars)}/{window.requested_sessions}, "
            f"unavailable={unavailable}, weekly={snapshot.weekly.state.value}"
        )
    return {
        "ok": True,
        "method_version": snapshot.method_version,
        "instrument_id": snapshot.instrument_id,
        "cutoff": snapshot.end_date,
        "observed_at": snapshot.observed_at,
        "sessions": len(window.bars),
        "first_session": window.first_session,
        "weekly_observed_at": snapshot.weekly.observed_at,
        "daily_state": snapshot.daily.state.value,
        "weekly_state": snapshot.weekly.state.value,
        "state": snapshot.state.value,
        "volume_confirmation": snapshot.volume_confirmation,
        "volatility_state": snapshot.volatility_state,
        "coverage_ratio": snapshot.coverage_ratio,
        "daily_metrics": {item.name: item.value for item in snapshot.daily.metrics},
        "sources": list(window.sources),
        "evidence_count": len(snapshot.evidence),
        "price_mode": snapshot.price_mode,
        "corporate_action_adjusted": snapshot.corporate_action_adjusted,
        "execution_allowed": snapshot.execution_allowed,
        "limitations": list(snapshot.limitations),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--end-date", type=date.fromisoformat,
                        help="Historical cutoff YYYY-MM-DD; defaults to today's Taipei date.")
    args = parser.parse_args()
    cutoff = args.end_date or datetime.now(timezone(timedelta(hours=8))).date()
    start = cutoff - timedelta(days=240)
    transport = UrllibJsonTransport(timeout_seconds=30, attempts=2)
    results = []
    for venue, symbol, provider_type in (
        ("TWSE", "2330", TWSEHistoricalProvider),
        ("TPEX", "6488", TPExHistoricalProvider),
    ):
        rows = tuple(provider_type(transport).fetch_range(symbol, start.isoformat(), cutoff.isoformat()))
        window = build_historical_window(
            rows, instrument_id=f"{venue.lower()}:{symbol}", venue=venue,
            end_date=cutoff.isoformat(), sessions=120,
        )
        results.append(technical_smoke_summary(window))
    print(json.dumps({"ok": True, "kind": "official_historical_technical_acceptance",
                      "results": results}, ensure_ascii=False, indent=2, allow_nan=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
