from __future__ import annotations

import hashlib
import json
from typing import Any


SCHEMA = "foxyya-backtest-data-manifest/1"


def _canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _sha256(value: Any) -> str:
    return hashlib.sha256(_canonical_bytes(value)).hexdigest()


def _kline_record(rows: list) -> dict:
    if not rows:
        return {"row_count": 0, "first_open_ms": None, "last_close_ms": None, "sha256": _sha256(rows)}
    return {
        "row_count": len(rows),
        "first_open_ms": int(rows[0][0]),
        "last_close_ms": int(rows[-1][6]),
        "sha256": _sha256(rows),
    }


def _funding_record(rows: list) -> dict:
    times = []
    for row in rows:
        try:
            times.append(int(row["fundingTime"]))
        except (KeyError, TypeError, ValueError):
            continue
    return {
        "row_count": len(rows),
        "first_funding_ms": min(times) if times else None,
        "last_funding_ms": max(times) if times else None,
        "sha256": _sha256(rows),
    }


def build_data_manifest(exchange_info: dict, klines: dict, *, funding_rows: dict | None = None) -> dict:
    funding_rows = funding_rows or {}
    body = {
        "schema": SCHEMA,
        "exchange_info": {
            "symbol_count": len(exchange_info.get("symbols", [])),
            "sha256": _sha256(exchange_info),
        },
        "klines": {
            symbol: {
                interval: _kline_record(rows)
                for interval, rows in sorted(intervals.items())
            }
            for symbol, intervals in sorted(klines.items())
        },
        "funding": {
            symbol: _funding_record(rows)
            for symbol, rows in sorted(funding_rows.items())
        },
    }
    body["manifest_sha256"] = _sha256(body)
    return body
