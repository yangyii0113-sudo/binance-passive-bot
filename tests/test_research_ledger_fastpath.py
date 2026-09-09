from __future__ import annotations

from pathlib import Path

from backtest.research_ledger import ResearchLedger
from foxyya.ledger import EventLedger


def events():
    return [
        {"event_id": "scan-1", "kind": "SCAN_SUMMARY", "time_ms": 1, "funnel": {"qualified": 1}},
        {"event_id": "intent-1", "kind": "INTENT_CREATED", "intent_id": "i1", "time_ms": 2},
        {"event_id": "entry-1", "kind": "PAPER_ENTRY", "intent_id": "i1", "position_id": "p1", "fill_ms": 3},
        {"event_id": "mark-1", "kind": "PAPER_MARK", "position_id": "p1", "observed_ms": 4},
        {"event_id": "exit-1", "kind": "PAPER_EXIT", "intent_id": "i1", "position_id": "p1", "observed_ms": 5},
    ]


def hash_rows(ledger):
    return list(ledger.db.execute("SELECT event_id,payload,previous_hash,event_hash FROM events ORDER BY seq"))


def test_fast_research_ledger_produces_exact_production_hash_chain(tmp_path: Path):
    production = EventLedger(tmp_path / "production-shape.sqlite")
    research = ResearchLedger(tmp_path / "research.sqlite")
    try:
        for event in events():
            production.append(event)
            research.append(event)

        assert research.events() == production.events()
        assert hash_rows(research) == hash_rows(production)
        assert EventLedger.verify(research) is True
        assert production.verify() is True
    finally:
        production.close()
        research.close()


def test_research_append_does_not_full_verify_chain_before_every_insert(tmp_path: Path):
    ledger = ResearchLedger(tmp_path / "fast.sqlite")
    try:
        def forbidden_full_verify():
            raise AssertionError("full-chain verify must not run inside each historical append")

        ledger.verify = forbidden_full_verify
        ledger.append({"event_id": "e1", "kind": "TEST", "time_ms": 1})
        ledger.append({"event_id": "e2", "kind": "TEST", "time_ms": 2})
        assert len(ledger.events()) == 2
    finally:
        ledger.close()


def test_research_ledger_tracks_pending_and_open_state_and_rebuilds_on_reopen(tmp_path: Path):
    path = tmp_path / "indexed.sqlite"
    ledger = ResearchLedger(path)
    ledger.append({"event_id": "intent", "kind": "INTENT_CREATED", "intent_id": "i1", "time_ms": 1})
    assert ledger.has_pending_intents() is True
    assert ledger.has_open_positions() is False

    ledger.append({"event_id": "entry", "kind": "PAPER_ENTRY", "intent_id": "i1", "position_id": "p1", "fill_ms": 2})
    assert ledger.has_pending_intents() is False
    assert ledger.has_open_positions() is True
    ledger.close()

    reopened = ResearchLedger(path)
    try:
        assert reopened.has_pending_intents() is False
        assert reopened.has_open_positions() is True
        reopened.append({"event_id": "exit", "kind": "PAPER_EXIT", "intent_id": "i1", "position_id": "p1", "observed_ms": 3})
        assert reopened.has_open_positions() is False
        assert EventLedger.verify(reopened) is True
    finally:
        reopened.close()
