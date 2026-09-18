#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import tempfile
import time
from collections import Counter
from pathlib import Path

from foxyya.ledger import EventLedger
from foxyya.live import PublicSnapshotBuilder
from foxyya.market import PublicBinanceClient
from foxyya.runner import ForwardRunner


def _event_time(event):
    for key in ("observed_ms", "time_ms", "persisted_ms", "decision_persist_ms", "fill_ms"):
        value = event.get(key)
        if isinstance(value, (int, float)):
            return int(value)
    return None


def main():
    ap = argparse.ArgumentParser(description="FOXYYA one-shot public-data shadow scan")
    ap.add_argument("--output", default="/tmp/foxyya-shadow-scan.json")
    ap.add_argument("--max-workers", type=int, default=16)
    args = ap.parse_args()

    now_ms = int(time.time() * 1000)
    client = PublicBinanceClient(timeout=12)
    builder = PublicSnapshotBuilder(client, max_workers=max(1, args.max_workers))
    snapshot = builder.build(now_ms=now_ms, funding_symbols=[])

    with tempfile.TemporaryDirectory() as td:
        ledger = EventLedger(Path(td) / "shadow.sqlite")
        runner = ForwardRunner(ledger, initial_nav=1000.0)
        scan = runner.scan(snapshot, now_ms=now_ms)
        events = ledger.events()

        ranked_long = [e for e in events if e.get("kind") == "CANDIDATE_RANKED" and e.get("side") == "LONG"]
        ranked_short = [e for e in events if e.get("kind") == "CANDIDATE_RANKED" and e.get("side") == "SHORT"]
        qualified = [e for e in events if e.get("kind") == "SIGNAL_QUALIFIED"]
        rejected = [e for e in events if e.get("kind") == "SIGNAL_REJECTED"]
        intents = [e for e in events if e.get("kind") == "INTENT_CREATED"]
        risk_limits = [e for e in events if e.get("kind") == "RISK_LIMIT_EVENT"]
        anomalies = [e for e in events if e.get("kind") == "EXECUTION_ANOMALY"]

        intent_by_signal = {e.get("signal_id"): e for e in intents}
        qualified_rows = []
        for q in qualified:
            i = intent_by_signal.get(q.get("signal_id"))
            qualified_rows.append({
                "signal": q,
                "intent": i,
                "next_eligible_open_ms": i.get("scheduled_open_ms") if i else None,
                "paper_entry": False,
                "canonical": False,
            })

        report = {
            "schema": "foxyya-public-shadow-scan/2",
            "scan_time_ms": now_ms,
            "built_at_ms": snapshot.get("built_at_ms"),
            "source": "Binance USD-M public endpoints only",
            "canonical": False,
            "paper_only": True,
            "real_orders": False,
            "fallback_nav_usdt": 1000.0,
            "fully_closed_bars_only": True,
            "no_backfill": True,
            "strategy_parameters_changed": False,
            "private_account_permissions_used": False,
            "eligible_universe_count": snapshot.get("eligible_universe_count"),
            "major_returns": snapshot.get("major_returns"),
            "breadth": snapshot.get("breadth"),
            "regime": scan.get("regime"),
            "funnel": scan.get("funnel"),
            "decision_cutoff_ms": scan.get("decision_cutoff_ms"),
            "universe_rebuild": scan.get("universe_rebuild"),
            "top_long": ranked_long[:20],
            "top_short": ranked_short[:20],
            "qualified": qualified_rows,
            "rejected": rejected,
            "risk_limit_events": risk_limits,
            "execution_anomalies": anomalies,
            "event_counts": dict(Counter(e.get("kind", "UNKNOWN") for e in events)),
            "events": events,
        }
        Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({
            "scan_time_ms": now_ms,
            "eligible": report["eligible_universe_count"],
            "regime": report["regime"],
            "funnel": report["funnel"],
            "qualified": [
                {
                    "symbol": row["signal"].get("symbol"),
                    "side": row["signal"].get("side"),
                    "family": row["signal"].get("family"),
                    "signal_id": row["signal"].get("signal_id"),
                    "next_eligible_open_ms": row.get("next_eligible_open_ms"),
                }
                for row in qualified_rows
            ],
            "risk_limits": len(risk_limits),
            "anomalies": len(anomalies),
            "top_long": [
                [e.get("rank"), e.get("symbol"), e.get("score")] for e in ranked_long[:10]
            ],
            "top_short": [
                [e.get("rank"), e.get("symbol"), e.get("score")] for e in ranked_short[:10]
            ],
        }, ensure_ascii=False, indent=2))
        ledger.close()


if __name__ == "__main__":
    main()
