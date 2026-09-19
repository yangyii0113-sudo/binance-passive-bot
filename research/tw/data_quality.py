from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone

from .contracts import Availability, Observation


def _parse_iso8601(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def apply_quality_gate(
    observation: Observation,
    *,
    now: datetime | None = None,
    stale_after_seconds: int | None = None,
) -> Observation:
    """Normalize availability without inventing a value.

    Missing value/source/timestamp => UNAVAILABLE.
    A present but old observation => STALE.
    Otherwise => AVAILABLE.
    """
    if (
        observation.value is None
        or not observation.source
        or not observation.observed_at
    ):
        return replace(observation, availability=Availability.UNAVAILABLE)

    if stale_after_seconds is None:
        return replace(observation, availability=Availability.AVAILABLE)

    current = now or datetime.now(timezone.utc)
    observed = _parse_iso8601(observation.observed_at)
    age = max(0, int((current - observed).total_seconds()))
    status = (
        Availability.STALE
        if age > stale_after_seconds
        else Availability.AVAILABLE
    )
    return replace(
        observation,
        freshness_seconds=age,
        availability=status,
    )
