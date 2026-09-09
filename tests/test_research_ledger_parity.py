from __future__ import annotations

import json
import sqlite3
from types import SimpleNamespace

import pytest

from backtest.research_ledger import ResearchLedgerFactory
from foxyya.execution import HOUR
from foxyya.ledger import EventLedger
from foxyya.portfolio import replay_books
from foxyya.runner import ForwardRunner


def _rows(ledger):
    return ledger.db.execute("SELECT seq,event_id,payload,previous_hash,event_hash FROM events ORDER BY seq").fetchall()


def _lifecycle(ledger):
    """Exercise the unmodified shared runner, execution and portfolio services."""
    runner = ForwardRunner(ledger, initial_nav=1000)
    decision = SimpleNamespace(
        qualified=True, signal_id="research-parity-signal", symbol="ETHUSDT",
        side="LONG", family="A", decision_close_ms=HOUR - 1, stop=98,
    )
    intent = runner.execution.create_intent(
        decision, decision_persist_ms=HOUR + 1, reference_price=100,
        step=.001, bucket="ETH_BETA",
    )
    bars = [{"high": 101., "low": 99., "close": 100.} for _ in range(30)]
    snapshot = {
        "marks": {"ETHUSDT": 100.}, "hour_open_prices": {"ETHUSDT": 100.},
        "klines": {"ETHUSDT": {"1h": bars}},
    }
    assert len(runner.pending()) == 1
    runner.revalidate(snapshot, now_ms=2 * HOUR - 1)
    runner.execute_open(snapshot, open_ms=2 * HOUR, observed_ms=2 * HOUR + 1)
    snapshot["realized_funding"] = {"ETHUSDT": [{
        "fundingTime": 2 * HOUR, "fundingRate": ".0001", "markPrice": "100",
    }]}
    runner.apply_funding(snapshot, now_ms=2 * HOUR + 2)
    runner.apply_funding(snapshot, now_ms=2 * HOUR + 2)
    for offset, mark in ((3, 104.), (4, 106.), (5, 99.)):
        snapshot["marks"]["ETHUSDT"] = mark
        runner.manage_positions(snapshot, now_ms=2 * HOUR + offset)
    # A second intent must cancel on the actual missing-preopen path.
    decision.signal_id = "research-parity-cancel"
    decision.decision_close_ms = 3 * HOUR - 1
    runner.execution.create_intent(
        decision, decision_persist_ms=3 * HOUR + 1, reference_price=100,
        step=.001, bucket="ETH_BETA",
    )
    runner.execute_open(snapshot, open_ms=4 * HOUR, observed_ms=4 * HOUR + 1)
    assert runner.pending() == []
    assert intent["scheduled_open_ms"] == 2 * HOUR
    return replay_books(ledger, 1000), runner.diagnostics(4 * HOUR)


def test_real_forward_runner_events_hashes_and_reopen_match_canonical_ledger(tmp_path):
    canonical = EventLedger(tmp_path / "canonical.sqlite")
    factory = ResearchLedgerFactory(tmp_path / "research")
    research, path = factory.open("lifecycle")
    try:
        assert _lifecycle(research) == _lifecycle(canonical)
        assert research.events() == canonical.events()
        assert _rows(research) == _rows(canonical)
        kinds = {event["kind"] for event in research.events()}
        assert {
            "INTENT_CREATED", "INTENT_REVALIDATED", "PAPER_ENTRY", "PAPER_FUNDING",
            "PAPER_MARK", "PAPER_PARTIAL_EXIT", "PAPER_TRAILING_UPDATE", "SHADOW_OUTCOME",
            "PAPER_EXIT", "EXECUTION_ANOMALY", "INTENT_CANCELLED",
        } <= kinds
        original = _rows(research)
        assert research.verify() is True
    finally:
        research.close()
        canonical.close()
    reopened, _ = factory.open("lifecycle")
    canonical_reopen = EventLedger(path)
    try:
        assert reopened.events() == canonical_reopen.events()
        assert _rows(reopened) == original
        assert reopened.verify() is True
        assert ForwardRunner(reopened, initial_nav=1000).pending() == []
        assert ForwardRunner(reopened, initial_nav=1000).risk_book.total_fraction == 0
    finally:
        reopened.close()
        canonical_reopen.close()


def test_duplicate_conflicting_ids_and_caller_mutation_cannot_poison_replay(tmp_path):
    ledger, _ = ResearchLedgerFactory(tmp_path).open("identity")
    event = {"event_id": "nested", "kind": "TEST", "nested": {"list": [1, {"x": 2}]}}
    original = json.loads(json.dumps(event))
    try:
        ledger.append(event)
        event["nested"]["list"][1]["x"] = 99
        detached = ledger.get("nested")
        detached["nested"]["list"][1]["x"] = 88
        assert ledger.get("nested") == original
        assert ledger.append(original) == original
        with pytest.raises(ValueError, match="conflicting event_id reuse"):
            ledger.append(event)
        assert len(ledger.events()) == 1
        assert ledger.events()[0] == original
        # Read snapshots must either detach or explicitly refuse mutations.
        snapshot = ledger.events()[0]
        try:
            snapshot["nested"]["list"][1]["x"] = 77
        except TypeError:
            pass
        assert ledger.events()[0] == original
        assert ledger.verify() is True
    finally:
        ledger.close()


