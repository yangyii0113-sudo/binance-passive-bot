"""Derived Taiwan-market intelligence.

This layer consumes canonical observations only. It must not fetch providers
or authorize execution.
"""

from .market_structure import (
    IndexContext,
    MarketBreadth,
    MarketStructureSnapshot,
    MarketTurnover,
    build_market_structure,
)

__all__ = [
    "IndexContext",
    "MarketBreadth",
    "MarketStructureSnapshot",
    "MarketTurnover",
    "build_market_structure",
]
