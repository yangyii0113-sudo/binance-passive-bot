from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone
from math import isfinite

from foxyya.portfolio import replay_books
from foxyya.risk import FEE


def _event_time(event: dict) -> int | None:
    for key in ("observed_ms", "fill_ms", "time_ms", "decision_persist_ms", "persisted_ms"):
        value = event.get(key)
        if isinstance(value, (int, float)):
            return int(value)
    return None


def _in_window(event: dict, start_ms: int, end_ms: int) -> bool:
    value = _event_time(event)
    return value is not None and int(start_ms) <= value < int(end_ms)


def _sample_status(count: int) -> str:
    return "Sample Insufficient" if count < 20 else "Sample Sufficient"


def _group_summary(records: list[dict]) -> dict:
    count = len(records)
    wins = sum(record["net_pnl_usdt"] > 0 for record in records)
    r_values = [record["r"] for record in records if record["r"] is not None]
    return {
        "trades": count,
        "win_rate": wins / count if count else None,
        "net_pnl_usdt": sum(record["net_pnl_usdt"] for record in records),
        "average_r": sum(r_values) / len(r_values) if r_values else None,
        "sample_status": _sample_status(count),
    }


def _max_drawdown(initial_nav: float, closed_records: list[dict]) -> tuple[float, list[dict]]:
    equity = float(initial_nav)
    peak = equity
    max_dd = 0.0
    curve = [{"time_ms": None, "equity_usdt": equity}]
    for record in sorted(closed_records, key=lambda item: item["exit_ms"]):
        equity += record["net_pnl_usdt"]
        peak = max(peak, equity)
        dd = (peak - equity) / peak if peak > 0 else 0.0
        max_dd = max(max_dd, dd)
        curve.append({"time_ms": record["exit_ms"], "equity_usdt": equity})
    return max_dd, curve


def _monthly_returns(initial_nav: float, closed_records: list[dict]) -> dict:
    grouped = defaultdict(float)
    for record in closed_records:
        month = datetime.fromtimestamp(record["exit_ms"] / 1000, tz=timezone.utc).strftime("%Y-%m")
        grouped[month] += record["net_pnl_usdt"]
    # Closed-trade attribution only; terminal open positions are reported
    # separately rather than being manufactured into month-end exits.
    return {month: pnl / float(initial_nav) for month, pnl in sorted(grouped.items())}


