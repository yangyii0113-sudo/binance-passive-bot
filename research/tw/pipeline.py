from __future__ import annotations

from dataclasses import dataclass

from .providers.base import TaiwanMarketProvider
from .storage.observations import ObservationStore


@dataclass(frozen=True)
class DailySnapshotResult:
    normalized_count: int
    inserted_count: int
    twse_quote_count: int
    tpex_quote_count: int
    market_count: int
    observed_dates: tuple[str, ...]


class TaiwanDailySnapshotPipeline:
    """One deterministic append-only Taiwan market snapshot cycle.

    Raw response persistence is supplied by SnapshottingJsonTransport below
    the provider boundary. This pipeline owns only canonical observation
    aggregation and append-only normalized storage.
    """

    def __init__(
        self,
        *,
        twse: TaiwanMarketProvider,
        tpex: TaiwanMarketProvider,
        store: ObservationStore,
    ) -> None:
        self.twse = twse
        self.tpex = tpex
        self.store = store

    def run(self) -> DailySnapshotResult:
        twse_quotes = tuple(self.twse.fetch_all_instrument_observations())
        tpex_quotes = tuple(self.tpex.fetch_all_instrument_observations())
        market = tuple(self.twse.fetch_market_observations()) + tuple(
            self.tpex.fetch_market_observations()
        )

        normalized = twse_quotes + tpex_quotes + market
        inserted = self.store.append_many(normalized)
        dates = tuple(
            sorted(
                {
                    item.observed_at
                    for item in normalized
                    if item.observed_at is not None
                }
            )
        )

        return DailySnapshotResult(
            normalized_count=len(normalized),
            inserted_count=inserted,
            twse_quote_count=len(twse_quotes),
            tpex_quote_count=len(tpex_quotes),
            market_count=len(market),
            observed_dates=dates,
        )
