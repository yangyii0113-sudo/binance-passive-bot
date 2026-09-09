from __future__ import annotations

from copy import deepcopy
import hashlib
from pathlib import Path

from foxyya.ledger import EventLedger, canonical


PRODUCTION_LEDGER_PATH = Path("/data/foxyya_v2_paper.sqlite")
_ZERO_HASH = "0" * 64


def _resolved(path: str | Path) -> Path:
    return Path(path).expanduser().resolve(strict=False)


class ResearchLedger(EventLedger):
    """Append-only research ledger with production-identical hash semantics.

    Historical replay reuses the production SQLite schema and hash formula but
    keeps an in-memory cache/index so each append does not rescan and rehash the
    entire chain. Full production `EventLedger.verify()` remains available and
    is required at replay checkpoints/end-of-run. The canonical Forward Paper
    DB path is rejected unconditionally.
    """

    def __init__(self, path: str | Path):
        resolved = _resolved(path)
        if resolved == _resolved(PRODUCTION_LEDGER_PATH):
            raise ValueError("historical replay cannot open the production paper ledger")
        resolved.parent.mkdir(parents=True, exist_ok=True)
        self.path = resolved
        super().__init__(resolved)

        # Prove any pre-existing research DB is intact once before trusting its
        # cached tail. This uses the production verifier byte-for-byte.
        EventLedger.verify(self)
        self._events_cache = EventLedger.events(self)
        self._by_id = {event["event_id"]: event for event in self._events_cache}
        row = self.db.execute("SELECT event_hash FROM events ORDER BY seq DESC LIMIT 1").fetchone()
        self._last_hash = row[0] if row else _ZERO_HASH
        self._pending_intents: set[str] = set()
        self._open_positions: set[str] = set()
        for event in self._events_cache:
            self._apply_state_index(event)

    def _apply_state_index(self, event: dict) -> None:
        kind = event.get("kind")
        intent_id = event.get("intent_id")
        position_id = event.get("position_id")
        if kind == "INTENT_CREATED" and intent_id:
            self._pending_intents.add(str(intent_id))
        elif kind == "INTENT_CANCELLED" and intent_id:
            self._pending_intents.discard(str(intent_id))
        elif kind == "PAPER_ENTRY":
            if intent_id:
                self._pending_intents.discard(str(intent_id))
            if position_id:
                self._open_positions.add(str(position_id))
        elif kind == "PAPER_EXIT":
            if intent_id:
                self._pending_intents.discard(str(intent_id))
            if position_id:
                self._open_positions.discard(str(position_id))

    def get(self, event_id):
        event = self._by_id.get(event_id)
        return deepcopy(event) if event is not None else None

    def append(self, event):
        if not isinstance(event, dict) or not event.get("event_id") or not event.get("kind"):
            raise ValueError("event_id and kind required")
        raw = canonical(event)
        with self.lock:
            old = self._by_id.get(event["event_id"])
            if old is not None:
                if canonical(old) != raw:
                    raise ValueError("conflicting event_id reuse")
                return deepcopy(old)

            previous_hash = self._last_hash
            digest = hashlib.sha256((previous_hash + raw).encode()).hexdigest()
            self.db.execute("BEGIN IMMEDIATE")
            try:
                self.db.execute(
                    "INSERT INTO events(event_id,payload,previous_hash,event_hash) VALUES(?,?,?,?)",
                    (event["event_id"], raw, previous_hash, digest),
                )
                self.db.execute("COMMIT")
            except Exception:
                self.db.execute("ROLLBACK")
                raise

            stored = deepcopy(event)
            self._events_cache.append(stored)
            self._by_id[event["event_id"]] = stored
            self._last_hash = digest
            self._apply_state_index(stored)
        return event

    def events(self):
        return deepcopy(self._events_cache)

    def has_pending_intents(self) -> bool:
        return bool(self._pending_intents)

    def has_open_positions(self) -> bool:
        return bool(self._open_positions)

    def pending_intent_ids(self) -> tuple[str, ...]:
        return tuple(sorted(self._pending_intents))

    def open_position_ids(self) -> tuple[str, ...]:
        return tuple(sorted(self._open_positions))
