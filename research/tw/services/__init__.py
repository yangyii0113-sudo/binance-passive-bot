"""Research services built only on canonical Taiwan market contracts."""

from .historical_window import (
    HistoricalIntegrityError,
    HistoricalWindow,
    build_historical_window,
)
from .stock_workspace import (
    StockQuoteSnapshot,
    StockWorkspaceSnapshot,
    build_stock_workspace,
)

__all__ = [
    "HistoricalIntegrityError",
    "HistoricalWindow",
    "build_historical_window",
    "StockQuoteSnapshot",
    "StockWorkspaceSnapshot",
    "build_stock_workspace",
]
