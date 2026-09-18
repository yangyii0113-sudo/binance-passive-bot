import json
import sqlite3
import time
from pathlib import Path

from foxyya.integrity import audit_events
from foxyya.ledger import EventLedger
from foxyya.execution import ExecutionEngine, HOUR
from foxyya.risk import RiskBook
from foxyya.portfolio import PortfolioService


def _decision(signal_id="signal-1"):
    class D:
        qualified = True
        symbol = "BTCUSDT"
        side = "LONG"
        family = "B"
        decision_close_ms = HOUR - 1
        stop = 98.0
        action = "ENTRY"
        quality = "NORMAL"
    d = D()
    d.signal_id = signal_id
    return d


def _closed_trade(tmp_path):
    ledger = EventLedger(tmp_path / "paper.sqlite")
    risk = RiskBook(1000)
    engine = ExecutionEngine(ledger, risk, nav=1000)
    intent = engine.create_intent(
        _decision(),
        decision_persist_ms=HOUR + 1,
        reference_price=100.0,
        step=0.001,
        bucket="BTC_BETA",
    )
    engine.revalidate_intent(
        intent["intent_id"],
        observed_ms=2 * HOUR - 1000,
        mark=100.0,
        atr_extension=1.0,
        data_latest_ms=2 * HOUR - 1000,
    )
    entry = engine.fill_due_intent(
        intent["intent_id"], 2 * HOUR, 100.0, observed_ms=2 * HOUR + 1
    )
    service = PortfolioService(ledger, risk, initial_nav=1000)
    service.mark(entry["position_id"], 2 * HOUR + 2, 102.0)
    service.partial_exit(
        "tp1", entry["position_id"], 2 * HOUR + 3, 103.0, 0.5, "TP1"
    )
    service.exit(
        "trail", entry["position_id"], 2 * HOUR + 4, 101.0, "TRAIL"
    )
    return ledger


def test_audit_closed_lifecycle_and_nav(tmp_path):
    ledger = _closed_trade(tmp_path)
    report = audit_events(ledger.events(), 1000, now_ms=3 * HOUR)
    assert report["integrity_ok"] is True
    assert report["open_position_count"] == 0
    assert report["pending_intent_count"] == 0
    assert report["active_reserved_risk_fraction"] == 0
    assert report["nav_verified"] is True
    assert report["verified_nav_usdt"] is not None
    assert report["funnel_24h"]["qualified"] == 1
    assert report["funnel_24h"]["filled"] == 1
    ledger.close()


def test_audit_detects_orphan_open_position_state():
    events = [
        {
            "event_id": "entry-orphan",
            "kind": "PAPER_ENTRY",
            "intent_id": "missing-intent",
            "signal_id": "sig",
            "position_id": "pos",
            "symbol": "ETHUSDT",
            "side": "LONG",
            "family": "B",
            "bucket": "ETH_BETA",
            "fill_ms": 1,
            "observed_ms": 1,
            "size": {
                "qty": 1.0,
                "entry_fill": 100.0,
                "stop": 95.0,
                "step": 0.001,
                "planned_loss_usdt": 5.0,
                "entry_fee_usdt": 0.05,
            },
            "books": {
                "5x": {"status": "MODEL_PASS", "margin_usdt": 20.0},
                "8x": {"status": "MODEL_PASS", "margin_usdt": 12.5},
                "10x": {"status": "MODEL_PASS", "margin_usdt": 10.0},
            },
        }
    ]
    report = audit_events(events, 1000, now_ms=1000)
    assert report["integrity_ok"] is False
    assert report["open_position_count"] == 1
    assert any(x["code"] == "ENTRY_WITHOUT_INTENT" for x in report["issues"])


def test_audit_detects_exit_quantity_over_remaining(tmp_path):
    ledger = _closed_trade(tmp_path)
    events = ledger.events()
    bad = dict(events[-1])
    bad["event_id"] = "bad-extra-exit"
    bad["kind"] = "PAPER_EXIT"
    bad["qty"] = 999.0
    bad["observed_ms"] += 1
    events.append(bad)
    report = audit_events(events, 1000, now_ms=3 * HOUR)
    assert report["integrity_ok"] is False
    assert any(
        x["code"] in {"POSITION_EVENT_AFTER_FINAL_EXIT", "EXIT_QTY_EXCEEDS_REMAINING"}
        for x in report["issues"]
    )
    ledger.close()
