from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from foxyya.ledger import EventLedger

from backtest.replay_ledger import ReplayLedger

PRODUCTION_LEDGER = Path("/data/foxyya_v2_paper.sqlite")
_RUN_ID = re.compile(r"^[A-Za-z0-9._-]+$")


def _canonical(value) -> str:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )


def deterministic_run_id(
    *,
    strategy_version: str,
    git_sha: str,
    symbol: str,
    start_ms: int,
    end_ms: int,
    config: dict,
) -> str:
    payload = {
        "strategy_version": str(strategy_version),
        "git_sha": str(git_sha),
        "symbol": str(symbol),
        "start_ms": int(start_ms),
        "end_ms": int(end_ms),
        "config": config,
    }
    digest = hashlib.sha256(_canonical(payload).encode("utf-8")).hexdigest()
    return "bt-" + digest[:24]


class ResearchLedgerFactory:
    """Creates append-only research ledgers outside the production ledger boundary."""

    def __init__(self, root: Path):
        self.root = Path(root).resolve()
        production = PRODUCTION_LEDGER.resolve()
        if self.root in {production, production.parent}:
            raise ValueError("production ledger path is forbidden")

    @staticmethod
    def _validate_run_id(run_id: str) -> str:
        value = str(run_id)
        if not value or value in {".", ".."} or not _RUN_ID.fullmatch(value):
            raise ValueError("invalid research run id")
        return value

    def open(self, run_id: str) -> tuple[EventLedger, Path]:
        run_id = self._validate_run_id(run_id)
        run_dir = (self.root / run_id).resolve()
        try:
            run_dir.relative_to(self.root)
        except ValueError as exc:
            raise ValueError("invalid research run id") from exc

        ledger_path = (run_dir / "events.sqlite").resolve()
        if ledger_path == PRODUCTION_LEDGER.resolve():
            raise ValueError("production ledger path is forbidden")

        run_dir.mkdir(parents=True, exist_ok=True)
        return ReplayLedger(ledger_path), ledger_path
