from pathlib import Path

import pytest

from backtest.research_ledger import (
    PRODUCTION_LEDGER,
    ResearchLedgerFactory,
    deterministic_run_id,
)


def test_research_factory_refuses_production_data_root():
    with pytest.raises(ValueError, match="production ledger path is forbidden"):
        ResearchLedgerFactory(PRODUCTION_LEDGER.parent)


def test_run_id_is_deterministic_and_config_sensitive():
    args = dict(
        strategy_version="FOXYYA-EXEC-V2-20260908",
        git_sha="abc123",
        symbol="ETHUSDT",
        start_ms=1,
        end_ms=2,
    )
    a = deterministic_run_id(**args, config={"mark_proxy": "close"})
    b = deterministic_run_id(**args, config={"mark_proxy": "close"})
    c = deterministic_run_id(**args, config={"mark_proxy": "native"})

    assert a == b
    assert a.startswith("bt-")
    assert len(a) == 27
    assert a != c


def test_run_id_changes_with_git_strategy_symbol_or_window():
    base = dict(
        strategy_version="FOXYYA-EXEC-V2-20260908",
        git_sha="abc123",
        symbol="ETHUSDT",
        start_ms=1,
        end_ms=2,
        config={"mark_proxy": "close"},
    )
    reference = deterministic_run_id(**base)
    variants = [
        {**base, "strategy_version": "FOXYYA-EXEC-V2-OTHER"},
        {**base, "git_sha": "def456"},
        {**base, "symbol": "BTCUSDT"},
        {**base, "start_ms": 0},
        {**base, "end_ms": 3},
    ]
    assert all(deterministic_run_id(**variant) != reference for variant in variants)


def test_research_ledger_lives_under_run_directory_and_is_append_only(tmp_path):
    root = tmp_path / "artifacts" / "backtests"
    factory = ResearchLedgerFactory(root)
    ledger, path = factory.open("run-abc")

    assert path == (root / "run-abc" / "events.sqlite").resolve()
    assert str(path).startswith(str(root.resolve()))
    assert path != PRODUCTION_LEDGER.resolve()

    ledger.append({"event_id": "e1", "kind": "TEST"})
    assert ledger.verify() is True
    with pytest.raises(Exception, match="append only"):
        ledger.db.execute("DELETE FROM events")
    ledger.close()


def test_factory_rejects_path_traversal_and_ambiguous_run_ids(tmp_path):
    factory = ResearchLedgerFactory(tmp_path / "backtests")
    for run_id in ("", ".", "..", "../escape", "nested/run", "nested\\run"):
        with pytest.raises(ValueError, match="invalid research run id"):
            factory.open(run_id)


def test_factory_never_resolves_outside_research_root(tmp_path):
    root = (tmp_path / "backtests").resolve()
    factory = ResearchLedgerFactory(root)
    ledger, path = factory.open("safe-run_01.test")
    try:
        assert path.parent.parent == root
        assert PRODUCTION_LEDGER.resolve() not in path.parents
    finally:
        ledger.close()


def test_repeated_reads_and_appends_do_not_rescan_persisted_prefix(tmp_path):
    """Catch the quadratic SQLite/JSON prefix work that times out annual replay."""
    ledger, _ = ResearchLedgerFactory(tmp_path).open("bounded-work")
    statements = []
    ledger.db.set_trace_callback(statements.append)
    try:
        for number in range(40):
            ledger.append({"event_id": f"e{number}", "kind": "TEST", "value": number})
            assert len(ledger.events()) == number + 1
            assert ledger.get(f"e{number}")["value"] == number
        prefix_reads = [
            sql for sql in statements
            if sql.lstrip().upper().startswith("SELECT")
            and "FROM EVENTS" in sql.upper()
            and "WHERE" not in sql.upper()
        ]
        assert len(prefix_reads) <= 2, "unchanged ledger prefixes must not be reread per append/read"
        statements.clear()
        assert ledger.verify() is True
        assert any("FROM EVENTS" in sql.upper() for sql in statements), "boundary verification must read SQLite"
    finally:
        ledger.close()
