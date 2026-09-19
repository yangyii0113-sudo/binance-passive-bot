from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Iterable

from .contracts import EvidenceRef, Observation
from .intelligence.institutional_flow import InstitutionalFlowSnapshot
from .intelligence.margin_short import MarginShortContext
from .intelligence.market_regime import MarketRegimeSnapshot
from .intelligence.market_structure import MarketStructureSnapshot
from .intelligence.sector_rotation import SectorRotationSnapshot
from .services.market_radar import MarketRadarResult


MARKET_INTELLIGENCE_SCHEMA_VERSION = "tw-market-intelligence.v1"


@dataclass(frozen=True)
class VenueIntelligenceBundle:
    structure: MarketStructureSnapshot
    institutional: InstitutionalFlowSnapshot
    leverage: MarginShortContext
    sectors: SectorRotationSnapshot
    regime: MarketRegimeSnapshot


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


def _quality_status(
    *,
    observed_at: str | None,
    coverage_ratio: float,
) -> str:
    if observed_at is None or coverage_ratio <= 0:
        return "UNAVAILABLE"
    if coverage_ratio < 0.95:
        return "PARTIAL"
    return "AVAILABLE"


def _provenance(
    evidence: Iterable[EvidenceRef],
) -> list[dict[str, str]]:
    unique = sorted(
        {
            (item.source, item.observed_at)
            for item in evidence
            if item.source and item.observed_at
        }
    )
    return [
        {
            "source": source,
            "observed_at": observed_at,
        }
        for source, observed_at in unique
    ]


def _structure_read_model(
    snapshot: MarketStructureSnapshot,
) -> dict[str, Any]:
    return {
        "observed_at": snapshot.observed_at,
        "quality": {
            "status": _quality_status(
                observed_at=snapshot.observed_at,
                coverage_ratio=snapshot.coverage_ratio,
            ),
            "coverage_ratio": snapshot.coverage_ratio,
        },
        "index": {
            "instrument_id": snapshot.index.instrument_id,
            "close": snapshot.index.index_close,
            "change": snapshot.index.index_change,
            "change_percent": snapshot.index.index_change_percent,
            "coverage_ratio": snapshot.index.coverage_ratio,
            "provenance": _provenance(snapshot.index.evidence),
        },
        "breadth": {
            "advancers": snapshot.breadth.advancers,
            "decliners": snapshot.breadth.decliners,
            "unchanged": snapshot.breadth.unchanged,
            "unavailable": snapshot.breadth.unavailable,
            "total": snapshot.breadth.total,
            "advance_decline_ratio": snapshot.breadth.advance_decline_ratio,
            "net_breadth_ratio": snapshot.breadth.net_breadth_ratio,
            "coverage_ratio": snapshot.breadth.coverage_ratio,
            "provenance": _provenance(snapshot.breadth.evidence),
        },
        "turnover": {
            "trade_value": snapshot.turnover.trade_value,
            "trade_volume": snapshot.turnover.trade_volume,
            "transaction_count": snapshot.turnover.transaction_count,
            "coverage_ratio": snapshot.turnover.coverage_ratio,
            "provenance": _provenance(snapshot.turnover.evidence),
        },
    }


def _institutional_read_model(
    snapshot: InstitutionalFlowSnapshot,
) -> dict[str, Any]:
    groups: dict[str, Any] = {}
    all_evidence: list[EvidenceRef] = []
    for item in snapshot.groups:
        all_evidence.extend(item.evidence)
        groups[item.group] = {
            "buy_amount": item.buy_amount,
            "sell_amount": item.sell_amount,
            "net_amount": item.net_amount,
            "component_count": item.component_count,
            "coverage_ratio": item.coverage_ratio,
            "provenance": _provenance(item.evidence),
        }

    return {
        "observed_at": snapshot.observed_at,
        "quality": {
            "status": _quality_status(
                observed_at=snapshot.observed_at,
                coverage_ratio=snapshot.coverage_ratio,
            ),
            "coverage_ratio": snapshot.coverage_ratio,
        },
        "groups": groups,
        "provenance": _provenance(all_evidence),
    }


def _leverage_read_model(
    snapshot: MarginShortContext,
) -> dict[str, Any]:
    return {
        "observed_at": snapshot.observed_at,
        "quality": {
            "status": _quality_status(
                observed_at=snapshot.observed_at,
                coverage_ratio=snapshot.coverage_ratio,
            ),
            "coverage_ratio": snapshot.coverage_ratio,
        },
        "state": snapshot.state.value,
        "margin_balance": snapshot.margin_balance,
        "margin_change": snapshot.margin_change,
        "short_balance": snapshot.short_balance,
        "short_change": snapshot.short_change,
        "margin_short_ratio_percent": snapshot.margin_short_ratio_percent,
        "instrument_count": snapshot.instrument_count,
        "provenance": _provenance(snapshot.evidence),
    }


