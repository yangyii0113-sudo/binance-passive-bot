#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import time
from pathlib import Path

from foxyya.integrity import audit_events


def _read_config_nav(path: Path) -> float:
    data = json.loads(path.read_text(encoding="utf-8"))
    return float(data["initial_nav_usdt"])


def _read_ledger_readonly(path: Path):
    uri = f"file:{path.resolve()}?mode=ro"
    db = sqlite3.connect(uri, uri=True)
    try:
        rows = db.execute(
            "SELECT seq,payload,previous_hash,event_hash FROM events ORDER BY seq"
        ).fetchall()
    finally:
        db.close()

    previous = "0" * 64
    events = []
    for seq, raw, previous_hash, event_hash in rows:
        if previous_hash != previous:
            raise ValueError(f"LEDGER_PREVIOUS_HASH_MISMATCH_AT_SEQ_{seq}")
        digest = hashlib.sha256((previous + raw).encode()).hexdigest()
        if digest != event_hash:
            raise ValueError(f"LEDGER_EVENT_HASH_MISMATCH_AT_SEQ_{seq}")
        events.append(json.loads(raw))
        previous = event_hash
    return events


def main():
    parser = argparse.ArgumentParser(
        description="Read-only FOXYYA canonical ledger reconciliation audit"
    )
    parser.add_argument("--db", default="/data/foxyya_v2_paper.sqlite")
    parser.add_argument("--config", default="FOXYYA_V2_CONFIG.json")
    parser.add_argument("--initial-nav", type=float)
    parser.add_argument("--now-ms", type=int)
    parser.add_argument("--output")
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.is_file():
        raise SystemExit(f"ledger not found: {db_path}")

    initial_nav = (
        float(args.initial_nav)
        if args.initial_nav is not None
        else _read_config_nav(Path(args.config))
    )
    now_ms = int(args.now_ms if args.now_ms is not None else time.time() * 1000)

    events = _read_ledger_readonly(db_path)
    report = audit_events(events, initial_nav, now_ms=now_ms)
    report["ledger_path"] = str(db_path)
    report["ledger_hash_chain_verified"] = True
    report["audit_mode"] = "READ_ONLY"
    report["real_orders"] = False

    text = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True)
    if args.output:
        Path(args.output).write_text(text + "\n", encoding="utf-8")
    print(text)

    if not report["integrity_ok"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
