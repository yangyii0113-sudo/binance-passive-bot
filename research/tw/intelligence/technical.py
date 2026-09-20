"""P3.3 technical research derived solely from a canonical HistoricalWindow."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from math import isclose, isfinite
from statistics import mean
from typing import Callable

from ..contracts import Availability, EvidenceRef, ResearchState
from ..history import HistoricalBar, HistoricalIntegrityError, HistoricalWindow
from ..technical_contracts import TechnicalFrame, TechnicalMetric, TechnicalResearchSnapshot
from .technical_indicators import atr, ema, macd, rsi


def _validate(window: HistoricalWindow) -> None:
    """Do not trust flags on directly constructed or replaced dataclasses."""
    if not isinstance(window, HistoricalWindow):
        raise TypeError("technical research requires a canonical HistoricalWindow")
    if not isinstance(window.bars, tuple) or any(
        not isinstance(bar, HistoricalBar)
        or not isinstance(bar.instrument_id, str)
        or not isinstance(bar.venue, str)
        or not isinstance(bar.session_date, str)
        or not (bar.source is None or isinstance(bar.source, str))
        for bar in window.bars
    ):
        raise HistoricalIntegrityError("malformed historical bar or member type")
    try:
        cutoff = date.fromisoformat(window.end_date)
        dates = [date.fromisoformat(bar.session_date) for bar in window.bars]
    except (TypeError, ValueError) as exc:
        raise HistoricalIntegrityError("invalid historical session date") from exc
    count = len(window.bars)
    if (
        type(window.requested_sessions) is not int or window.requested_sessions <= 0
        or count > window.requested_sessions
        or window.lookahead_blocked is not True
        or window.corporate_action_adjusted is not False
        or window.price_mode != "raw_unadjusted"
        or window.venue not in {"TWSE", "TPEX"}
        or not window.instrument_id
    ):
        raise HistoricalIntegrityError("unsupported or inconsistent historical window")
    if any(d > cutoff for d in dates) or any(a >= b for a, b in zip(dates, dates[1:])):
        raise HistoricalIntegrityError("future, duplicate or unordered historical session")
    if any(bar.instrument_id != window.instrument_id
           or bar.venue.upper() != window.venue or bar.price_mode != window.price_mode
           for bar in window.bars):
        raise HistoricalIntegrityError("historical identity, venue or price mode mismatch")
    if (
        window.first_session != (window.bars[0].session_date if count else None)
        or window.last_session != (window.bars[-1].session_date if count else None)
        or window.coverage_ratio != count / window.requested_sessions
        or window.sufficient_history is not (count == window.requested_sessions)
        or window.sources != tuple(sorted({bar.source for bar in window.bars if bar.source}))
    ):
        raise HistoricalIntegrityError("historical metadata does not match bars")


def _number(value, *, volume=False) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    try:
        result = float(value)
    except (OverflowError, ValueError):
        return None
    if not isfinite(result) or (result < 0 if volume else result <= 0):
        return None
    return result


def _value(bar: HistoricalBar, field: str) -> float | None:
    if not isinstance(bar.source, str) or not bar.source.strip():
        return None
    value = _number(getattr(bar, field), volume=field == "volume")
    if field != "volume":
        prices = {name: _number(getattr(bar, name)) for name in ("open", "high", "low", "close")}
        high, low = prices["high"], prices["low"]
        if high is not None and low is not None and high < low:
            return None
        for name in ("open", "close"):
            other = prices[name]
            if other is not None and ((high is not None and other > high)
                                      or (low is not None and other < low)):
                return None
    return value


def _refs(rows: tuple[HistoricalBar, ...], fields: tuple[str, ...]) -> tuple[EvidenceRef, ...]:
    return tuple(EvidenceRef(field, bar.source, bar.session_date, bar.instrument_id)
                 for bar in rows for field in fields)


def _metric(name: str, rows: tuple[HistoricalBar, ...], fields: tuple[str, ...],
            required: int, calculate: Callable, *, recursive=False,
            zero_reason: str | None = None) -> TechnicalMetric:
    # Keep only the uninterrupted tail, never delete holes and join either side.
    start = len(rows)
    while start and all(_value(rows[start - 1], field) is not None for field in fields):
        start -= 1
    selected = rows[start:] if recursive else rows[max(start, len(rows) - required):]
    observed = min(required, len(selected))
    value = None
    reason = "insufficient_history_or_invalid_input"
    if observed == required:
        value = calculate({field: [_value(bar, field) for bar in selected] for field in fields})
        reason = zero_reason if value is None else None
        if value is not None and not isfinite(value):
            value, reason = None, "non_finite_result"
    available = value is not None
    return TechnicalMetric(
        name, value, Availability.AVAILABLE if available else Availability.UNAVAILABLE,
        required, observed, observed / required,
        rows[-1].session_date if rows else None,
        _refs(selected, fields) if available else (), reason,
    )


def _trend(metrics: tuple[TechnicalMetric, ...], fast: str, slow: str) -> ResearchState:
    values = {item.name: item.value for item in metrics}
    close, short, long = values["close"], values[fast], values[slow]
    if close is None or short is None or long is None:
        return ResearchState.INSUFFICIENT_DATA
    if close > short > long:
        return ResearchState.BULLISH
    if close < short < long:
        return ResearchState.BEARISH
    return ResearchState.NEUTRAL


def _volume_ratio(values: list[float]) -> float | None:
    # mean avoids overflowing the sum of individually finite volumes. Its
    # denominator still needs a guard against subnormal underflow to zero.
    baseline = mean(values[:-1])
    if not isfinite(baseline) or baseline <= 0:
        return None
    return values[-1] / baseline


def _daily(rows: tuple[HistoricalBar, ...]) -> TechnicalFrame:
    metrics = [_metric("close", rows, ("close",), 1, lambda x: x["close"][-1])]
    for period in (20, 60):
        metrics.append(_metric(f"sma{period}", rows, ("close",), period,
                               lambda x: sum(x["close"]) / len(x["close"])))
    for period in (12, 26):
        metrics.append(_metric(f"ema{period}", rows, ("close",), period,
                               lambda x, p=period: ema(x["close"], p)[-1], recursive=True))
    metrics.append(_metric("rsi14", rows, ("close",), 15,
                           lambda x: rsi(x["close"])[-1], recursive=True))
    for index, name in enumerate(("macd", "macd_signal", "macd_histogram")):
        metrics.append(_metric(name, rows, ("close",), 26 if index == 0 else 34,
                               lambda x, i=index: macd(x["close"])[i][-1], recursive=True))
    metrics.extend((
        _metric("momentum20", rows, ("close",), 21, lambda x: x["close"][-1] - x["close"][0]),
        _metric("roc20", rows, ("close",), 21,
                lambda x: (x["close"][-1] / x["close"][0] - 1) * 100),
        _metric("support20", rows[:-1], ("low",), 20, lambda x: min(x["low"])),
        _metric("resistance20", rows[:-1], ("high",), 20, lambda x: max(x["high"])),
        _metric("volume_ratio20", rows, ("volume",), 21,
                lambda x: _volume_ratio(x["volume"]), zero_reason="zero_volume_baseline"),
        _metric("atr14", rows, ("high", "low", "close"), 15,
                lambda x: atr(x["high"], x["low"], x["close"])[-1], recursive=True),
        _metric("atr_percent14", rows, ("high", "low", "close"), 15,
                lambda x: atr(x["high"], x["low"], x["close"])[-1] / x["close"][-1] * 100,
                recursive=True),
    ))
    items = tuple(metrics)
    state = _trend(items, "sma20", "sma60")
    return TechnicalFrame("daily", rows[-1].session_date if rows else None, state, items,
                          sum(item.value is not None for item in items) / len(items),
                          ("close_sma20_sma60_ordering",))


@dataclass(frozen=True)
class _Week:
    monday: date
    rows: tuple[HistoricalBar, ...]


def _weekly(window: HistoricalWindow) -> TechnicalFrame:
    groups: dict[date, list[HistoricalBar]] = {}
    cutoff = date.fromisoformat(window.end_date)
    start = date.fromisoformat(window.first_session) if window.first_session else cutoff
    for bar in window.bars:
        session = date.fromisoformat(bar.session_date)
        monday = session - timedelta(days=session.weekday())
        if session.weekday() < 5 and monday >= start and monday + timedelta(days=4) <= cutoff:
            groups.setdefault(monday, []).append(bar)
    weeks = [_Week(key, tuple(value)) for key, value in sorted(groups.items())]
    # A missing entire ISO week or invalid constituent breaks the suffix.
    suffix: list[_Week] = []
    for week in weeks:
        if suffix and week.monday - suffix[-1].monday != timedelta(days=7):
            suffix = []
        if any(_value(bar, "close") is None for bar in week.rows):
            suffix = []
        else:
            suffix.append(week)
    latest_closed_monday = cutoff - timedelta(days=cutoff.weekday())
    if cutoff.weekday() < 4:
        latest_closed_monday -= timedelta(days=7)
    if suffix and suffix[-1].monday != latest_closed_monday:
        suffix = []
    # If the latest closed group is invalid, suffix must remain empty.
    metrics = []
    for name, required in (("close", 1), ("sma4", 4), ("sma12", 12)):
        selected = suffix[-required:]
        available = len(selected) == required
        value = sum(_value(w.rows[-1], "close") / required for w in selected) if available else None
        reason = None if available else "insufficient_closed_weeks_or_invalid_input"
        if value is not None and not isfinite(value):
            value, available, reason = None, False, "non_finite_result"
        refs = _refs(tuple(bar for w in selected for bar in w.rows), ("close",)) if available else ()
        metrics.append(TechnicalMetric(
            name, value, Availability.AVAILABLE if available else Availability.UNAVAILABLE,
            required, len(selected), len(selected) / required,
            weeks[-1].rows[-1].session_date if weeks else None, refs,
            reason,
        ))
    items = tuple(metrics)
    return TechnicalFrame("weekly", weeks[-1].rows[-1].session_date if weeks else None,
                          _trend(items, "sma4", "sma12"), items,
                          sum(item.value is not None for item in items) / len(items),
                          ("closed_iso_weeks_close_sma4_sma12_ordering",))


def build_technical_research(window: HistoricalWindow) -> TechnicalResearchSnapshot:
    _validate(window)
    rows = window.bars
    daily, weekly = _daily(rows), _weekly(window)
    volume = daily.by_name("volume_ratio20").value
    current = _value(rows[-1], "close") if rows else None
    previous = _value(rows[-2], "close") if len(rows) >= 2 else None
    volume_state = "insufficient_data"
    extra_refs: tuple[EvidenceRef, ...] = ()
    if volume is not None and current is not None and previous is not None:
        extra_refs = _refs(rows[-2:], ("close",))
        if volume == 0:
            volume_state = "no_volume"
        elif volume > 1 and current != previous:
            volume_state = "confirming_up" if current > previous else "confirming_down"
        elif volume > 1:
            volume_state = "above_average_flat"
        else:
            volume_state = "below_average" if volume < 1 else "average"
    # Compute previous ATR with the same seed origin, not a sliding/reseeded window.
    atr_current = daily.by_name("atr14").value
    atr_previous = _metric("atr14_previous", rows[:-1], ("high", "low", "close"), 15,
                           lambda x: atr(x["high"], x["low"], x["close"])[-1], recursive=True)
    volatility = "insufficient_data"
    if atr_current is not None and atr_previous.value is not None:
        volatility = ("stable" if isclose(atr_current, atr_previous.value, rel_tol=1e-12, abs_tol=1e-12)
                      else "expanding" if atr_current > atr_previous.value else "contracting")
    state = ResearchState.INSUFFICIENT_DATA
    if (window.sufficient_history and daily.coverage_ratio == 1
        and daily.state != ResearchState.INSUFFICIENT_DATA
        and weekly.state != ResearchState.INSUFFICIENT_DATA):
        state = daily.state if daily.state == weekly.state else ResearchState.NEUTRAL
    evidence = tuple(dict.fromkeys(
        ref for item in daily.metrics + weekly.metrics for ref in item.evidence
    ))
    evidence = tuple(dict.fromkeys(evidence + extra_refs + atr_previous.evidence))
    return TechnicalResearchSnapshot(
        window.instrument_id, window.venue, window.end_date, window.last_session,
        window.requested_sessions, window.coverage_ratio, daily, weekly, state,
        volume_state, volatility,
        min(window.coverage_ratio, daily.coverage_ratio, weekly.coverage_ratio), evidence,
        ("daily_weekly_trend_agreement" if state != ResearchState.INSUFFICIENT_DATA
         else "required_history_or_technical_inputs_unavailable",),
        window.price_mode, window.corporate_action_adjusted,
        ("corporate_actions_not_adjusted", "weekly_calendar_completeness_unverified",
         "historical_window_not_live_freshness", "recursive_indicators_depend_on_window_start"),
    )
