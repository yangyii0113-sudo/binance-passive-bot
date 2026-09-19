from __future__ import annotations

from datetime import datetime, timezone
import json

import pytest

from research.tw.acquisition import DatasetPolicy, SnapshottingJsonTransport, latest_row_date
from research.tw.providers.http import ProviderError, UrllibJsonTransport
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


class FlakyJsonTransport(UrllibJsonTransport):
    def __init__(self) -> None:
        super().__init__(
            timeout_seconds=1,
            attempts=2,
            retry_backoff_seconds=0,
        )
        self.payloads = iter((b"<html>edge error</html>", b'{"ok": true}'))
        self.calls = 0

    def get_bytes(self, url: str) -> bytes:
        self.calls += 1
        return next(self.payloads)


def test_json_transport_retries_transient_non_json_response():
    transport = FlakyJsonTransport()
    payload = transport.get_json("https://example.invalid/data")

    assert payload == {"ok": True}
    assert transport.calls == 2


class SequenceBytesFixture:
    def __init__(self, payloads: tuple[bytes, ...]) -> None:
        self.payloads = iter(payloads)
        self.calls = 0

    def get_bytes(self, url: str) -> bytes:
        self.calls += 1
        return next(self.payloads)


def test_snapshotting_transport_retries_transient_invalid_json(tmp_path):
    url = "https://example.invalid/snapshot"
    source = SequenceBytesFixture(
        (
            b"<html>temporary edge page</html>",
            b'[{"Date":"1150918","Code":"2330"}]',
        )
    )
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
        attempts=2,
        retry_backoff_seconds=0,
        now=lambda: datetime(2026, 9, 19, tzinfo=timezone.utc),
    )

    parsed = transport.get_json(url)

    assert parsed[0]["Code"] == "2330"
    assert source.calls == 2
    raw_files = list((tmp_path / "raw" / "fixture").rglob("*.json"))
    assert len(raw_files) == 1
    assert raw_files[0].read_bytes().startswith(b"[")
