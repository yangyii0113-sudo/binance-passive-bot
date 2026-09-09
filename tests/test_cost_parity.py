from pathlib import Path
from types import SimpleNamespace

from foxyya.execution import HOUR
from foxyya.risk import FEE, FUNDING_RESERVE, SLIPPAGE, size_position


def _decision():
    return SimpleNamespace(
        qualified=True,
        signal_id="signal-cost-parity",
        decision_close_ms=20 * HOUR,
        symbol="ETHUSDT",
        side="LONG",
        family="B",
        stop=1900.0,
        action="ENTRY",
        quality="NORMAL",
    )


def test_research_entry_cost_model_is_the_production_cost_model(tmp_path: Path):
    from backtest.research_ledger import ResearchLedger
    from foxyya.runner import ForwardRunner

    ledger = ResearchLedger(tmp_path / "cost-parity.sqlite")
    try:
        runner = ForwardRunner(ledger, initial_nav=1000)
        persist_ms = 20 * HOUR + 5 * 60_000
        intent = runner.execution.create_intent(
            _decision(),
            decision_persist_ms=persist_ms,
            reference_price=2000.0,
            step=0.001,
            bucket="ETH_BETA",
        )
        runner.execution.revalidate_intent(
            intent["intent_id"],
            observed_ms=20 * HOUR + 30 * 60_000,
            mark=2000.0,
            atr_extension=1.0,
            data_latest_ms=20 * HOUR + 30 * 60_000,
        )
        entry = runner.execution.fill_due_intent(
            intent["intent_id"],
            21 * HOUR,
            2000.0,
            observed_ms=21 * HOUR,
        )

        expected = size_position(1000, "B", "LONG", 2000.0, 1900.0, 0.001)
        assert entry["size"]["cost_model"] == {
            "fee_each_side": FEE,
            "adverse_slippage_each_side": SLIPPAGE,
            "funding_reserve": FUNDING_RESERVE,
        }
        assert entry["size"]["entry_fee_usdt"] == expected["entry_fee_usdt"]
        assert entry["size"]["exit_fee_at_stop_usdt"] == expected["exit_fee_at_stop_usdt"]
        assert entry["size"]["funding_reserve_usdt"] == expected["funding_reserve_usdt"]
        assert entry["size"]["planned_loss_usdt"] == expected["planned_loss_usdt"]
    finally:
        ledger.close()
