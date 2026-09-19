from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "research" / "tw" / "p3_manifest.json"


def _load():
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def test_p3_has_exactly_one_active_slice_until_complete():
    manifest = _load()
    active = [
        item["id"]
        for item in manifest["slices"]
        if item["status"] == "ACTIVE"
    ]
    if all(item["status"] == "COMPLETE" for item in manifest["slices"]):
        assert active == []
    else:
        assert active == [manifest["active_slice"]]


def test_p3_active_or_complete_dependencies_are_complete():
    manifest = _load()
    slices = {item["id"]: item for item in manifest["slices"]}
    for item in slices.values():
        if item["status"] not in {"ACTIVE", "COMPLETE"}:
            continue
        for dependency in item["depends_on"]:
            assert slices[dependency]["status"] == "COMPLETE"
