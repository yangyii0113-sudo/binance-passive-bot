from __future__ import annotations

from dataclasses import asdict, replace
from datetime import date, timedelta
import json
from pathlib import Path

import pytest

from research.tw.contracts import Availability, ResearchState
from research.tw.history import HistoricalBar
from research.tw.intelligence.technical import build_technical_research
from research.tw.intelligence.technical_indicators import ema, macd, rsi, atr
from research.tw.services.historical_window import (
    HistoricalIntegrityError, HistoricalWindow, build_historical_window,
)


def bars(count=120, *, direction=1, start=date(2026, 1, 5), venue="TWSE"):
    """Synthetic weekdays only; these are calculation fixtures, not market data."""
    result = []
    session = start
    while len(result) < count:
        if session.weekday() < 5:
            close = 200.0 + direction * len(result)
            result.append(HistoricalBar(
                f"{venue.lower()}:2330", venue, session.isoformat(),
                close, close + 2, close - 2, close, 1000,
                None, None, None, f"{venue}:synthetic-test",
            ))
        session += timedelta(days=1)
    return tuple(result)


def window(rows, *, sessions=None, end_date=None):
    return build_historical_window(
        rows, instrument_id=rows[0].instrument_id if rows else "twse:2330",
        venue=rows[0].venue if rows else "TWSE",
        end_date=end_date or (rows[-1].session_date if rows else "2026-09-18"),
        sessions=sessions or len(rows) or 20,
    )


def metric(snapshot, name):
    result = snapshot.daily.by_name(name)
    assert result is not None
    return result


def test_ema_uses_sma_seed_and_recursive_weight_after_price_shock():
    assert ema([1, 2, 3, 8, 4], 3) == [None, None, 2, 5, 4.5]


def test_rsi_uses_wilder_smoothing_not_simple_rolling_gains():
    # Changes +1,+2,-1 => gain=1, loss=1/3 => RSI=75;
    # next -2 => gain=2/3, loss=8/9 => RSI=300/7.
    assert rsi([10, 11, 13, 12, 10], 3) == pytest.approx(
        [None, None, None, 75, 42.85714285714286], nan_ok=True
    )


def test_macd_signal_warmup_and_nonlinear_histogram():
    line, signal, histogram = macd(list(range(1, 9)) + [20], 3, 5, 2)
    assert line[:4] == [None] * 4
    assert signal[:5] == [None] * 5
    assert line[-1] == pytest.approx(17 / 6)
    assert signal[-1] == pytest.approx(20 / 9)
    assert histogram[-1] == pytest.approx(11 / 18)


def test_atr_uses_gaps_and_wilder_seed_with_previous_close():
    # TR: unavailable, 3, 4, 5, 3 => seed 4, then 11/3.
    values = atr([11, 13, 16, 15, 14], [9, 11, 14, 10, 12],
                 [10, 12, 15, 11, 13], 3)
    assert values[:3] == [None] * 3
    assert values[3:] == pytest.approx([4, 11 / 3])


@pytest.mark.parametrize("direction,state,rsi_value", [
    (1, ResearchState.BULLISH, 100),
    (-1, ResearchState.BEARISH, 0),
    (0, ResearchState.NEUTRAL, 50),
])
def test_daily_weekly_and_overall_states_are_descriptive(direction, state, rsi_value):
    result = build_technical_research(window(bars(direction=direction)))
    assert result.state == result.daily.state == result.weekly.state == state
    assert metric(result, "rsi14").value == rsi_value
    assert result.execution_allowed is False
    assert result.price_mode == "raw_unadjusted"
    assert result.corporate_action_adjusted is False
    assert "corporate_actions_not_adjusted" in result.limitations
    assert result.coverage_ratio == 1
    with pytest.raises(ValueError, match="execution"):
        replace(result, execution_allowed=True)