def _trade_records(events: list[dict], start_ms: int, end_ms: int) -> tuple[list[dict], int]:
    intents = {event.get("intent_id"): event for event in events if event.get("kind") == "INTENT_CREATED"}
    scan_regime_by_time = {
        int(event["time_ms"]): event.get("regime", "UNAVAILABLE")
        for event in events
        if event.get("kind") == "SCAN_SUMMARY" and isinstance(event.get("time_ms"), (int, float))
    }
    entries = [
        event for event in events
        if event.get("kind") == "PAPER_ENTRY" and start_ms <= int(event.get("fill_ms", -1)) < end_ms
    ]
    exits_by_position = defaultdict(list)
    marks_by_position = defaultdict(list)
    funding_by_position = defaultdict(list)
    for event in events:
        pid = event.get("position_id")
        if event.get("kind") in ("PAPER_PARTIAL_EXIT", "PAPER_EXIT") and pid:
            exits_by_position[pid].append(event)
        elif event.get("kind") == "PAPER_MARK" and pid:
            marks_by_position[pid].append(event)
        elif event.get("kind") == "PAPER_FUNDING" and pid:
            funding_by_position[pid].append(event)

    records = []
    orphan_closed = 0
    entry_positions = {event.get("position_id") for event in entries}
    for event in events:
        if event.get("kind") == "PAPER_EXIT" and _in_window(event, start_ms, end_ms) and event.get("position_id") not in entry_positions:
            orphan_closed += 1

    for entry in entries:
        pid = entry["position_id"]
        exits = sorted(exits_by_position.get(pid, []), key=lambda event: int(event.get("observed_ms", 0)))
        terminal = next(
            (event for event in reversed(exits) if event.get("kind") == "PAPER_EXIT" and start_ms <= int(event.get("observed_ms", -1)) < end_ms),
            None,
        )
        if terminal is None:
            continue

        side_sign = 1 if entry["side"] == "LONG" else -1
        qty = float(entry["size"]["qty"])
        entry_fill = float(entry["size"]["entry_fill"])
        raw_open = float(entry.get("raw_open", entry_fill))
        relevant_exits = [event for event in exits if int(event.get("observed_ms", 0)) <= int(terminal["observed_ms"])]

        raw_gross = 0.0
        fill_gross = 0.0
        exit_fees = 0.0
        exit_slippage = 0.0
        for event in relevant_exits:
            exit_qty = float(event["qty"])
            raw_price = float(event.get("raw_price", event["exit_fill"]))
            exit_fill = float(event["exit_fill"])
            raw_gross += side_sign * exit_qty * (raw_price - raw_open)
            fill_gross += side_sign * exit_qty * (exit_fill - entry_fill)
            exit_fees += exit_qty * exit_fill * FEE
            exit_slippage += exit_qty * abs(raw_price - exit_fill)

        entry_fee = float(entry["size"].get("entry_fee_usdt", 0.0))
        entry_slippage = qty * abs(entry_fill - raw_open)
        funding = sum(
            float(event.get("cashflow_usdt", 0.0))
            for event in funding_by_position.get(pid, [])
            if int(entry["fill_ms"]) <= int(event.get("observed_ms", -1)) <= int(terminal["observed_ms"])
        )
        net = fill_gross - entry_fee - exit_fees + funding
        planned = float(entry["size"].get("planned_loss_usdt", 0.0))
        realized_r = net / planned if planned > 0 else None

        unit_r = abs(entry_fill - float(entry["size"].get("stop", entry_fill))) or None
        mfe = 0.0
        mae = 0.0
        if unit_r:
            for mark_event in marks_by_position.get(pid, []):
                mark_time = int(mark_event.get("observed_ms", -1))
                if int(entry["fill_ms"]) <= mark_time <= int(terminal["observed_ms"]):
                    excursion = side_sign * (float(mark_event["mark"]) - entry_fill) / unit_r
                    mfe = max(mfe, excursion)
                    mae = max(mae, -excursion)
        capture = realized_r / mfe if realized_r is not None and mfe > 0 else None
        intent = intents.get(entry.get("intent_id"), {})
        decision_time = int(intent.get("decision_persist_ms", -1))
        regime = scan_regime_by_time.get(decision_time, "UNAVAILABLE")

        records.append({
            "position_id": pid,
            "intent_id": entry.get("intent_id"),
            "symbol": entry.get("symbol"),
            "side": entry.get("side"),
            "family": entry.get("family"),
            "regime": regime,
            "entry_ms": int(entry["fill_ms"]),
            "exit_ms": int(terminal["observed_ms"]),
            "gross_pnl_usdt": raw_gross,
            "gross_after_slippage_usdt": fill_gross,
            "fees_usdt": entry_fee + exit_fees,
            "slippage_usdt": entry_slippage + exit_slippage,
            "funding_usdt": funding,
            "net_pnl_usdt": net,
            "r": realized_r,
            "mfe_r": mfe,
            "mae_r": mae,
            "capture_ratio": capture,
            "books": [book for book, meta in entry.get("books", {}).items() if meta.get("status") == "MODEL_PASS"],
        })
    return records, orphan_closed


def _max_consecutive_losses(records: list[dict]) -> int:
    longest = current = 0
    for record in sorted(records, key=lambda item: item["exit_ms"]):
        if record["net_pnl_usdt"] < 0:
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    return longest


