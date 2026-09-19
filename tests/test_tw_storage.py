from __future__ import annotations

from datetime import datetime, timezone
import json

from research.tw.contracts import Availability, Observation
from research.tw.storage import ObservationStore, RawSnapshotStore


def test_raw_snapshot_store_is_content_addressed_and_idempotent(tmp_path):
    store = RawSnapshotStore(tmp_path)
    payload = b'[{"Date":"1150918","Code":"2330"}]'

    first = store.append(
        dataset="twse_stock_day_all",
        observed_date="2026-09-18",
        captured_at="2026-09-19T15:00:00+00:00",
        source_url="https://example.invalid/source",
        payload=payload,
    )
    second = store.append(
        dataset="twse_stock_day_all",
        observed_date="2026-09-18",
        captured_at="2026-09-19T15:01:00+00:00",
        source_url="https://example.invalid/source",
        payload=payload,
    )

    assert first.sha256 == second.sha256
    assert (tmp_path / first.relative_path).read_bytes() == payload

    manifest = tmp_path / "manifests" / "twse_stock_day_all.jsonl"
    lines = manifest.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1
    assert json.loads(lines[0])["sha256"] == first.sha256


def test_observation_store_deduplicates_exact_records(tmp_path):
    store = ObservationStore(tmp_path / "observations.sqlite")
    observation = Observation(
        instrument_id="twse:2330",
        field="close",
        value=1255.0,
        source="TWSE:STOCK_DAY_ALL",
        observed_at="2026-09-18",
        received_at=datetime(2026, 9, 19, tzinfo=timezone.utc).isoformat(),
        availability=Availability.AVAILABLE,
        metadata={"venue": "TWSE"},
    )

    assert store.append_many([observation]) == 1
    assert store.append_many([observation]) == 0
    assert store.count() == 1

    rows = store.rows_for("twse:2330", "close")
    assert rows[0]["value"] == 1255.0
    assert rows[0]["availability"] == "AVAILABLE"