def test_daily_values_and_evidence_use_exact_required_inputs():
    rows = list(bars())
    rows[-1] = replace(rows[-1], volume=2500)
    result = build_technical_research(window(rows))
    expected = {"close": 319, "sma20": 309.5, "sma60": 289.5,
                "ema12": 313.5, "ema26": 306.5, "macd": 7,
                "macd_signal": 7, "macd_histogram": 0,
                "momentum20": 20, "roc20": 100 * 20 / 299,
                "support20": 297, "resistance20": 320,
                "volume_ratio20": 2.5, "atr14": 4,
                "atr_percent14": 400 / 319}
    for name, expected_value in expected.items():
        item = metric(result, name)
        assert item.value == pytest.approx(expected_value)
        assert item.availability == Availability.AVAILABLE
        assert item.coverage_ratio == 1
        assert item.evidence
        assert all(ref.source == "TWSE:synthetic-test" for ref in item.evidence)
        assert all(ref.observed_at <= result.end_date for ref in item.evidence)
    assert metric(result, "sma20").observed_periods == 20
    assert len(metric(result, "sma20").evidence) == 20
    assert len(metric(result, "ema12").evidence) == 120
    assert result.volume_confirmation == "confirming_up"
    assert result.volatility_state == "stable"
    json.dumps(asdict(result), allow_nan=False)


@pytest.mark.parametrize("count,ready,unready", [
    (14, "ema12", "rsi14"), (15, "rsi14", "sma20"),
    (20, "sma20", "roc20"), (21, "roc20", "ema26"),
    (26, "macd", "macd_signal"), (33, "macd", "macd_histogram"),
    (34, "macd_signal", "sma60"),
])
def test_warmup_does_not_invent_unready_indicators(count, ready, unready):
    result = build_technical_research(window(bars(count)))
    assert metric(result, ready).availability == Availability.AVAILABLE
    assert metric(result, unready).value is None
    assert metric(result, unready).availability == Availability.UNAVAILABLE
    assert metric(result, unready).coverage_ratio < 1
    assert result.state == ResearchState.INSUFFICIENT_DATA


@pytest.mark.parametrize("bad", [None, float("nan"), float("inf"), 0, -1, True, "319"])
def test_invalid_latest_close_cannot_reuse_previous_signal(bad):
    rows = list(bars())
    rows[-1] = replace(rows[-1], close=bad)
    result = build_technical_research(window(rows))
    assert result.daily.state == result.state == ResearchState.INSUFFICIENT_DATA
    for name in ("close", "sma20", "ema12", "rsi14", "macd", "roc20", "atr14"):
        assert metric(result, name).value is None
    json.dumps(asdict(result), allow_nan=False)


def test_missing_interior_close_breaks_series_without_compressing_sessions():
    rows = list(bars(60))
    rows[-10] = replace(rows[-10], close=None)
    result = build_technical_research(window(rows))
    for name in ("sma20", "ema12", "rsi14", "macd", "roc20", "atr14"):
        assert metric(result, name).value is None
    assert metric(result, "ema12").observed_periods == 9
    # A new, long enough uninterrupted tail can warm up independently.
    rows = list(bars(120))
    rows[10] = replace(rows[10], close=None)
    recovered = build_technical_research(window(rows))
    assert metric(recovered, "ema12").value == pytest.approx(313.5)
    assert metric(recovered, "ema12").evidence[0].observed_at == rows[11].session_date


@pytest.mark.parametrize("bad_volume", [None, -1, float("nan"), float("inf"), True])
def test_volume_failure_does_not_erase_usable_price_metrics(bad_volume):
    rows = list(bars())
    rows[-1] = replace(rows[-1], volume=bad_volume)
    result = build_technical_research(window(rows))
    assert metric(result, "volume_ratio20").value is None
    assert metric(result, "sma20").value == 309.5
    assert result.daily.state == ResearchState.BULLISH
    assert result.state == ResearchState.INSUFFICIENT_DATA
    assert result.volume_confirmation == "insufficient_data"


def test_zero_volume_is_real_but_zero_baseline_has_no_ratio():
    rows = list(bars())
    rows[-1] = replace(rows[-1], volume=0)
    result = build_technical_research(window(rows))
    assert metric(result, "volume_ratio20").value == 0
    assert result.volume_confirmation == "no_volume"
    zero_rows = [replace(row, volume=0) for row in rows]
    result = build_technical_research(window(zero_rows))
    assert metric(result, "volume_ratio20").value is None
    assert metric(result, "volume_ratio20").reason == "zero_volume_baseline"


