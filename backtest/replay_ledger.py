from __future__ import annotations

import hashlib
import json
from pathlib import Path

from foxyya.ledger import EventLedger, canonical


def _read_only(*args, **kwargs):
    raise TypeError("research event snapshots are read only; use get() for a detached copy")


class _FrozenDict(dict):
    __setitem__ = __delitem__ = clear = pop = popitem = setdefault = update = __ior__ = _read_only


class _FrozenList(list):
    __setitem__ = __delitem__ = append = clear = extend = insert = pop = remove = reverse = sort = __iadd__ = __imul__ = _read_only


def _freeze(value):
    if isinstance(value, dict):
        return _FrozenDict((key, _freeze(item)) for key, item in value.items())
    if isinstance(value, list):
        return _FrozenList(_freeze(item) for item in value)
    return value


class ReplayLedger(EventLedger):
    """Research-only cache over the canonical append-only SQLite event format.

    The shared runner only reads event snapshots, so events() exposes immutable
    dict/list values in a new ordered list; get() retains detached mutable reads.
    Each append persists the identical canonical payload/hash under FULL/WAL.
    The validated prefix is reused only while SQLite change markers agree.
    Explicit verify(), open and close always validate the full persisted chain;
    the replay engine already verifies at its start and completion boundaries.
    No strategy, execution or portfolio state is cached or reimplemented here.
    """

    def __init__(self, path):
        # Defense in depth for callers that bypass ResearchLedgerFactory.
        if Path(path).resolve() == Path("/data/foxyya_v2_paper.sqlite").resolve():
            raise ValueError("production ledger path is forbidden")
        super().__init__(path)
        self._records = []
        self._snapshots = []
        self._by_id = {}
        self._marker = None
        try:
            self.verify()
        except Exception:
            super().close()
            raise

    def _change_marker(self):
        return (
            self.db.execute("PRAGMA data_version").fetchone()[0],
            self.db.total_changes,
            self.db.execute("PRAGMA schema_version").fetchone()[0],
        )

    def _ensure_current(self):
        if self._change_marker() != self._marker:
            self.verify()

    def _sqlite_id(self, value):
        # EventLedger lets SQLite apply TEXT affinity to non-string IDs.
        if isinstance(value, str):
            return value
        return self.db.execute("SELECT CAST(? AS TEXT)", (value,)).fetchone()[0]

    def verify(self):
        with self.lock:
            own_transaction = not self.db.in_transaction
            if own_transaction:
                self.db.execute("BEGIN IMMEDIATE")
            try:
                # Always invoke the unchanged canonical persisted-chain check.
                super().verify()
                guards = dict(self.db.execute(
                    "SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name='events'"
                ))
                for action in ("update", "delete"):
                    name = f"events_no_{action}"
                    expected = f"CREATE TRIGGER {name} BEFORE {action} ON events BEGIN SELECT RAISE(ABORT,'append only');END"
                    if "".join(guards.get(name, "").split()).lower() != "".join(expected.split()).lower():
                        raise ValueError("LEDGER_HASH_MISMATCH: append-only guard changed")
                records = self.db.execute(
                    "SELECT seq,event_id,payload,previous_hash,event_hash FROM events ORDER BY seq"
                ).fetchall()
                if len(records) < len(self._records) or records[:len(self._records)] != self._records:
                    raise ValueError("LEDGER_HASH_MISMATCH: validated prefix changed")
                # Also detect illicit mutation of a cached Python snapshot.
                for record, event in zip(self._records, self._snapshots):
                    if canonical(event) != record[2]:
                        raise ValueError("LEDGER_HASH_MISMATCH: cached payload changed")
                additions = []
                for record in records[len(self._records):]:
                    event = json.loads(record[2])
                    if not isinstance(event, dict) or self._sqlite_id(event.get("event_id")) != record[1] or not event.get("kind"):
                        raise ValueError("LEDGER_HASH_MISMATCH: invalid event identity")
                    additions.append(_freeze(event))
                marker = self._change_marker()
                if own_transaction:
                    self.db.execute("COMMIT")
                new_records = records[len(self._records):]
                self._records = records
                self._snapshots.extend(additions)
                for record in new_records:
                    self._by_id[record[1]] = record[2]
                self._marker = marker
                return True
            except Exception:
                if own_transaction and self.db.in_transaction:
                    self.db.execute("ROLLBACK")
                raise

    def events(self):
        with self.lock:
            self._ensure_current()
            return list(self._snapshots)

    def get(self, event_id):
        with self.lock:
            self._ensure_current()
            raw = self._by_id.get(self._sqlite_id(event_id))
            return json.loads(raw) if raw is not None else None

    def append(self, event):
        if not isinstance(event, dict) or not event.get("event_id") or not event.get("kind"):
            raise ValueError("event_id and kind required")
        raw = canonical(event)
        # Decode once so caller-owned nested values cannot change the cache.
        snapshot = _freeze(json.loads(raw))
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                self._ensure_current()
                event_id = self._sqlite_id(event["event_id"])
                old = self._by_id.get(event_id)
                if old is not None:
                    if old != raw:
                        raise ValueError("conflicting event_id reuse")
                    self.db.execute("COMMIT")
                    return json.loads(old)
                prev = self._records[-1][4] if self._records else "0" * 64
                digest = hashlib.sha256((prev + raw).encode()).hexdigest()
                cursor = self.db.execute(
                    "INSERT INTO events(event_id,payload,previous_hash,event_hash) VALUES(?,?,?,?)",
                    (event["event_id"], raw, prev, digest),
                )
                # Capture while the write lock is held, so a later external
                # commit cannot accidentally be accepted as our own cache state.
                marker = self._change_marker()
                self.db.execute("COMMIT")
            except Exception:
                if self.db.in_transaction:
                    self.db.execute("ROLLBACK")
                raise
            self._records.append((cursor.lastrowid, event_id, raw, prev, digest))
            self._snapshots.append(snapshot)
            self._by_id[event_id] = raw
            self._marker = marker
        return event

    def close(self):
        with self.lock:
            try:
                self.verify()
            finally:
                super().close()