def _max_reserved_risk(events: list[dict], start_ms: int, end_ms: int) -> float:
    active = {}
    peak = 0.0
    for event in events:
        event_time = _event_time(event)
        if event_time is None or event_time >= end_ms:
            continue
        kind = event.get("kind")
        intent_id = event.get("intent_id")
        if kind == "INTENT_CREATED" and intent_id:
            active[intent_id] = float(event.get("reserved_risk_fraction", 0.0))
        elif kind in ("INTENT_CANCELLED", "PAPER_EXIT") and intent_id:
            active.pop(intent_id, None)
        if event_time >= start_ms:
            peak = max(peak, sum(active.values()))
    return peak


def _terminal_equity(ledger, initial_nav: float, terminal_marks: dict | None) -> dict:
    state = replay_books(ledger, float(initial_nav))["books"]["5x"]
    positions = state["positions"]
    details = []
    unrealized = 0.0
    missing_marks = []

    for position_id, position in sorted(positions.items()):
        symbol = str(position["symbol"])
        if terminal_marks is not None and symbol in terminal_marks:
            mark = float(terminal_marks[symbol])
            mark_source = "EXPLICIT_TERMINAL_MARK"
        elif terminal_marks is None:
            mark = float(position["mark"])
            mark_source = "LAST_LEDGER_MARK"
        else:
            # Explicit terminal valuation was requested, so silently falling
            # back to a stale position mark would overstate fidelity.
            missing_marks.append(symbol)
            continue
        if mark <= 0:
            raise ValueError(f"invalid terminal mark for {symbol}")
        sign = 1 if position["side"] == "LONG" else -1
        pnl = sign * float(position["qty"]) * (mark - float(position["entry_fill"]))
        unrealized += pnl
        details.append({
            "position_id": position_id,
            "symbol": symbol,
            "side": position["side"],
            "qty": float(position["qty"]),
            "entry_fill": float(position["entry_fill"]),
            "mark": mark,
            "mark_source": mark_source,
            "unrealized_pnl_usdt": pnl,
        })

    if missing_marks:
        raise ValueError("terminal marks missing for open positions: " + ", ".join(sorted(set(missing_marks))))

    equity = float(state["balance"]) + unrealized
    return {
        "book": "5x",
        "open_positions": len(positions),
        "unrealized_pnl_usdt": unrealized,
        "equity_usdt": equity,
        "equity_return": (equity - float(initial_nav)) / float(initial_nav),
        "positions": details,
    }


