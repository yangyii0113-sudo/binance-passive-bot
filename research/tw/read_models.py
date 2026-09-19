from __future__ import annotations

from dataclasses import asdict
from typing import Any

from .contracts import Observation
from .services.market_radar import MarketRadarResult


def observation_read_model(observation: Observation) -> dict[str, Any]:
    payload = asdict(observation)
    payload["availability"] = observation.availability.value
    return payload


def market_radar_read_model(result: MarketRadarResult) -> dict[str, Any]:
    return {
        "market": "TW",
        "execution_allowed": False,
        "state": result.state.value,
        "quality": {
            "available_fields": result.available_fields,
            "stale_fields": result.stale_fields,
            "unavailable_fields": result.unavailable_fields,
        },
        "observations": [
            observation_read_model(item)
            for item in result.observations
        ],
    }
