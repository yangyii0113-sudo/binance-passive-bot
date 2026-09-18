from types import SimpleNamespace

import pytest

from foxyya.execution import HOUR
from foxyya.ledger import EventLedger
from foxyya.portfolio import PortfolioService
from foxyya.runner import ForwardRunner


def _decision(signal_id, decision_close_ms, family="B"):
    return SimpleNamespace(
        qualified=True,
        signal_id=signal_id,
        symbol="BTCUSDT",
        side="LONG",
        family=family,
        decision_close_ms=decision_close_ms,
        stop=98.0,
        action="ENTRY",
        quality="NORMAL",
    )


def _arm_and_fill(runner, signal_id, decision_close_ms, decision_persist_ms, open_ms):
    intent = runner.execution.create_intent(
        _decision(signal_id, decision_close_ms),
        decision_persist_ms=decision_persist_ms,
        reference_price=100.0,
        step=0.001,
        bucket="BTC_BETA",
    )
    runner.execution.revalidate_intent(
        intent["intent_id"],
        observed_ms=open_ms - 1000,
        mark=100.0,
        atr_extension=1.0,
        data_latest_ms=open_ms - 1000,
    )
    snapshot = {"hour_open_prices": {"BTCUSDT": 100.0}}
    events = runner.execute_open(snapshot, open_ms=open_ms, observed_ms=open_ms + 1)
    return next(e for e in events if e["kind"] == "PAPER_ENTRY")


def test_runner_fails_closed_when_ledger_verify_fails():
    class BadLedger:
        def verify(self):
            raise ValueError("LEDGER_HASH_MISMATCH")

        def events(self):
            return []

    with pytest.raises(ValueError, match="LEDGER_HASH_MISMATCH"):
        ForwardRunner(BadLedger(), initial_nav=1000)


def test_new_fill_uses_latest_verified_nav_after_closed_profit(tmp_path):
    ledger = EventLedger(tmp_path / "paper.sqlite")
    runner = ForwardRunner(ledger, initial_nav=1000)

    first = _arm_and_fill(
        runner,
        "signal-first",
        HOUR - 1,
        HOUR + 1,
        2 * HOUR,
    )
    service = PortfolioService(ledger, runner.risk_book, initial_nav=1000)
    service.exit(
        "profit-first",
        first["position_id"],
        2 * HOUR + 10,
        110.0,
        "TEST_PROFIT",
    )

    second_intent = runner.execution.create_intent(
        _decision("signal-second", 3 * HOUR - 1),
        decision_persist_ms=3 * HOUR + 1,
        reference_price=100.0,
        step=0.001,
        bucket="BTC_BETA",
    )
    runner.execution.revalidate_intent(
        second_intent["intent_id"],
        observed_ms=4 * HOUR - 1000,
        mark=100.0,
        atr_extension=1.0,
        data_latest_ms=4 * HOUR - 1000,
    )
    second = runner.execute_open(
        {"hour_open_prices": {"BTCUSDT": 100.0}},
        open_ms=4 * HOUR,
        observed_ms=4 * HOUR + 1,
    )[0]

    assert second["kind"] == "PAPER_ENTRY"
    assert second["size"]["nav_usdt"] > 1000
    assert second["size"]["nav_usdt"] == pytest.approx(runner.execution.nav)
    ledger.close()