def test_missing_source_degrades_metrics_and_never_emits_untraceable_value():
    rows = list(bars())
    rows[-1] = replace(rows[-1], source="")
    result = build_technical_research(window(rows))
    assert result.state == ResearchState.INSUFFICIENT_DATA
    assert metric(result, "close").value is None
    assert metric(result, "ema12").value is None


def test_ohlc_inconsistency_blocks_price_metrics():
    rows = list(bars())
    rows[-1] = replace(rows[-1], high=100)
    result = build_technical_research(window(rows))
    assert metric(result, "close").value is None
    assert metric(result, "atr14").value is None


def test_support_resistance_exclude_current_extreme():
    rows = list(bars())
    rows[-1] = replace(rows[-1], high=500, low=1)
    result = build_technical_research(window(rows))
    assert metric(result, "support20").value == 297
    assert metric(result, "resistance20").value == 320
    assert result.volatility_state == "expanding"
    assert max(ref.observed_at for ref in metric(result, "resistance20").evidence) == rows[-2].session_date


def test_partial_requested_window_keeps_values_but_blocks_overall_state():
    result = build_technical_research(window(bars(), sessions=250))
    assert metric(result, "sma60").value is not None
    assert result.state == ResearchState.INSUFFICIENT_DATA
    assert result.window_coverage_ratio == 120 / 250
    assert result.coverage_ratio < 1


def test_empty_window_is_unavailable_not_zero():
    result = build_technical_research(window(()))
    assert result.state == ResearchState.INSUFFICIENT_DATA
    assert result.observed_at is None
    assert result.coverage_ratio == 0
    assert all(item.value is None for item in result.daily.metrics)


def test_weekly_excludes_incomplete_final_week_and_lookahead():
    rows = bars(63)  # Wednesday after 12 complete weeks.
    result = build_technical_research(window(rows))
    assert result.weekly.observed_at == rows[59].session_date
    assert result.weekly.by_name("close").value == 259
    assert result.weekly.by_name("sma4").value == 251.5
    assert result.weekly.by_name("sma12").value == 231.5
    assert result.weekly.state == ResearchState.BULLISH
    future = replace(bars(64)[-1], close=9000, high=9001)
    assert build_technical_research(window(rows + (future,), sessions=len(rows),
                                          end_date=rows[-1].session_date)) == result


def test_weekly_excludes_leading_partial_week_and_handles_iso_year():
    rows = bars(60, start=date(2025, 12, 30))  # Tuesday; final week incomplete too.
    result = build_technical_research(window(rows))
    item = result.weekly.by_name("sma12")
    assert item.value is None
    assert item.observed_periods == 11
    assert result.weekly.state == ResearchState.INSUFFICIENT_DATA


def test_empty_intervening_week_breaks_weekly_warmup():
    rows = bars(100)
    result = build_technical_research(window(rows[:65] + rows[70:]))
    assert result.weekly.by_name("sma12").value is None
    assert result.weekly.by_name("sma12").observed_periods == 6


def test_missing_latest_closed_week_does_not_reuse_old_weekly_trend():
    rows = bars(100)
    cutoff = (date.fromisoformat(rows[-1].session_date) + timedelta(days=7)).isoformat()
    result = build_technical_research(window(rows, end_date=cutoff))
    assert result.weekly.state == ResearchState.INSUFFICIENT_DATA
    assert result.state == ResearchState.INSUFFICIENT_DATA
    assert result.weekly.by_name("sma12").value is None


def test_weekly_metric_does_not_overflow_when_all_inputs_are_finite():
    rows = tuple(replace(row, open=1e308, high=1e308, low=1e308, close=1e308) for row in bars())
    result = build_technical_research(window(rows))
    json.dumps(asdict(result), allow_nan=False)


def test_recurrences_restart_after_a_hole():
    assert ema([1, 2, 3, None, 5, 6, 7], 3) == [None, None, 2, None, None, None, 6]
    assert rsi([1, 2, 3, 4, None, 8, 7, 6, 5], 3)[-4:] == [None, None, None, 0]


