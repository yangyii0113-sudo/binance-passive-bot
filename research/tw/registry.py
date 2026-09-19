from __future__ import annotations

from collections.abc import Iterable

from .contracts import Instrument
from .providers.base import TaiwanMarketProvider


class InstrumentRegistry:
    def __init__(self, providers: Iterable[TaiwanMarketProvider]) -> None:
        self.providers = tuple(providers)

    def build(self) -> dict[str, Instrument]:
        registry: dict[str, Instrument] = {}
        for provider in self.providers:
            for instrument in provider.list_instruments():
                if instrument.instrument_id in registry:
                    raise ValueError(
                        f"duplicate instrument_id: {instrument.instrument_id}"
                    )
                registry[instrument.instrument_id] = instrument
        return registry

    def by_symbol(self, symbol: str) -> tuple[Instrument, ...]:
        return tuple(
            instrument
            for instrument in self.build().values()
            if instrument.symbol == symbol
        )