def compute_backtest_metrics(
    ledger,
    *,
    initial_nav: float,
    start_ms: int,
    end_ms: int,
    terminal_marks: dict | None = None,
) -> dict:
    if float(initial_nav) <= 0 or int(end_ms) <= int(start_ms):
        raise ValueError("invalid metric inputs")
    events = ledger.events()
    records, orphan_closed = _trade_records(events, int(start_ms), int(end_ms))
    closed = len(records)
    wins = sum(record["net_pnl_usdt"] > 0 for record in records)
    raw_gross = sum(record["gross_pnl_usdt"] for record in records)
    net = sum(record["net_pnl_usdt"] for record in records)
    r_values = [record["r"] for record in records if record["r"] is not None and isfinite(record["r"])]
    positive = sum(record["net_pnl_usdt"] for record in records if record["net_pnl_usdt"] > 0)
    negative = sum(record["net_pnl_usdt"] for record in records if record["net_pnl_usdt"] < 0)
    max_dd, equity_curve = _max_drawdown(float(initial_nav), records)
    terminal = _terminal_equity(ledger, float(initial_nav), terminal_marks)

    scan_events = [event for event in events if event.get("kind") == "SCAN_SUMMARY" and _in_window(event, start_ms, end_ms)]
    funnel = {key: sum(int(event.get("funnel", {}).get(key, 0)) for event in scan_events) for key in ("eligible", "candidate", "qualified", "executable")}
    intents = [event for event in events if event.get("kind") == "INTENT_CREATED" and _in_window(event, start_ms, end_ms)]
    fills = [event for event in events if event.get("kind") == "PAPER_ENTRY" and start_ms <= int(event.get("fill_ms", -1)) < end_ms]
    cancels = [event for event in events if event.get("kind") == "INTENT_CANCELLED" and _in_window(event, start_ms, end_ms)]
    funnel.update({
        "intents": len(intents),
        "filled": len(fills),
        "closed": closed,
        "qualified_to_filled": len(fills) / funnel["qualified"] if funnel["qualified"] else None,
        "opportunity_utilization": len(fills) / funnel["executable"] if funnel["executable"] else None,
        "cancel_reasons": dict(Counter(event.get("reason", "UNSPECIFIED") for event in cancels)),
        "avoided_loss": "UNAVAILABLE",
        "missed_opportunity": "UNAVAILABLE",
    })

    segmentation = {}
    for dimension, key in (("family", "family"), ("side", "side"), ("regime", "regime")):
        groups = defaultdict(list)
        for record in records:
            groups[str(record.get(key, "UNAVAILABLE"))].append(record)
        segmentation[dimension] = {name: _group_summary(group) for name, group in sorted(groups.items())}
    book_groups = defaultdict(list)
    for record in records:
        for book in record["books"]:
            book_groups[book].append(record)
    segmentation["book"] = {name: _group_summary(group) for name, group in sorted(book_groups.items())}

    position_ids = [event.get("position_id") for event in fills]
    duplicate_fill_count = len(position_ids) - len(set(position_ids))
    intents_by_id = {event.get("intent_id"): event for event in events if event.get("kind") == "INTENT_CREATED"}
    backfill_count = 0
    for entry in fills:
        intent = intents_by_id.get(entry.get("intent_id"))
        if intent and int(entry["fill_ms"]) <= int(intent.get("decision_persist_ms", entry["fill_ms"])):
            backfill_count += 1

    fees = sum(record["fees_usdt"] for record in records)
    slippage = sum(record["slippage_usdt"] for record in records)
    funding = sum(record["funding_usdt"] for record in records)
    capture_values = [record["capture_ratio"] for record in records if record["capture_ratio"] is not None and isfinite(record["capture_ratio"])]

    return {
        "performance": {
            "closed_trades": closed,
            "wins": wins,
            "win_rate": wins / closed if closed else None,
            "gross_pnl_usdt": raw_gross,
            "net_pnl_usdt": net,
            "net_return": net / float(initial_nav),
            "net_return_basis": "CLOSED_TRADES_ONLY",
            "average_r": sum(r_values) / len(r_values) if r_values else None,
            "expectancy_r": sum(r_values) / len(r_values) if r_values else None,
            "profit_factor": positive / abs(negative) if negative < 0 else None,
            "max_drawdown": max_dd,
            "max_drawdown_basis": "CLOSED_TRADE_EQUITY",
            "equity_curve": equity_curve,
            "monthly_returns": _monthly_returns(float(initial_nav), records),
            "terminal_equity_book": terminal["book"],
            "terminal_open_positions": terminal["open_positions"],
            "terminal_unrealized_pnl_usdt": terminal["unrealized_pnl_usdt"],
            "terminal_equity_usdt": terminal["equity_usdt"],
            "equity_return_including_unrealized": terminal["equity_return"],
            "terminal_positions": terminal["positions"],
        },
        "costs": {
            "fees_usdt": fees,
            "slippage_usdt": slippage,
            "funding_usdt": funding,
            "gross_to_net_delta_usdt": raw_gross - net,
            "slippage_is_embedded_in_fill_prices": True,
        },
        "funnel": funnel,
        "segmentation": segmentation,
        "risk": {
            "max_reserved_risk_fraction": _max_reserved_risk(events, int(start_ms), int(end_ms)),
            "max_consecutive_losses": _max_consecutive_losses(records),
            "average_mfe_r": sum(record["mfe_r"] for record in records) / closed if closed else None,
            "average_mae_r": sum(record["mae_r"] for record in records) / closed if closed else None,
            "average_capture_ratio": sum(capture_values) / len(capture_values) if capture_values else None,
        },
        "integrity": {
            "backfill_count": backfill_count,
            "duplicate_fill_count": duplicate_fill_count,
            "orphan_closed_trade_count": orphan_closed,
        },
        "trade_records": records,
    }
