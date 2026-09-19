from __future__ import annotations


def derive_change_percent(
    close: float | None,
    change: float | None,
) -> float | None:
    """Derive percent change without depending on provider-specific schemas."""
    if close is None or change is None:
        return None
    previous_close = close - change
    if previous_close == 0:
        return None
    return (change / previous_close) * 100.0
