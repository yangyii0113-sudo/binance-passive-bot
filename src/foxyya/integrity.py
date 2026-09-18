from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Iterable

from .portfolio import replay_books
from .risk import BUCKET_CAP, PORTFOLIO_CAP, SYMBOL_CAP


class _EventSnapshot:
    def __init__(self, events):
        self._events = list(events)

    def events(self):
        return self._events


def _event_time(event):
    for key in ("observed_ms", "time_ms", "persisted_ms", "decision_persist_ms", "fill_ms"):
        value = event.get(key)
        if isinstance(value, (int, float)):
            return int(value)
    return None


def audit_events(events: Iterable[dict], initial_nav: float, *, now_ms: int | None = None) -> dict:
    """Read-only deterministic lifecycle/NAV/risk audit for a FOXYYA event stream."""
    events = list(events)
    issues = []

    def issue(code, *, severity="CRITICAL", detail=None, event=None):
        row = {"code": code, "severity": severity}
        if detail is not None:
            row["detail"] = detail
        if event is not None:
            row["event_id"] = event.get("event_id")
            row["kind"] = event.get("kind")
        issues.append(row)

    qualified = {}
    intents = {}
    cancelled = {}
    entries_by_intent = {}
    positions = {}
    active_position_intents = set()

    for event in events:
        kind = event.get("kind")
        if not kind:
            issue("EVENT_KIND_MISSING", event=event)
            continue

        signal_id = event.get("signal_id")
        intent_id = event.get("intent_id")
        position_id = event.get("position_id")

        if kind == "SIGNAL_QUALIFIED":
            if not signal_id:
                issue("QUALIFIED_SIGNAL_ID_MISSING", event=event)
            elif signal_id in qualified:
                issue("DUPLICATE_SIGNAL_QUALIFIED", detail=signal_id, event=event)
            else:
                qualified[signal_id] = event

        elif kind == "INTENT_CREATED":
            if not intent_id:
                issue("INTENT_ID_MISSING", event=event)
                continue
            if intent_id in intents:
                issue("DUPLICATE_INTENT_CREATED", detail=intent_id, event=event)
            intents[intent_id] = event
            if signal_id and signal_id not in qualified:
                issue("INTENT_WITHOUT_QUALIFIED_SIGNAL", detail=signal_id, event=event)

        elif kind == "INTENT_CANCELLED":
            if not intent_id:
                issue("CANCEL_INTENT_ID_MISSING", event=event)
                continue
            if intent_id in cancelled:
                issue("DUPLICATE_INTENT_CANCEL", detail=intent_id, event=event)
            cancelled[intent_id] = event

        elif kind == "PAPER_ENTRY":
            if not intent_id or not position_id:
                issue("ENTRY_IDENTITY_MISSING", event=event)
                continue
            if intent_id not in intents:
                issue("ENTRY_WITHOUT_INTENT", detail=intent_id, event=event)
            if intent_id in entries_by_intent:
                issue("DUPLICATE_ENTRY_FOR_INTENT", detail=intent_id, event=event)
            if position_id in positions:
                issue("DUPLICATE_POSITION_ENTRY", detail=position_id, event=event)
                continue
            if intent_id in cancelled:
                issue("ENTRY_AFTER_CANCEL", detail=intent_id, event=event)
            size = event.get("size") or {}
            qty = float(size.get("qty", 0.0) or 0.0)
            if qty <= 0:
                issue("ENTRY_QTY_INVALID", detail=position_id, event=event)
            positions[position_id] = {
                "entry": event,
                "remaining_qty": qty,
                "closed": False,
                "final_exit": None,
                "partial_count": 0,
            }
            entries_by_intent[intent_id] = event
            active_position_intents.add(intent_id)

        elif kind in ("PAPER_MARK", "PAPER_FUNDING", "PAPER_TRAILING_UPDATE",
                      "PAPER_PARTIAL_EXIT", "PAPER_EXIT"):
            state = positions.get(position_id)
            if state is None:
                issue("POSITION_EVENT_WITHOUT_ENTRY", detail=position_id, event=event)
                continue
            if state["closed"]:
                issue("POSITION_EVENT_AFTER_FINAL_EXIT", detail=position_id, event=event)
                continue

            if kind in ("PAPER_PARTIAL_EXIT", "PAPER_EXIT"):
                try:
                    qty = float(event.get("qty", 0.0) or 0.0)
                except (TypeError, ValueError):
                    qty = 0.0
                if qty <= 0:
                    issue("EXIT_QTY_INVALID", detail=position_id, event=event)
                    continue
                remaining = state["remaining_qty"]
                if qty > remaining + 1e-10:
                    issue(
                        "EXIT_QTY_EXCEEDS_REMAINING",
                        detail={"position_id": position_id, "qty": qty, "remaining": remaining},
                        event=event,
                    )
                effective = min(max(qty, 0.0), remaining)
                state["remaining_qty"] = max(0.0, remaining - effective)
                if kind == "PAPER_PARTIAL_EXIT":
                    state["partial_count"] += 1
                    if state["remaining_qty"] <= 1e-12:
                        issue("PARTIAL_EXIT_CLOSED_POSITION", detail=position_id, event=event)
                else:
                    state["closed"] = True
                    state["final_exit"] = event
                    state["remaining_qty"] = 0.0
                    if intent_id:
                        active_position_intents.discard(intent_id)
                    else:
                        active_position_intents.discard(state["entry"].get("intent_id"))

    for intent_id, intent in intents.items():
        has_entry = intent_id in entries_by_intent
        has_cancel = intent_id in cancelled
        if has_entry and has_cancel:
            issue("INTENT_HAS_ENTRY_AND_CANCEL", detail=intent_id)
        if not has_entry and not has_cancel:
            issue("INTENT_WITHOUT_TERMINAL_OUTCOME", severity="WARNING", detail=intent_id)

    terminal_signal_ids = set()
    for event in entries_by_intent.values():
        if event.get("signal_id"):
            terminal_signal_ids.add(event["signal_id"])
    for event in cancelled.values():
        if event.get("signal_id"):
            terminal_signal_ids.add(event["signal_id"])
    for signal_id in qualified:
        if signal_id not in terminal_signal_ids and not any(
            event.get("signal_id") == signal_id and event.get("kind") == "INTENT_CREATED"
            for event in events
        ):
            issue("QUALIFIED_SIGNAL_WITHOUT_INTENT_OR_TERMINAL", severity="WARNING", detail=signal_id)

    open_positions = {
        pid: state for pid, state in positions.items() if not state["closed"]
    }
    pending_intents = {
        iid: event for iid, event in intents.items()
        if iid not in entries_by_intent and iid not in cancelled
    }

    active_intents = {}
    active_intents.update(pending_intents)
    for pid, state in open_positions.items():
        iid = state["entry"].get("intent_id")
        if iid in intents:
            active_intents[iid] = intents[iid]

    risk_total = 0.0
    by_bucket = defaultdict(float)
    by_symbol = defaultdict(float)
    for iid, event in active_intents.items():
        fraction = float(event.get("reserved_risk_fraction", 0.0) or 0.0)
        risk_total += fraction
        by_bucket[event.get("bucket", "UNKNOWN")] += fraction
        by_symbol[event.get("symbol", "UNKNOWN")] += fraction

    if risk_total > PORTFOLIO_CAP + 1e-12:
        issue("PORTFOLIO_RISK_CAP_EXCEEDED", detail=risk_total)
    for bucket, fraction in by_bucket.items():
        if fraction > BUCKET_CAP + 1e-12:
            issue("BUCKET_RISK_CAP_EXCEEDED", detail={"bucket": bucket, "fraction": fraction})
    for symbol, fraction in by_symbol.items():
        if fraction > SYMBOL_CAP + 1e-12:
            issue("SYMBOL_RISK_CAP_EXCEEDED", detail={"symbol": symbol, "fraction": fraction})

    books = None
    book_navs = {}
    nav_verified = False
    nav = None
    try:
        books = replay_books(_EventSnapshot(events), float(initial_nav))["books"]
        book_navs = {key: float(value["equity"]) for key, value in books.items()}
        if book_navs:
            spread = max(book_navs.values()) - min(book_navs.values())
            if spread > 1e-8:
                issue("LEVERAGE_BOOK_NAV_DIVERGENCE", detail=book_navs)
            else:
                nav = min(book_navs.values())
                nav_verified = not any(x["severity"] == "CRITICAL" for x in issues)
    except Exception as exc:
        issue("PORTFOLIO_REPLAY_FAILED", detail=f"{type(exc).__name__}: {exc}")

    def funnel(window_ms):
        if now_ms is None:
            return None
        start = int(now_ms) - int(window_ms)
        q = {
            event.get("signal_id") for event in events
            if event.get("kind") == "SIGNAL_QUALIFIED"
            and event.get("signal_id")
            and (_event_time(event) or -1) >= start
            and (_event_time(event) or -1) <= now_ms
        }
        created = {
            event.get("signal_id") for event in events
            if event.get("kind") == "INTENT_CREATED"
            and event.get("signal_id") in q
        }
        filled = {
            event.get("signal_id") for event in events
            if event.get("kind") == "PAPER_ENTRY"
            and event.get("signal_id") in q
        }
        cancelled_signals = {
            event.get("signal_id") for event in events
            if event.get("kind") == "INTENT_CANCELLED"
            and event.get("signal_id") in q
        }
        reasons = Counter(
            event.get("reason", "UNKNOWN") for event in events
            if event.get("kind") == "INTENT_CANCELLED"
            and event.get("signal_id") in q
        )
        return {
            "qualified": len(q),
            "intent_created": len(created),
            "filled": len(filled),
            "cancelled": len(cancelled_signals),
            "pending_or_unresolved": len(q - filled - cancelled_signals),
            "qualified_to_filled": (len(filled) / len(q)) if q else None,
            "cancellation_reasons": dict(reasons),
        }

    counts = Counter(event.get("kind", "UNKNOWN") for event in events)
    critical = [x for x in issues if x["severity"] == "CRITICAL"]
    warnings = [x for x in issues if x["severity"] == "WARNING"]

    return {
        "schema": "foxyya-ledger-integrity-audit/1",
        "event_count": len(events),
        "event_counts": dict(counts),
        "initial_nav_usdt": float(initial_nav),
        "verified_nav_usdt": nav if nav_verified else None,
        "nav_candidate_usdt": nav,
        "book_navs_usdt": book_navs,
        "nav_verified": nav_verified,
        "open_positions": [
            {
                "position_id": pid,
                "intent_id": state["entry"].get("intent_id"),
                "symbol": state["entry"].get("symbol"),
                "side": state["entry"].get("side"),
                "family": state["entry"].get("family"),
                "remaining_qty": state["remaining_qty"],
                "partial_count": state["partial_count"],
            }
            for pid, state in open_positions.items()
        ],
        "open_position_count": len(open_positions),
        "pending_intents": list(pending_intents),
        "pending_intent_count": len(pending_intents),
        "active_reserved_risk_fraction": risk_total,
        "active_reserved_risk_pct_nav": risk_total * 100.0,
        "risk_caps": {
            "portfolio": PORTFOLIO_CAP,
            "bucket": BUCKET_CAP,
            "symbol": SYMBOL_CAP,
        },
        "reserved_risk_by_bucket": dict(by_bucket),
        "reserved_risk_by_symbol": dict(by_symbol),
        "funnel_24h": funnel(24 * 60 * 60 * 1000),
        "funnel_48h": funnel(48 * 60 * 60 * 1000),
        "integrity_ok": len(critical) == 0,
        "critical_issue_count": len(critical),
        "warning_count": len(warnings),
        "issues": issues,
    }
