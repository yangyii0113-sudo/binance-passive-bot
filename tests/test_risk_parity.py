from pathlib import Path
from types import SimpleNamespace

from foxyya.execution import HOUR
from foxyya.risk import leverage_books, size_position


def _decision():
    return SimpleNamespace(
        qualified=True,
        signal_id="signal-risk-parity",
        decision_close_ms=10 * HOUR,
        symbol="ETHUSDT",
        side="LONG",
        family="A",
        stop=95.0,
        action="ENTRY",
        quality="NORMAL",
    )


def test_research_execution_uses_exact_production_sizing_and_books(tmp_path: Path):
    from backtest.research_ledger import ResearchLedger
    from foxyya.runner import ForwardRunner

    ledger = ResearchLedger(tmp_path / "risk-parity.sqlite")
    try:
        runner = ForwardRunner(ledger, initial_nav=1000)
        persist_ms = 10 * HOUR + 7 * 60_000
        intent = runner.execution.create_intent(
            _decision(),
            decision_persist_ms=persist_ms,
            reference_price=100.0,
            step=0.001,
            bucket="ETH_BETA",
        )
        assert intent["scheduled_open_ms"] == 11 * HOUR

        runner.execution.revalidate_intent(
            intent["intent_id"],
            observed_ms=10 * HOUR + 30 * 60_000,
            mark=100.0,
            atr_extension=1.0,
            data_latest_ms=10 * HOUR + 30 * 60_000,
        )
        entry = runner.execution.fill_due_intent(
            intent["intent_id"],
            11 * HOUR,
            100.0,
            observed_ms=11 * HOUR,
        )

        expected_size = size_position(1000, "A", "LONG", 100.0, 95.0, 0.001)
        assert entry["size"] == expected_size
        assert entry["books"] == leverage_books(expected_size)
        assert runner.risk_book.total_fraction == 0.005
    finally:
        ledger.close()
