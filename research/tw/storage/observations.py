from __future__ import annotations

from dataclasses import asdict
from hashlib import sha256
import json
from pathlib import Path
import sqlite3
from typing import Iterable

from ..contracts import Observation


class ObservationStore:
    """Append-only normalized observation store.

    De-duplication is content-based. There is deliberately no update/delete
    API in this Research Plane store.
    """

    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path)
        connection.execute("PRAGMA journal_mode=WAL")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS observations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    record_hash TEXT NOT NULL UNIQUE,
                    instrument_id TEXT NOT NULL,
                    field TEXT NOT NULL,
                    value_json TEXT,
                    source TEXT,
                    observed_at TEXT,
                    received_at TEXT,
                    availability TEXT NOT NULL,
                    metadata_json TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_observation_lookup
                ON observations(instrument_id, field, observed_at);
                """
            )

    @staticmethod
    def _payload(observation: Observation) -> dict:
        payload = asdict(observation)
        payload["availability"] = observation.availability.value
        return payload

    @classmethod
    def _record_hash(cls, observation: Observation) -> str:
        canonical = json.dumps(
            cls._payload(observation),
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        ).encode("utf-8")
        return sha256(canonical).hexdigest()

    def append_many(self, observations: Iterable[Observation]) -> int:
        inserted = 0
        with self._connect() as connection:
            for observation in observations:
                payload = self._payload(observation)
                cursor = connection.execute(
                    """
                    INSERT OR IGNORE INTO observations (
                        record_hash,
                        instrument_id,
                        field,
                        value_json,
                        source,
                        observed_at,
                        received_at,
                        availability,
                        metadata_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        self._record_hash(observation),
                        observation.instrument_id,
                        observation.field,
                        json.dumps(
                            payload["value"],
                            ensure_ascii=False,
                            separators=(",", ":"),
                            default=str,
                        ),
                        observation.source,
                        observation.observed_at,
                        observation.received_at,
                        observation.availability.value,
                        json.dumps(
                            observation.metadata,
                            ensure_ascii=False,
                            sort_keys=True,
                            separators=(",", ":"),
                            default=str,
                        ),
                    ),
                )
                inserted += max(0, cursor.rowcount)
        return inserted

    def count(self) -> int:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT COUNT(*) FROM observations"
            ).fetchone()
        return int(row[0])

    def rows_for(
        self,
        instrument_id: str,
        field: str,
    ) -> list[dict]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT instrument_id, field, value_json, source, observed_at,
                       received_at, availability, metadata_json
                FROM observations
                WHERE instrument_id = ? AND field = ?
                ORDER BY observed_at ASC, id ASC
                """,
                (instrument_id, field),
            ).fetchall()

        return [
            {
                "instrument_id": row[0],
                "field": row[1],
                "value": json.loads(row[2]) if row[2] is not None else None,
                "source": row[3],
                "observed_at": row[4],
                "received_at": row[5],
                "availability": row[6],
                "metadata": json.loads(row[7]),
            }
            for row in rows
        ]
