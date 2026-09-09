from __future__ import annotations

import math

from backtest.metrics import build_metrics, project_closed_trades
from foxyya.risk import FEE


def _entry(position_id, intent_id, side, family, raw_open, entry_fill, stop, qty, planned_risk, fill_ms, regime):
    signal_id = f"sig-{position_id}"
    decision_ms = fill_ms - 1_800_000
    scan_id = f"scan-{position_id}"
    return [
        {"event_id": scan_id, "kind": "SCAN_SUMMARY", "scan_id": scan_id, "time_ms": decision_ms,
         "decision_cutoff_ms": decision_ms - 1, "regime": regime,
         "funnel": {"eligible": 1, "candidate": 2, "qualified": 1, "executable": 1, "intents": 1, "filled": 0}},
        {"event_id": intent_id, "kind": "INTENT_CREATED", "intent_id": intent_id, "signal_id": signal_id,
         "symbol": "ETHUSDT", "side": side, "family": family, "decision_persist_ms": decision_ms,
         "scheduled_open_ms": fill_ms, "reserved_risk_fraction": 0.005, "bucket": "ETH_BETA"},
        {"event_id": f"entry-{position_id}", "kind": "PAPER_ENTRY", "position_id": position_id,
         "intent_id": intent_id, "signal_id": signal_id, "symbol": "ETHUSDT", "side": side,
         "family": family, "bucket": "ETH_BETA", "fill_ms": fill_ms, "observed_ms": fill_ms + 1,
         "raw_open": raw_open,
         "size": {"qty": qty, "entry_fill": entry_fill, "stop": stop, "step": 0.001,
                  "planned_loss_usdt": planned_risk, "entry_fee_usdt": qty * entry_fill * FEE,
                  "notional_usdt": qty * entry_fill},
         "books": {"5x": {"status": "MODEL_PASS", "margin_usdt": qty * entry_fill / 5},
                   "8x": {"status": "MODEL_PASS", "margin_usdt": qty * entry_fill / 8},
                   "10x": {"status": "MODEL_PASS", "margin_usdt": qty * entry_fill / 10}},
         "status": "OPEN", "real_orders": False},
    ]


def _fixture_events():
    events = []
    # LONG: raw +20; fill +18 after modeled slippage; fees and positive funding reduce/increase net.
    events += _entry("p-long", "i-long", "LONG", "A", 100.0, 100.1, 95.0, 1.0, 6.0, 3_600_000, "RISK_ON")
    events += [
        {"event_id": "mark-long-1", "kind": "PAPER_MARK", "position_id": "p-long", "observed_ms": 5_400_000, "mark": 110.0},
        {"event_id": "fund-long", "kind": "PAPER_FUNDING", "position_id": "p-long", "observed_ms": 7_200_000,
         "rate": -0.0001, "mark": 112.0, "cashflow_usdt": 0.0112},
        {"event_id": "part-long", "kind": "PAPER_PARTIAL_EXIT", "position_id": "p-long", "intent_id": "i-long",
         "observed_ms": 10_800_000, "raw_price": 115.0, "exit_fill": 114.8, "qty": 0.5, "fraction": 0.5, "reason": "TP1"},
        {"event_id": "mark-long-2", "kind": "PAPER_MARK", "position_id": "p-long", "observed_ms": 12_600_000, "mark": 122.0},
        {"event_id": "exit-long", "kind": "PAPER_EXIT", "position_id": "p-long", "intent_id": "i-long",
         "observed_ms": 14_400_000, "raw_price": 125.0, "exit_fill": 124.8, "qty": 0.5, "fraction": 1.0, "reason": "TRAIL"},
    ]

    # SHORT loser.
    events += _entry("p-short", "i-short", "SHORT", "B", 200.0, 199.8, 205.0, 1.0, 6.0, 18_000_000, "RISK_OFF")
    events += [
        {"event_id": "mark-short", "kind": "PAPER_MARK", "position_id": "p-short", "observed_ms": 19_800_000, "mark": 202.0},
        {"event_id": "fund-short", "kind": "PAPER_FUNDING", "position_id": "p-short", "observed_ms": 21_600_000,
         "rate": 0.0001, "mark": 203.0, "cashflow_usdt": 0.0203},
        {"event_id": "exit-short", "kind": "PAPER_EXIT", "position_id": "p-short", "intent_id": "i-short",
         "observed_ms": 25_200_000, "raw_price": 206.0, "exit_fill": 206.2, "qty": 1.0, "fraction": 1.0, "reason": "STRUCTURE_STOP"},
    ]
    return events


