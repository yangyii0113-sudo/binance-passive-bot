from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "research" / "tw" / "phase_manifest.json"


def _load():
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def test_exactly_one_phase_is_active_until_all_complete():
    manifest = _load()
    statuses = [item["status"] for item in manifest["phases"]]
    active = [item["id"] for item in manifest["phases"] if item["status"] == "ACTIVE"]
    if all(status == "COMPLETE" for status in statuses):
        assert active == []
    else:
        assert len(active) == 1
        assert manifest["active_phase"] == active[0]


def test_active_or_complete_phase_dependencies_are_complete():
    manifest = _load()
    phases = {item["id"]: item for item in manifest["phases"]}
    for phase in phases.values():
        if phase["status"] not in {"ACTIVE", "COMPLETE"}:
            continue
        for dependency in phase["depends_on"]:
            assert phases[dependency]["status"] == "COMPLETE", (
                f'{phase["id"]} cannot be {phase["status"]} while '
                f'{dependency} is {phases[dependency]["status"]}'
            )


def test_status_values_are_closed_set():
    manifest = _load()
    allowed = {"ACTIVE", "COMPLETE", "LOCKED"}
    assert {item["status"] for item in manifest["phases"]} <= allowed
