"""Stable API contract names for Taiwan market intelligence.

This module declares the read-only contract surface only. Server/runtime
routing is intentionally deferred to the deployable product phase.
"""

TW_MARKET_INTELLIGENCE_ROUTE = "/api/tw/market-intelligence"
TW_MARKET_INTELLIGENCE_SCHEMA = "tw-market-intelligence.v1"

READ_ONLY_ROUTES = (
    TW_MARKET_INTELLIGENCE_ROUTE,
)
