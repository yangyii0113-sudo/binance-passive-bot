from __future__ import annotations

from pathlib import Path

import pytest

from research.tw.contracts import Availability, Instrument, Observation
from research.tw.intelligence.sector_rotation import build_sector_rotation


ROOT = Path(__file__).resolve().parents[1]


def _instrument(symbol: str, sector: str) -> Instrument:
    return Instrument(
        instrument_id=f"twse:{symbol}",
        symbol=symbol,
        name=symbol,
        venue="TWSE",
        sector=sector,
    )


def _observation(
    symbol: str,
    field: str,
    value,
    *,
    availability: Availability = Availability.AVAILABLE,
) -> Observation:
    return Observation(
        instrument_id=f"twse:{symbol}",
        field=field,
        value=value,
        source="TWSE:fixture",
        observed_at="2026-09-18",
        availability=availability,
        metadata={"venue": "TWSE", "symbol": symbol},
    )


def _rows():
    instruments = (
        _instrument("1001", "24"),
        _instrument("1002", "24"),
        _instrument("2001", "31"),
        _instrument("2002", "31"),
    )
    observations = (
        _observation("1001", "change_percent", 2.0),
        _observation("1001", "trade_value", 100),
        _observation("1002", "change_percent", -1.0),
        _observation("1002", "trade_value", 300),
        _observation("2001", "change_percent", 3.0),
        _observation("2001", "trade_value", 200),
        _observation("2002", "change_percent", 1.0),
        _observation("2002", "trade_value", 200),
    )
    return observations, instruments


def test_sector_rotation_builds_weighted_return_breadth_and_turnover_share():
    observations, instruments = _rows()
    result = build_sector_rotation(
        observations,
        instruments,
        venue="TWSE",
        top_n=1,
    )

    sector24 = result.by_sector("24")
    sector31 = result.by_sector("31")

    assert result.observed_at == "2026-09-18"
    assert result.coverage_ratio == 1.0

    assert sector24 is not None
    assert sector24.weighted_return_percent == pytest.approx(-0.25)
    assert sector24.breadth_ratio == 0.0
    assert sector24.trade_value == 400
    assert sector24.turnover_share_percent == pytest.approx(50.0)

    assert sector31 is not None
    assert sector31.weighted_return_percent == pytest.approx(2.0)
    assert sector31.breadth_ratio == 1.0
    assert sector31.trade_value == 400
    assert sector31.turnover_share_percent == pytest.approx(50.0)

    assert result.leaders == ("31",)
    assert result.laggards == ("24",)


def test_sector_rotation_degrades_coverage_without_fabricating_return():
    observations, instruments = _rows()
    observations = tuple(
        item
        for item in observations
        if not (
            item.instrument_id == "twse:1002"
            and item.field == "change_percent"
        )
    )

    result = build_sector_rotation(
        observations,
        instruments,
        venue="TWSE",
    )
    sector24 = result.by_sector("24")

    assert sector24 is not None
    assert sector24.coverage_ratio == 0.5
    assert sector24.observed_count == 1
    assert result.coverage_ratio == 0.75


def test_sector_rotation_excludes_instruments_without_sector_mapping():
    observations, instruments = _rows()
    instruments = instruments + (
        Instrument(
            instrument_id="twse:9999",
            symbol="9999",
            name="unknown",
            venue="TWSE",
            sector=None,
        ),
    )
    observations = observations + (
        _observation("9999", "change_percent", 99.0),
        _observation("9999", "trade_value", 999999),
    )

    result = build_sector_rotation(observations, instruments, venue="TWSE")

    assert {item.sector_id for item in result.sectors} == {"24", "31"}
    assert result.coverage_ratio == 1.0


def test_sector_rotation_intelligence_has_no_provider_dependency():
    source = (
        ROOT / "research" / "tw" / "intelligence" / "sector_rotation.py"
    ).read_text(encoding="utf-8")

    assert "providers." not in source
    assert "urllib" not in source
    assert "requests" not in source
