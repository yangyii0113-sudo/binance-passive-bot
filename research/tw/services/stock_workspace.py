from __future__ import annotations

from dataclasses import dataclass

from ..contracts import Availability, EvidenceRef, Instrument, Observation
from ..intelligence.market_regime import MarketRegimeSnapshot, MarketRegimeState


QUOTE_FIELDS = (
    "open",
    "high",
    "low",
    "close",
    "change",
    "change_percent",
    "trade_volume",
    "trade_value",
    "transaction_count",
)


@dataclass(frozen=True)
class StockQuoteSnapshot:
    instrument_id: str
    observed_at: str | None
    open: float | None
    high: float | None
    low: float | None
    close: float | None
    change: float | None
    change_percent: float | None
    trade_volume: int | None
    trade_value: int | None
    transaction_count: int | None
    coverage_ratio: float
    evidence: tuple[EvidenceRef, ...]


@dataclass(frozen=True)
class StockWorkspaceSnapshot:
    instrument: Instrument
    observed_at: str | None
    quote: StockQuoteSnapshot
    market_regime_state: MarketRegimeState | None
    market_regime_confidence: float | None
    execution_allowed: bool = False

    def __post_init__(self) -> None:
        if self.execution_allowed:
            raise ValueError("Taiwan stock workspace cannot authorize execution")


def _evidence(item: Observation) -> EvidenceRef | None:
    if not item.source or not item.observed_at:
        return None
    return EvidenceRef(
        field=item.field,
        source=item.source,
        observed_at=item.observed_at,
        instrument_id=item.instrument_id,
    )


def build_stock_workspace(
    *,
    instrument: Instrument,
    observations: tuple[Observation, ...] | list[Observation],
    market_regime: MarketRegimeSnapshot | None = None,
) -> StockWorkspaceSnapshot:
    rows = tuple(
        item
        for item in observations
        if item.instrument_id == instrument.instrument_id
        and item.field in QUOTE_FIELDS
    )
    dates = [
        item.observed_at
        for item in rows
        if item.observed_at is not None
    ]
    target = max(dates) if dates else None

    selected: dict[str, Observation] = {}
    if target is not None:
        for item in rows:
            if item.observed_at == target:
                selected[item.field] = item

    def value(field: str):
        item = selected.get(field)
        if (
            item is None
            or item.availability != Availability.AVAILABLE
            or item.value is None
        ):
            return None
        return item.value

    evidence = tuple(
        ref
        for ref in (
            _evidence(selected[field])
            for field in QUOTE_FIELDS
            if field in selected
            and selected[field].availability == Availability.AVAILABLE
        )
        if ref is not None
    )
    available_count = sum(
        field in selected
        and selected[field].availability == Availability.AVAILABLE
        and selected[field].value is not None
        for field in QUOTE_FIELDS
    )
    quote = StockQuoteSnapshot(
        instrument_id=instrument.instrument_id,
        observed_at=target,
        open=value("open"),
        high=value("high"),
        low=value("low"),
        close=value("close"),
        change=value("change"),
        change_percent=value("change_percent"),
        trade_volume=value("trade_volume"),
        trade_value=value("trade_value"),
        transaction_count=value("transaction_count"),
        coverage_ratio=available_count / len(QUOTE_FIELDS),
        evidence=evidence,
    )

    regime_state = None
    regime_confidence = None
    if (
        market_regime is not None
        and market_regime.venue.upper() == instrument.venue.upper()
        and market_regime.observed_at == target
        and market_regime.state != MarketRegimeState.INSUFFICIENT_DATA
    ):
        regime_state = market_regime.state
        regime_confidence = market_regime.confidence

    return StockWorkspaceSnapshot(
        instrument=instrument,
        observed_at=target,
        quote=quote,
        market_regime_state=regime_state,
        market_regime_confidence=regime_confidence,
        execution_allowed=False,
    )
