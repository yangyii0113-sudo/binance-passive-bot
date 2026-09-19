from __future__ import annotations

from typing import Protocol, Sequence

from ..contracts import Instrument, Observation


class TaiwanMarketProvider(Protocol):
    """Public/approved data source boundary for Taiwan equities."""

    @property
    def source_name(self) -> str:
        ...

    def list_instruments(self) -> Sequence[Instrument]:
        ...

    def fetch_market_observations(self) -> Sequence[Observation]:
        ...

    def fetch_all_instrument_observations(self) -> Sequence[Observation]:
        ...

    def fetch_instrument_observations(
        self,
        instrument_id: str,
    ) -> Sequence[Observation]:
        ...
