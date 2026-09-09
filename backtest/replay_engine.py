from __future__ import annotations

import hashlib

from foxyya.execution import HOUR, OPEN_RECEIPT_MS
from foxyya.ledger import canonical
from foxyya.runner import ForwardRunner

from .research_ledger import ResearchLedger


class HistoricalReplayEngine:
    """Drive the production ForwardRunner from a historical market adapter.

    The engine owns only orchestration and research-ledger isolation. Strategy,
    sizing, execution, funding and position-management behavior remain in the
    production `foxyya.*` modules.
    """

    mode = "HISTORICAL_BACKTEST"
    real_orders = False

    def __init__(self, adapter, db_path, *, initial_nav: float):
        if not hasattr(adapter, "clock") or not callable(getattr(adapter, "snapshot", None)):
            raise TypeError("historical adapter with clock and snapshot() required")
        self.adapter = adapter
        self.clock = adapter.clock
        self.ledger = ResearchLedger(db_path)
        self.runner = ForwardRunner(self.ledger, initial_nav=float(initial_nav))
        self.initial_nav = float(initial_nav)

    def _event_digest(self) -> str:
        return hashlib.sha256(canonical(self.ledger.events()).encode("utf-8")).hexdigest()

    def cycle_at(self, now_ms: int) -> dict:
        now_ms = int(now_ms)
        self.clock.advance_to(now_ms)
        snapshot = self.adapter.snapshot()
        if int(snapshot.get("built_at_ms", -1)) != now_ms:
            raise ValueError("historical snapshot timestamp must equal replay clock")

        open_ms = (now_ms // HOUR) * HOUR
        fills = []
        if 0 <= now_ms - open_ms <= OPEN_RECEIPT_MS:
            fills = self.runner.execute_open(snapshot, open_ms=open_ms, observed_ms=now_ms)
        funding = self.runner.apply_funding(snapshot, now_ms=now_ms)
        managed = self.runner.manage_positions(snapshot, now_ms=now_ms)
        revalidated = self.runner.revalidate(snapshot, now_ms=now_ms)
        scanned = self.runner.scan_if_new_close(snapshot, now_ms=now_ms)

        self.ledger.verify()
        return {
            "mode": self.mode,
            "real_orders": self.real_orders,
            "time_ms": now_ms,
            "fills": [event.get("kind") for event in fills],
            "funding": [event.get("kind") for event in funding],
            "managed": [event.get("kind") for event in managed],
            "revalidated": len(revalidated),
            "scan": scanned.get("funnel") if scanned else None,
            "data_manifest_sha256": snapshot.get("data_manifest_sha256"),
            "event_digest": self._event_digest(),
        }

    def close(self) -> None:
        self.ledger.close()