def test_closed_trade_projection_has_explicit_cost_identity_and_regime():
    trades = project_closed_trades(_fixture_events())
    assert len(trades) == 2
    long_trade = trades[0]
    assert long_trade["position_id"] == "p-long"
    assert long_trade["regime"] == "RISK_ON"
    for field in (
        "planned_risk_usdt", "gross_raw_pnl_usdt", "gross_fill_pnl_usdt", "slippage_cost_usdt",
        "fees_usdt", "funding_usdt", "net_pnl_usdt", "net_r", "mfe_r", "mae_r",
    ):
        assert field in long_trade
    assert math.isclose(
        long_trade["net_pnl_usdt"],
        long_trade["gross_fill_pnl_usdt"] - long_trade["fees_usdt"] + long_trade["funding_usdt"],
        rel_tol=0, abs_tol=1e-9,
    )
    assert math.isclose(
        long_trade["slippage_cost_usdt"],
        long_trade["gross_raw_pnl_usdt"] - long_trade["gross_fill_pnl_usdt"],
        rel_tol=0, abs_tol=1e-9,
    )
    assert long_trade["mfe_r"] > 0
    assert long_trade["mae_r"] >= 0


def test_metrics_include_performance_cost_funnel_risk_and_sample_aware_segments():
    metrics = build_metrics(
        _fixture_events(), initial_nav=1000.0, start_ms=0, end_ms=30_000_000, symbol="ETHUSDT"
    )
    assert metrics["mode"] == "HISTORICAL BACKTEST"
    assert metrics["label"] == "歷史模擬・非 Forward Performance"
    assert metrics["performance"]["closed_trades"] == 2
    assert metrics["performance"]["win_rate_n"] == 2
    assert 0 <= metrics["performance"]["win_rate"] <= 1
    assert "net_return" in metrics["performance"]
    assert "avg_r" in metrics["performance"]
    assert "expectancy_r" in metrics["performance"]
    assert "profit_factor" in metrics["performance"]
    assert "max_drawdown" in metrics["performance"]
    assert "drawdown_duration_ms" in metrics["performance"]
    assert metrics["equity_curve"]
    assert isinstance(metrics["monthly_returns"], list)

    costs = metrics["cost_attribution"]
    assert set(("fees_usdt", "slippage_usdt", "funding_usdt", "gross_raw_pnl_usdt", "net_pnl_usdt")) <= set(costs)

    funnel = metrics["funnel"]
    assert funnel["qualified"] == 2
    assert funnel["filled"] == 2
    assert funnel["qualified_to_filled"] == 1.0
    assert funnel["avoided_loss"] == "UNAVAILABLE"
    assert funnel["missed_opportunity"] == "UNAVAILABLE"

    assert metrics["risk"]["portfolio_cap_fraction"] == 0.015
    assert metrics["risk"]["max_reserved_risk_fraction"] <= 0.015 + 1e-12

    family_a = metrics["segments"]["family"]["A"]
    assert family_a["n"] == 1
    assert family_a["sample_status"] == "Sample Insufficient"
    assert metrics["segments"]["side"]["LONG"]["n"] == 1
    assert metrics["segments"]["regime"]["RISK_OFF"]["n"] == 1
    assert metrics["segments"]["book"]["5x"]["n"] == 2