def _sectors_read_model(
    snapshot: SectorRotationSnapshot,
) -> dict[str, Any]:
    all_evidence: list[EvidenceRef] = []
    sectors: list[dict[str, Any]] = []
    for item in snapshot.sectors:
        all_evidence.extend(item.evidence)
        sectors.append(
            {
                "sector_id": item.sector_id,
                "instrument_count": item.instrument_count,
                "observed_count": item.observed_count,
                "advancers": item.advancers,
                "decliners": item.decliners,
                "unchanged": item.unchanged,
                "breadth_ratio": item.breadth_ratio,
                "weighted_return_percent": item.weighted_return_percent,
                "trade_value": item.trade_value,
                "turnover_share_percent": item.turnover_share_percent,
                "coverage_ratio": item.coverage_ratio,
            }
        )

    return {
        "observed_at": snapshot.observed_at,
        "quality": {
            "status": _quality_status(
                observed_at=snapshot.observed_at,
                coverage_ratio=snapshot.coverage_ratio,
            ),
            "coverage_ratio": snapshot.coverage_ratio,
        },
        "leaders": list(snapshot.leaders),
        "laggards": list(snapshot.laggards),
        "sectors": sectors,
        "provenance": _provenance(all_evidence),
    }


def _regime_read_model(
    snapshot: MarketRegimeSnapshot,
) -> dict[str, Any]:
    return {
        "observed_at": snapshot.observed_at,
        "state": snapshot.state.value,
        "directional_score": snapshot.directional_score,
        "confidence": snapshot.confidence,
        "positive_sector_ratio": snapshot.positive_sector_ratio,
        "leverage_state": snapshot.leverage_state.value,
        "execution_allowed": snapshot.execution_allowed,
        "components": [
            {
                "name": item.name,
                "vote": item.vote,
                "value": item.value,
                "coverage_ratio": item.coverage_ratio,
                "observed_at": item.observed_at,
                "sources": list(item.sources),
            }
            for item in snapshot.components
        ],
    }


def venue_market_intelligence_read_model(
    bundle: VenueIntelligenceBundle,
) -> dict[str, Any]:
    venue = bundle.structure.venue.upper()
    dates = {
        item
        for item in (
            bundle.structure.observed_at,
            bundle.institutional.observed_at,
            bundle.leverage.observed_at,
            bundle.sectors.observed_at,
            bundle.regime.observed_at,
        )
        if item is not None
    }
    observed_at = next(iter(dates)) if len(dates) == 1 else None
    coverages = (
        bundle.structure.coverage_ratio,
        bundle.institutional.coverage_ratio,
        bundle.leverage.coverage_ratio,
        bundle.sectors.coverage_ratio,
        bundle.regime.confidence,
    )
    coverage = sum(coverages) / len(coverages)

    same_venue = all(
        item.upper() == venue
        for item in (
            bundle.institutional.venue,
            bundle.leverage.venue,
            bundle.sectors.venue,
            bundle.regime.venue,
        )
    )
    if not same_venue:
        observed_at = None

    return {
        "venue": venue,
        "observed_at": observed_at,
        "execution_allowed": False,
        "quality": {
            "status": _quality_status(
                observed_at=observed_at,
                coverage_ratio=coverage,
            ),
            "coverage_ratio": coverage,
        },
        "market_structure": _structure_read_model(bundle.structure),
        "institutional_flow": _institutional_read_model(bundle.institutional),
        "leverage_context": _leverage_read_model(bundle.leverage),
        "sector_rotation": _sectors_read_model(bundle.sectors),
        "market_regime": _regime_read_model(bundle.regime),
    }


def market_intelligence_read_model(
    *,
    twse: VenueIntelligenceBundle,
    tpex: VenueIntelligenceBundle,
) -> dict[str, Any]:
    twse_model = venue_market_intelligence_read_model(twse)
    tpex_model = venue_market_intelligence_read_model(tpex)
    dates = {
        item
        for item in (
            twse_model["observed_at"],
            tpex_model["observed_at"],
        )
        if item is not None
    }
    observed_at = next(iter(dates)) if len(dates) == 1 else None
    venue_coverage = (
        float(twse_model["quality"]["coverage_ratio"]),
        float(tpex_model["quality"]["coverage_ratio"]),
    )
    coverage = sum(venue_coverage) / len(venue_coverage)

    return {
        "schema_version": MARKET_INTELLIGENCE_SCHEMA_VERSION,
        "market": "TW",
        "observed_at": observed_at,
        "execution_allowed": False,
        "quality": {
            "status": _quality_status(
                observed_at=observed_at,
                coverage_ratio=coverage,
            ),
            "coverage_ratio": coverage,
        },
        "venues": {
            "TWSE": twse_model,
            "TPEX": tpex_model,
        },
    }