@pytest.mark.parametrize("event_id, lookup", [(True, 1), (42, "42"), (1e20, 1e20)])
def test_sqlite_event_identity_coercion_matches_canonical_ledger(tmp_path, event_id, lookup):
    canonical = EventLedger(tmp_path / "canonical-ids.sqlite")
    ledger, _ = ResearchLedgerFactory(tmp_path).open("ids")
    event = {"event_id": event_id, "kind": "TEST"}
    try:
        canonical.append(event)
        ledger.append(event)
        assert ledger.get(lookup) == canonical.get(lookup)
        assert ledger.append(event) == canonical.append(event)
        assert _rows(ledger) == _rows(canonical)
        assert ledger.verify() is True
    finally:
        ledger.close()
        canonical.close()


@pytest.mark.parametrize("operation", ["events", "get", "append", "verify", "close"])
@pytest.mark.parametrize("external", [False, True])
def test_tamper_is_detected_before_cached_reads_appends_and_boundaries(tmp_path, operation, external):
    ledger, path = ResearchLedgerFactory(tmp_path).open("tamper")
    ledger.append({"event_id": "e1", "kind": "TEST"})
    ledger.events()
    writer = sqlite3.connect(path, isolation_level=None) if external else ledger.db
    writer.execute("DROP TRIGGER events_no_update")
    writer.execute("UPDATE events SET payload='{}' WHERE event_id='e1'")
    if external:
        writer.close()
    try:
        with pytest.raises(ValueError, match="LEDGER_HASH_MISMATCH"):
            if operation == "get":
                ledger.get("e1")
            elif operation == "append":
                ledger.append({"event_id": "e2", "kind": "TEST"})
            else:
                getattr(ledger, operation)()
    finally:
        try:
            ledger.close()
        except (ValueError, sqlite3.ProgrammingError):
            pass


def test_reopen_rejects_corrupt_persisted_chain(tmp_path):
    factory = ResearchLedgerFactory(tmp_path)
    ledger, path = factory.open("bad-reopen")
    ledger.append({"event_id": "e1", "kind": "TEST"})
    ledger.close()
    with sqlite3.connect(path) as writer:
        writer.execute("DROP TRIGGER events_no_update")
        writer.execute("UPDATE events SET previous_hash='bad'")
    with pytest.raises(ValueError, match="LEDGER_HASH_MISMATCH"):
        factory.open("bad-reopen")


def test_external_valid_append_is_verified_and_visible_in_order(tmp_path):
    ledger, path = ResearchLedgerFactory(tmp_path).open("external-append")
    other = EventLedger(path)
    try:
        ledger.append({"event_id": "e1", "kind": "TEST"})
        other.append({"event_id": "e2", "kind": "TEST"})
        assert [e["event_id"] for e in ledger.events()] == ["e1", "e2"]
        ledger.append({"event_id": "e3", "kind": "TEST"})
        assert ledger.events() == other.events()
        assert _rows(ledger) == _rows(other)
        assert ledger.verify() is True
    finally:
        ledger.close()
        other.close()


@pytest.mark.parametrize("trigger", ["events_no_update", "events_no_delete"])
def test_dropping_append_only_guard_fails_before_next_append(tmp_path, trigger):
    ledger, _ = ResearchLedgerFactory(tmp_path).open("missing-guard")
    ledger.append({"event_id": "e1", "kind": "TEST"})
    ledger.db.execute(f"DROP TRIGGER {trigger}")
    try:
        with pytest.raises(ValueError, match="LEDGER_HASH_MISMATCH"):
            ledger.append({"event_id": "e2", "kind": "TEST"})
    finally:
        try:
            ledger.close()
        except ValueError:
            pass


def test_deleted_tail_is_detected_even_when_remaining_chain_is_valid(tmp_path):
    ledger, _ = ResearchLedgerFactory(tmp_path).open("deleted-tail")
    ledger.append({"event_id": "e1", "kind": "TEST"})
    ledger.append({"event_id": "e2", "kind": "TEST"})
    ledger.db.execute("DROP TRIGGER events_no_delete")
    ledger.db.execute("DELETE FROM events WHERE event_id='e2'")
    try:
        with pytest.raises(ValueError, match="LEDGER_HASH_MISMATCH"):
            ledger.verify()
    finally:
        try:
            ledger.close()
        except ValueError:
            pass


def test_optional_replay_progress_reports_bounded_cycles_and_final(tmp_path):
    from backtest.historical_clock import HistoricalClock
    from backtest.replay_engine import HistoricalReplayEngine
    from test_replay_lifecycle import FakeMarket, FakeRunner

    start, end = HOUR, 242 * HOUR
    clock = HistoricalClock(start, end)
    market = FakeMarket(clock, list(range(start, end, HOUR)))
    ledger = EventLedger(tmp_path / "progress.sqlite")
    updates = []
    try:
        result = HistoricalReplayEngine(
            clock, market, ledger, initial_nav=1000, runner=FakeRunner(),
            progress=lambda completed, total: updates.append((completed, total)),
        ).run(start_ms=start, end_ms=end, run_id="progress", strategy_version="test", git_sha="test")
        assert updates == [(240, 241), (241, 241)]
        assert result["cycle_count"] == 241
        assert [e["kind"] for e in ledger.events()] == ["BACKTEST_RUN_STARTED", "BACKTEST_RUN_COMPLETED"]
    finally:
        ledger.close()
