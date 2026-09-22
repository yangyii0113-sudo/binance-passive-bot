#!/usr/bin/env python3
"""Read-only P3.5 official-data candidate acceptance for TWSE and TPEx."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research.tw.disclosure_archive import DisclosureArchive
from research.tw.intelligence.institutional_flow import build_institutional_flow
from research.tw.intelligence.margin_short import build_margin_short_context
from research.tw.intelligence.market_regime import build_market_regime
from research.tw.intelligence.market_structure import build_market_structure
from research.tw.intelligence.sector_rotation import build_sector_rotation
from research.tw.intelligence.technical import build_technical_research
from research.tw.providers.disclosures import DisclosureProvider, SOURCES
from research.tw.providers.historical import (
    TPExHistoricalProvider,
    TWSEHistoricalProvider,
)
from research.tw.providers.http import UrllibJsonTransport
from research.tw.providers.institutional import (
    TPExInstitutionalSummaryProvider,
    TWSEInstitutionalSummaryProvider,
)
from research.tw.providers.margin import TPExMarginProvider, TWSEMarginProvider
from research.tw.providers.tpex import TPExProvider
from research.tw.providers.twse import TWSEProvider
from research.tw.services.candidate_engine import (
    build_research_candidate,
    rank_candidates_for_review,
)
from research.tw.services.fundamentals import build_fundamentals
from research.tw.services.historical_window import build_historical_window
from research.tw.services.stock_workspace import build_stock_workspace
from tools.tw_public_data_smoke import align_sources_for_integration


ACCEPTANCE = (
    ("TWSE", "2330"),
    ("TPEX", "6488"),
)


def _market_context(transport):
    twse = TWSEProvider(transport)
    tpex = TPExProvider(transport)

    twse_registry = {item.symbol: item for item in twse.list_instruments()}
    tpex_registry = {item.symbol: item for item in tpex.list_instruments()}
    if "2330" not in twse_registry or "6488" not in tpex_registry:
        raise RuntimeError("candidate acceptance instrument registry incomplete")

    twse_quotes = tuple(twse.fetch_all_instrument_observations())
    tpex_quotes = tuple(tpex.fetch_all_instrument_observations())
    twse_index = tuple(twse.fetch_market_observations())
    tpex_index = tuple(tpex.fetch_market_observations())
    if not twse_index or not tpex_index:
        raise RuntimeError("candidate market index context unavailable")

    twse_latest = next(
        (item.observed_at for item in twse_index if item.field == "index_close"),
        None,
    )
    if twse_latest is None:
        raise RuntimeError("candidate TWSE market date unavailable")

    twse_institutional = tuple(
        TWSEInstitutionalSummaryProvider(transport).fetch(twse_latest)
    )
    tpex_institutional = tuple(
        TPExInstitutionalSummaryProvider(transport).fetch()
    )
    twse_margin = tuple(TWSEMarginProvider(transport).fetch(twse_latest))
    tpex_margin = tuple(TPExMarginProvider(transport).fetch())

    aligned, readiness, alignment = align_sources_for_integration(
        {
            "twse_quotes": twse_quotes,
            "twse_index": twse_index,
            "twse_institutional": twse_institutional,
            "twse_margin": twse_margin,
            "tpex_quotes": tpex_quotes,
            "tpex_index": tpex_index,
            "tpex_institutional": tpex_institutional,
            "tpex_margin": tpex_margin,
        },
        transport=transport,
    )
    target = readiness["common_date"]

    result = {}
    for venue, registry in (
        ("TWSE", twse_registry),
        ("TPEX", tpex_registry),
    ):
        prefix = venue.lower()
        quote_rows = tuple(aligned[f"{prefix}_quotes"])
        index_rows = tuple(aligned[f"{prefix}_index"])
        institutional_rows = tuple(aligned[f"{prefix}_institutional"])
        margin_rows = tuple(aligned[f"{prefix}_margin"])

        structure = build_market_structure(
            quote_rows + index_rows,
            venue=venue,
            observed_at=target,
        )
        institutional = build_institutional_flow(
            institutional_rows,
            venue=venue,
            observed_at=target,
        )
        leverage = build_margin_short_context(
            margin_rows,
            venue=venue,
            observed_at=target,
        )
        sectors = build_sector_rotation(
            quote_rows,
            registry.values(),
            venue=venue,
            observed_at=target,
            top_n=3,
        )
        regime = build_market_regime(
            structure=structure,
            institutional=institutional,
            leverage=leverage,
            sectors=sectors,
        )
        result[venue] = {
            "registry": registry,
            "quotes": quote_rows,
            "regime": regime,
        }

    return target, readiness, alignment, result


def _technical_snapshot(
    transport,
    *,
    venue: str,
    symbol: str,
    target_date: str,
):
    cutoff = date.fromisoformat(target_date)
    start = cutoff - timedelta(days=240)
    provider_type = (
        TWSEHistoricalProvider if venue == "TWSE" else TPExHistoricalProvider
    )
    rows = tuple(
        provider_type(transport).fetch_range(
            symbol,
            start.isoformat(),
            cutoff.isoformat(),
        )
    )
    window = build_historical_window(
        rows,
        instrument_id=f"{venue.lower()}:{symbol}",
        venue=venue,
        end_date=target_date,
        sessions=120,
    )
    return build_technical_research(window)


def run() -> dict:
    transport = UrllibJsonTransport(
        timeout_seconds=45,
        attempts=2,
        retry_backoff_seconds=2,
    )
    target, readiness, alignment, contexts = _market_context(transport)

    with tempfile.TemporaryDirectory(prefix="tw-candidate-disclosures-") as path:
        archive = DisclosureArchive(Path(path))
        disclosure_provider = DisclosureProvider(transport, archive)
        batches = tuple(
            disclosure_provider.fetch(dataset)
            for dataset in SOURCES
        )
        as_of = datetime.now(timezone.utc).isoformat()

        candidates = []
        results = []
        for venue, symbol in ACCEPTANCE:
            context = contexts[venue]
            instrument = context["registry"][symbol]
            regime = context["regime"]
            workspace = build_stock_workspace(
                instrument=instrument,
                observations=context["quotes"],
                market_regime=regime,
            )
            technical = _technical_snapshot(
                transport,
                venue=venue,
                symbol=symbol,
                target_date=target,
            )
            fundamentals = build_fundamentals(
                batches,
                instrument_id=f"{venue.lower()}:{symbol}",
                venue=venue,
                as_of=as_of,
            )
            candidate = build_research_candidate(
                workspace=workspace,
                technical=technical,
                fundamentals=fundamentals,
                market_regime=regime,
            )

            if candidate.signal.state.value == "insufficient_data":
                raise RuntimeError(
                    f"{candidate.instrument_id} candidate evidence insufficient: "
                    f"{candidate.signal.rationale}"
                )
            if (
                candidate.signal.confidence is None
                or candidate.review_priority <= 0
                or candidate.evidence_coverage <= 0
                or not candidate.signal.evidence
                or candidate.execution_allowed
                or candidate.signal.execution_allowed
            ):
                raise RuntimeError(
                    f"{candidate.instrument_id} candidate acceptance failed"
                )
            if candidate.signal.state.value in {"bullish", "bearish"}:
                if (
                    candidate.scenario == "UNAVAILABLE"
                    or candidate.invalidation == "UNAVAILABLE"
                ):
                    raise RuntimeError(
                        f"{candidate.instrument_id} directional scenario unbounded"
                    )

            candidates.append(candidate)
            results.append(
                {
                    "instrument_id": candidate.instrument_id,
                    "state": candidate.signal.state.value,
                    "confidence": candidate.signal.confidence,
                    "evidence_coverage": candidate.evidence_coverage,
                    "review_priority": candidate.review_priority,
                    "scenario": candidate.scenario,
                    "invalidation": candidate.invalidation,
                    "evidence_count": len(candidate.signal.evidence),
                    "risk_note_count": len(candidate.risk_notes),
                    "execution_allowed": candidate.execution_allowed,
                }
            )

        ranked = rank_candidates_for_review(candidates, limit=len(candidates))
        if {item.instrument_id for item in ranked} != {
            f"{venue.lower()}:{symbol}" for venue, symbol in ACCEPTANCE
        }:
            raise RuntimeError("candidate ranking lost an acceptance instrument")

        return {
            "ok": True,
            "kind": "official_research_candidate_acceptance",
            "method_version": "tw-candidate.v1",
            "common_date": target,
            "source_readiness": readiness,
            "source_alignment": alignment,
            "as_of": as_of,
            "results": results,
            "ranked_instruments": [
                item.instrument_id for item in ranked
            ],
            "execution_allowed": False,
            "limitations": [
                "Review priority measures evidence completeness/clarity, not expected return.",
                "Signal confidence is not a win probability.",
                "Candidates remain Research Plane outputs with no broker order payload.",
            ],
        }


def main() -> int:
    print(
        json.dumps(
            run(),
            ensure_ascii=False,
            indent=2,
            allow_nan=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
