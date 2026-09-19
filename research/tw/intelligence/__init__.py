"""Derived Taiwan-market intelligence.

This layer consumes canonical observations only. It must not fetch providers
or authorize execution.
"""

from .institutional_flow import (
    InstitutionalFlowSnapshot,
    InstitutionalGroupFlow,
    build_institutional_flow,
)
from .margin_short import (
    LeverageContextState,
    MarginShortContext,
    build_margin_short_context,
)
from .sector_rotation import (
    SectorRotationRow,
    SectorRotationSnapshot,
    build_sector_rotation,
)
from .market_regime import (
    MarketRegimeSnapshot,
    MarketRegimeState,
    RegimeComponent,
    build_market_regime,
)
from .market_structure import (
    IndexContext,
    MarketBreadth,
    MarketStructureSnapshot,
    MarketTurnover,
    build_market_structure,
)

__all__ = [
    "InstitutionalFlowSnapshot",
    "InstitutionalGroupFlow",
    "build_institutional_flow",
    "MarketRegimeSnapshot",
    "MarketRegimeState",
    "RegimeComponent",
    "build_market_regime",
    "SectorRotationRow",
    "SectorRotationSnapshot",
    "build_sector_rotation",
    "LeverageContextState",
    "MarginShortContext",
    "build_margin_short_context",
    "IndexContext",
    "MarketBreadth",
    "MarketStructureSnapshot",
    "MarketTurnover",
    "build_market_structure",
]
