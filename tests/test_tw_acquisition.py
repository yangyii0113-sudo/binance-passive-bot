from __future__ import annotations

from datetime import datetime, timezone
import json

import pytest

from research.tw.acquisition import DatasetPolicy, SnapshottingJsonTransport, latest_row_date
from research.tw.providers.http import ProviderError
from research.tw.storage import RawSnapshotStore


class BytesFixture:
    def __init__(self, payload: bytes) -> None:
        self.payload = payload
        self.calls = 0

    def get_bytes(self, url: str) -> bytes:
        self.calls += 1
        return self.payload


def test_snapshotting_transport_preserves_exact_bytes(tmp_path):
    payload = b'[{"Date":"1150918","Code":"2330"}]'
    source = BytesFixture(payload)
    url = "https://example.invalid/data"
    transport = SnapshottingJsonTransport(
        transport=source,
        store=RawSnapshotStore(tmp_path),
        policies=(
            DatasetPolicy(
                "fixture",
                url,
                latest_row_date("Date"),
            ),
        ),
        now=lambda: datetime(2026, 9, 19, tzinfo=timezone.utc),
    )

    parsed = transport.get_json(url)
    assert parsed[0]["Code"] == "2330"
    assert source.calls == 1

    raw_files = list((tmp_path / "raw" / "fixture").rglob("*.json"))
    assert len(raw_files) == 1
    assert raw_files[0].read_bytes() == payload


def test_snapshotting_transport_rejects_unregistered_dataset(tmp_path):
    transport = SnapshottingJsonTransport(
        transport=BytesFixture(b"[]"),
        store=RawSnapshotStore(tmp_path),
        policies=(),
    )
    with pytest.raises(ProviderError, match="no snapshot policy"):
        transport.get_json("https://example.invalid/unregistered")
