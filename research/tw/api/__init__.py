"""Stable read-model API boundary for Taiwan research.

API routes must expose canonical read models, never raw provider payloads.
"""

from .contracts import (
    READ_ONLY_ROUTES,
    TW_MARKET_INTELLIGENCE_ROUTE,
    TW_MARKET_INTELLIGENCE_SCHEMA,
)

__all__ = [
    "READ_ONLY_ROUTES",
    "TW_MARKET_INTELLIGENCE_ROUTE",
    "TW_MARKET_INTELLIGENCE_SCHEMA",
]