@pytest.mark.parametrize("field,value", [
    ("lookahead_blocked", False), ("price_mode", "adjusted"),
    ("corporate_action_adjusted", True), ("last_session", "1999-01-01"),
    ("coverage_ratio", 0.1), ("sufficient_history", False),
    ("sources", ("invented",)), ("end_date", "2020-01-01"),
])
def test_tampered_window_metadata_fails_closed(field, value):
    with pytest.raises(HistoricalIntegrityError):
        build_technical_research(replace(window(bars()), **{field: value}))


@pytest.mark.parametrize("mutation", ["identity", "venue", "duplicate", "order", "price_mode"])
def test_tampered_window_bars_fail_closed(mutation):
    original = window(bars())
    rows = list(original.bars)
    if mutation == "identity":
        rows[-1] = replace(rows[-1], instrument_id="twse:2317")
    elif mutation == "venue":
        rows[-1] = replace(rows[-1], venue="TPEX")
    elif mutation == "duplicate":
        rows[-1] = rows[-2]
    elif mutation == "order":
        rows[-1], rows[-2] = rows[-2], rows[-1]
    else:
        rows[-1] = replace(rows[-1], price_mode="adjusted")
    with pytest.raises(HistoricalIntegrityError):
        build_technical_research(replace(original, bars=tuple(rows)))


def test_historical_window_existing_import_remains_same_canonical_type():
    from research.tw.history import HistoricalWindow as CanonicalWindow
    assert HistoricalWindow is CanonicalWindow
    assert isinstance(window(bars()), CanonicalWindow)


@pytest.mark.parametrize("bad_member", [None, {"close": 319}, "invalid"])
def test_malformed_bar_members_raise_the_integrity_exception(bad_member):
    original = window(bars())
    with pytest.raises(HistoricalIntegrityError):
        build_technical_research(replace(original, bars=original.bars[:-1] + (bad_member,)))


@pytest.mark.parametrize("field,value", [("venue", None), ("source", []),
                                         ("instrument_id", []), ("session_date", 123)])
def test_malformed_bar_fields_raise_the_integrity_exception(field, value):
    original = window(bars())
    bad = replace(original.bars[-1], **{field: value})
    with pytest.raises(HistoricalIntegrityError):
        build_technical_research(replace(original, bars=original.bars[:-1] + (bad,)))


def test_extreme_finite_volume_does_not_become_false_no_volume():
    rows = tuple(replace(row, volume=1e308) for row in bars())
    result = build_technical_research(window(rows))
    assert metric(result, "volume_ratio20").value == pytest.approx(1)
    assert result.volume_confirmation == "average"


def test_tiny_volume_baseline_is_unavailable_without_division_error():
    rows = [replace(row, volume=0) for row in bars()]
    rows[-2] = replace(rows[-2], volume=5e-324)
    result = build_technical_research(window(rows))
    assert metric(result, "volume_ratio20").value is None
    assert result.volume_confirmation == "insufficient_data"


@pytest.mark.parametrize("venue,symbol,file", [
    ("TWSE", "2330", "twse_stock_day_2330_202609.json"),
    ("TPEX", "6488", "tpex_trading_stock_6488_202609.json"),
])
def test_official_adapter_fixture_to_technical_boundary(venue, symbol, file):
    from research.tw.providers.historical import TWSEHistoricalProvider, TPExHistoricalProvider
    class FixtureTransport:
        def get_json(self, url):
            return json.loads((Path(__file__).parent / "fixtures" / "tw" / file).read_text())
    provider = (TWSEHistoricalProvider if venue == "TWSE" else TPExHistoricalProvider)(FixtureTransport())
    rows = tuple(provider.fetch_month(symbol, date(2026, 9, 1)))
    result = build_technical_research(window(rows, sessions=20))
    assert metric(result, "close").value == rows[-1].close
    assert result.venue == venue
    assert result.state == ResearchState.INSUFFICIENT_DATA
    assert result.execution_allowed is False
    assert metric(result, "close").evidence[0].source == rows[-1].source
