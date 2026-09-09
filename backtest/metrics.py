from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Iterable

from foxyya.risk import FEE, PORTFOLIO_CAP

MODE = "HISTORICAL BACKTEST"
LABEL = "歷史模擬・非 Forward Performance"
BOOKS = ("5x", "8x", "10x")


def _event_time(event: dict) -> int:
    for key in ("observed_ms", "fill_ms", "time_ms", "persisted_ms", "decision_persist_ms", "decision_close_ms"):
        value = event.get(key)
        if value is not None:
            return int(value)
    return 0


def _safe_float(value, default=0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _profit_factor(values: Iterable[float]):
    values = list(values)
    gains = sum(x for x in values if x > 0)
    losses = -sum(x for x in values if x < 0)
    if losses <= 1e-12:
        return None
    return gains / losses


def _segment_summary(trades: list[dict]) -> dict:
    n = len(trades)
    net_values = [float(t["net_pnl_usdt"]) for t in trades]
    r_values = [float(t["net_r"]) for t in trades]
    wins = sum(x > 0 for x in net_values)
    return {
        "n": n,
        "sample_status": "Sample Insufficient" if n < 20 else "Sample Adequate",
        "win_rate": (wins / n) if n else None,
        "net_pnl_usdt": sum(net_values),
        "avg_r": (sum(r_values) / n) if n else None,
        "expectancy_r": (sum(r_values) / n) if n else None,
        "profit_factor": _profit_factor(net_values),
    }


def project_closed_trades(events: list[dict]) -> list[dict]:
    intents = {e.get("intent_id"): e for e in events if e.get("kind") == "INTENT_CREATED" and e.get("intent_id")}
    scans_by_time = {
        int(e.get("time_ms")): e
        for e in events
        if e.get("kind") == "SCAN_SUMMARY" and e.get("time_ms") is not None
    }
    entries = {
        e.get("position_id"): e
        for e in events
        if e.get("kind") == "PAPER_ENTRY" and e.get("position_id")
    }
    exits_by_position: dict[str, list[dict]] = defaultdict(list)
    funding_by_position: dict[str, list[dict]] = defaultdict(list)
    marks_by_position: dict[str, list[dict]] = defaultdict(list)
    has_final_exit = set()

    for event in events:
        pid = event.get("position_id")
        if not pid:
            continue
        kind = event.get("kind")
        if kind in ("PAPER_PARTIAL_EXIT", "PAPER_EXIT"):
            exits_by_position[pid].append(event)
            if kind == "PAPER_EXIT":
                has_final_exit.add(pid)
        elif kind == "PAPER_FUNDING":
            funding_by_position[pid].append(event)
        elif kind == "PAPER_MARK":
            marks_by_position[pid].append(event)

    projected = []
    for pid, entry in sorted(entries.items(), key=lambda item: (int(item[1].get("fill_ms", 0)), item[0])):
        if pid not in has_final_exit:
            continue
        exits = sorted(exits_by_position.get(pid, []), key=lambda e: (_event_time(e), e.get("event_id", "")))
        if not exits:
            continue

        size = entry.get("size") or {}
        side = entry.get("side")
        sign = 1.0 if side == "LONG" else -1.0
        qty = _safe_float(size.get("qty"))
        raw_open = _safe_float(entry.get("raw_open", size.get("raw_open")))
        entry_fill = _safe_float(size.get("entry_fill"))
        stop = _safe_float(size.get("stop"))
        planned_risk = _safe_float(size.get("planned_loss_usdt"))
        entry_fee = _safe_float(size.get("entry_fee_usdt"), qty * entry_fill * FEE)

        raw_gross = 0.0
        fill_gross = 0.0
        exit_fees = 0.0
        exited_qty = 0.0
        final_exit_ms = 0
        exit_reasons = []
        for event in exits:
            q = _safe_float(event.get("qty"))
            raw_price = _safe_float(event.get("raw_price"))
            exit_fill = _safe_float(event.get("exit_fill"))
            raw_gross += sign * q * (raw_price - raw_open)
            fill_gross += sign * q * (exit_fill - entry_fill)
            exit_fees += q * exit_fill * FEE
            exited_qty += q
            final_exit_ms = max(final_exit_ms, _event_time(event))
            if event.get("reason"):
                exit_reasons.append(str(event["reason"]))

        if qty > 0 and abs(exited_qty - qty) > max(1e-9, qty * 1e-8):
            # A final exit should economically close the full initial quantity.
            # Fail closed rather than silently scaling P&L.
            raise ValueError(f"closed position quantity mismatch: {pid}")

        funding = sum(_safe_float(e.get("cashflow_usdt")) for e in funding_by_position.get(pid, []))
        fees = entry_fee + exit_fees
        slippage = raw_gross - fill_gross
        net = fill_gross - fees + funding
        unit_r = abs(entry_fill - stop)
        mfe_r = 0.0
        mae_r = 0.0
        if unit_r > 0:
            observed_prices = [_safe_float(m.get("mark")) for m in marks_by_position.get(pid, [])]
            observed_prices += [_safe_float(e.get("exit_fill")) for e in exits]
            for price in observed_prices:
                r = sign * (price - entry_fill) / unit_r
                mfe_r = max(mfe_r, r)
                mae_r = max(mae_r, -r)

        intent = intents.get(entry.get("intent_id"), {})
        decision_ms = intent.get("decision_persist_ms")
        scan = scans_by_time.get(int(decision_ms)) if decision_ms is not None else None
        regime = scan.get("regime") if scan else "UNAVAILABLE"
        books_pass = [
            name
            for name, meta in (entry.get("books") or {}).items()
            if isinstance(meta, dict) and meta.get("status") == "MODEL_PASS"
        ]

        projected.append({
            "position_id": pid,
            "intent_id": entry.get("intent_id"),
            "signal_id": entry.get("signal_id"),
            "symbol": entry.get("symbol"),
            "side": side,
            "family": entry.get("family"),
            "regime": regime,
            "entry_ms": int(entry.get("fill_ms", 0)),
            "exit_ms": int(final_exit_ms),
            "entry_qty": qty,
            "planned_risk_usdt": planned_risk,
            "gross_raw_pnl_usdt": raw_gross,
            "gross_fill_pnl_usdt": fill_gross,
            "slippage_cost_usdt": slippage,
            "fees_usdt": fees,
            "funding_usdt": funding,
            "net_pnl_usdt": net,
            "net_r": (net / planned_risk) if planned_risk > 0 else 0.0,
            "mfe_r": mfe_r,
            "mae_r": mae_r,
            "exit_reasons": exit_reasons,
            "books_model_pass": sorted(books_pass),
        })
    return projected


def _primary_equity_curve(events: list[dict], initial_nav: float) -> tuple[list[dict], dict]:
    balance = float(initial_nav)
    positions: dict[str, dict] = {}
    curve = [{"time_ms": 0, "equity": balance, "balance": balance, "open_positions": 0}]
    max_margin = 0.0
    max_exposure = 0.0
    max_planned_risk = 0.0

    def snapshot(time_ms: int):
        nonlocal max_margin, max_exposure, max_planned_risk
        unrealized = 0.0
        margin = 0.0
        exposure = 0.0
        planned = 0.0
        for pos in positions.values():
            sign = 1.0 if pos["side"] == "LONG" else -1.0
            unrealized += sign * pos["qty"] * (pos["mark"] - pos["entry_fill"])
            margin += pos["margin_usdt"]
            exposure += pos["qty"] * pos["mark"]
            planned += pos["planned_risk_usdt"]
        max_margin = max(max_margin, margin)
        max_exposure = max(max_exposure, exposure)
        max_planned_risk = max(max_planned_risk, planned)
        curve.append({
            "time_ms": int(time_ms),
            "equity": balance + unrealized,
            "balance": balance,
            "open_positions": len(positions),
        })

    for event in sorted(events, key=lambda e: (_event_time(e), str(e.get("event_id", "")))):
        kind = event.get("kind")
        pid = event.get("position_id")
        changed = False
        if kind == "PAPER_ENTRY" and pid:
            book = (event.get("books") or {}).get("5x") or {}
            if book.get("status") != "MODEL_PASS":
                continue
            size = event.get("size") or {}
            entry_fill = _safe_float(size.get("entry_fill"))
            qty = _safe_float(size.get("qty"))
            entry_fee = _safe_float(size.get("entry_fee_usdt"), qty * entry_fill * FEE)
            balance -= entry_fee
            positions[pid] = {
                "side": event.get("side"),
                "qty": qty,
                "entry_fill": entry_fill,
                "mark": entry_fill,
                "margin_usdt": _safe_float(book.get("margin_usdt")),
                "planned_risk_usdt": _safe_float(size.get("planned_loss_usdt")),
            }
            changed = True
        elif kind == "PAPER_MARK" and pid in positions:
            positions[pid]["mark"] = _safe_float(event.get("mark"), positions[pid]["mark"])
            changed = True
        elif kind == "PAPER_FUNDING" and pid in positions:
            balance += _safe_float(event.get("cashflow_usdt"))
            changed = True
        elif kind in ("PAPER_PARTIAL_EXIT", "PAPER_EXIT") and pid in positions:
            pos = positions[pid]
            old_qty = pos["qty"]
            q = min(old_qty, _safe_float(event.get("qty")))
            fill = _safe_float(event.get("exit_fill"))
            sign = 1.0 if pos["side"] == "LONG" else -1.0
            gross = sign * q * (fill - pos["entry_fill"])
            fee = q * fill * FEE
            balance += gross - fee
            remaining = max(0.0, old_qty - q)
            if kind == "PAPER_EXIT" or remaining <= 1e-12:
                positions.pop(pid, None)
            else:
                ratio = remaining / old_qty if old_qty else 0.0
                pos["qty"] = remaining
                pos["margin_usdt"] *= ratio
                pos["planned_risk_usdt"] *= ratio
                pos["mark"] = fill
            changed = True
        if changed:
            snapshot(_event_time(event))

    return curve, {
        "max_margin_usage_usdt": max_margin,
        "max_exposure_usdt": max_exposure,
        "max_open_planned_risk_usdt": max_planned_risk,
    }


def _drawdown(curve: list[dict], end_ms: int) -> tuple[float, int]:
    peak = None
    max_dd = 0.0
    drawdown_start = None
    max_duration = 0
    for point in curve:
        equity = float(point["equity"])
        time_ms = int(point["time_ms"])
        if peak is None or equity >= peak:
            if drawdown_start is not None:
                max_duration = max(max_duration, time_ms - drawdown_start)
            peak = equity
            drawdown_start = None
            continue
        dd = (peak - equity) / peak if peak > 0 else 0.0
        max_dd = max(max_dd, dd)
        if drawdown_start is None:
            drawdown_start = time_ms
    if drawdown_start is not None:
        max_duration = max(max_duration, int(end_ms) - drawdown_start)
    return max_dd, max_duration


def _monthly_returns(curve: list[dict], initial_nav: float, start_ms: int, end_ms: int) -> list[dict]:
    points = [p for p in curve if start_ms <= int(p["time_ms"]) < end_ms]
    last_by_month: dict[str, dict] = {}
    for point in points:
        key = datetime.fromtimestamp(int(point["time_ms"]) / 1000, tz=timezone.utc).strftime("%Y-%m")
        last_by_month[key] = point
    out = []
    previous = float(initial_nav)
    for key in sorted(last_by_month):
        equity = float(last_by_month[key]["equity"])
        ret = (equity / previous - 1.0) if previous else 0.0
        out.append({"month_utc": key, "return": ret, "ending_equity": equity})
        previous = equity
    return out


def _segment_maps(trades: list[dict]) -> dict:
    family = defaultdict(list)
    side = defaultdict(list)
    regime = defaultdict(list)
    book = defaultdict(list)
    for trade in trades:
        family[str(trade.get("family") or "UNAVAILABLE")].append(trade)
        side[str(trade.get("side") or "UNAVAILABLE")].append(trade)
        regime[str(trade.get("regime") or "UNAVAILABLE")].append(trade)
        for name in trade.get("books_model_pass", []):
            book[str(name)].append(trade)
    return {
        "family": {k: _segment_summary(v) for k, v in sorted(family.items())},
        "side": {k: _segment_summary(v) for k, v in sorted(side.items())},
        "regime": {k: _segment_summary(v) for k, v in sorted(regime.items())},
        "book": {name: _segment_summary(book.get(name, [])) for name in BOOKS},
    }


def _funnel(events: list[dict]) -> dict:
    totals = Counter()
    for event in events:
        if event.get("kind") != "SCAN_SUMMARY":
            continue
        funnel = event.get("funnel") or {}
        for key in ("eligible", "candidate", "qualified", "executable", "intents"):
            totals[key] += int(funnel.get(key, 0) or 0)
    filled = sum(e.get("kind") == "PAPER_ENTRY" for e in events)
    qualified = totals["qualified"]
    cancels = Counter(
        str(e.get("reason") or "UNAVAILABLE")
        for e in events
        if e.get("kind") == "INTENT_CANCELLED"
    )
    return {
        "eligible": totals["eligible"],
        "candidate": totals["candidate"],
        "qualified": qualified,
        "executable": totals["executable"],
        "intents": totals["intents"],
        "filled": filled,
        "qualified_to_filled": (filled / qualified) if qualified else None,
        "opportunity_utilization": (filled / qualified) if qualified else None,
        "cancellation_reasons": dict(sorted(cancels.items())),
        "avoided_loss": "UNAVAILABLE",
        "missed_opportunity": "UNAVAILABLE",
    }


def _max_reserved_risk_fraction(events: list[dict]) -> float:
    active: dict[str, float] = {}
    maximum = 0.0
    for event in sorted(events, key=lambda e: (_event_time(e), str(e.get("event_id", "")))):
        kind = event.get("kind")
        intent_id = event.get("intent_id")
        if kind == "INTENT_CREATED" and intent_id:
            active[str(intent_id)] = _safe_float(event.get("reserved_risk_fraction"))
        elif kind in ("INTENT_CANCELLED", "PAPER_EXIT") and intent_id:
            active.pop(str(intent_id), None)
        maximum = max(maximum, sum(active.values()))
    return maximum


def build_metrics(events: list[dict], *, initial_nav: float, start_ms: int, end_ms: int, symbol: str) -> dict:
    trades = project_closed_trades(events)
    trade_net = [float(t["net_pnl_usdt"]) for t in trades]
    trade_r = [float(t["net_r"]) for t in trades]
    wins = sum(x > 0 for x in trade_net)
    curve, risk_curve = _primary_equity_curve(events, initial_nav)
    # Replace the synthetic t=0 anchor with execution start for report semantics.
    if curve:
        curve[0] = {**curve[0], "time_ms": int(start_ms)}
    ending_equity = float(curve[-1]["equity"]) if curve else float(initial_nav)
    max_dd, dd_duration = _drawdown(curve, end_ms)

    performance = {
        "closed_trades": len(trades),
        "win_rate_n": len(trades),
        "win_rate": (wins / len(trades)) if trades else None,
        "gross_raw_pnl_usdt": sum(float(t["gross_raw_pnl_usdt"]) for t in trades),
        "gross_fill_pnl_usdt": sum(float(t["gross_fill_pnl_usdt"]) for t in trades),
        "closed_trade_net_pnl_usdt": sum(trade_net),
        "ending_equity_usdt": ending_equity,
        "net_pnl_usdt": ending_equity - float(initial_nav),
        "net_return": (ending_equity / float(initial_nav) - 1.0) if initial_nav else None,
        "avg_r": (sum(trade_r) / len(trade_r)) if trade_r else None,
        "expectancy_r": (sum(trade_r) / len(trade_r)) if trade_r else None,
        "profit_factor": _profit_factor(trade_net),
        "max_drawdown": max_dd,
        "drawdown_duration_ms": dd_duration,
    }

    costs = {
        "scope": "CLOSED_TRADES",
        "gross_raw_pnl_usdt": performance["gross_raw_pnl_usdt"],
        "gross_fill_pnl_usdt": performance["gross_fill_pnl_usdt"],
        "slippage_usdt": sum(float(t["slippage_cost_usdt"]) for t in trades),
        "fees_usdt": sum(float(t["fees_usdt"]) for t in trades),
        "funding_usdt": sum(float(t["funding_usdt"]) for t in trades),
        "net_pnl_usdt": sum(trade_net),
    }

    return {
        "schema": "foxyya-backtest-metrics/1",
        "mode": MODE,
        "label": LABEL,
        "symbol": str(symbol),
        "start_ms": int(start_ms),
        "end_ms": int(end_ms),
        "initial_nav_usdt": float(initial_nav),
        "performance": performance,
        "cost_attribution": costs,
        "equity_curve": curve,
        "monthly_returns": _monthly_returns(curve, initial_nav, start_ms, end_ms),
        "funnel": _funnel(events),
        "risk": {
            "portfolio_cap_fraction": float(PORTFOLIO_CAP),
            "max_reserved_risk_fraction": _max_reserved_risk_fraction(events),
            **risk_curve,
        },
        "segments": _segment_maps(trades),
        "closed_trade_records": trades,
    }
