#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import re
from collections.abc import Mapping
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research.tw.acquisition import DatasetPolicy, SnapshottingJsonTransport, latest_row_date
from research.tw.contracts import Availability, Observation
from research.tw.intelligence.institutional_flow import build_institutional_flow
from research.tw.intelligence.margin_short import build_margin_short_context
from research.tw.intelligence.market_regime import (
    MarketRegimeState,
    build_market_regime,
)
from research.tw.intelligence.market_structure import build_market_structure
from research.tw.intelligence.sector_rotation import build_sector_rotation
from research.tw.read_models import (
    MARKET_INTELLIGENCE_SCHEMA_VERSION,
    VenueIntelligenceBundle,
    market_intelligence_read_model,
)
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
from research.tw.providers.session import TWSEExactSessionProvider
from research.tw.providers.tpex import TPExProvider
from research.tw.providers.twse import TWSEProvider
from research.tw.providers.twse_calendar import TWSEHolidayCalendarProvider
from research.tw.services.historical_window import build_historical_window
from research.tw.services.stock_workspace import build_stock_workspace
from research.tw.storage import RawSnapshotStore


REQUIRED_SOURCE_DATASETS = tuple(
    f"{venue}_{kind}"
    for venue in ("twse", "tpex")
    for kind in ("quotes", "index", "institutional", "margin")
)


class OfficialSourceReadinessError(RuntimeError):
    def __init__(self, report: dict):
        self.report = report
        dates = "; ".join(
            f"{name}={','.join(item['dates']) or 'missing'}"
            for name, item in report["sources"].items()
        )
        super().__init__("official sources not ready for common-date integration: " + dates)


def require_aligned_sources(sources: Mapping) -> dict:
    """Check canonical source dates, not market correctness or freshness.

    A passed preflight never replaces the downstream acceptance assertions.
    Missing fields in some securities are allowed; an entire unusable source is
    not. Every source row retains its own date, including unavailable fields.
    """
    report = {"kind": "official_source_date_alignment", "status": "NOT_READY",
              "common_date": None, "sources": {}, "issues": [],
              "execution_allowed": False}
    if not isinstance(sources, Mapping):
        report["issues"] = ["invalid_source_mapping"]
        raise OfficialSourceReadinessError(report)
    if set(sources) - set(REQUIRED_SOURCE_DATASETS):
        report["issues"].append("unexpected_datasets")
    all_dates = set()
    for name in REQUIRED_SOURCE_DATASETS:
        issues, dates, origins = set(), set(), set()
        usable = 0
        if name not in sources:
            issues.add("missing_dataset")
        try:
            rows = tuple(sources.get(name, ()))
        except TypeError:
            rows = ()
            issues.add("invalid_dataset_sequence")
        if not rows:
            issues.add("empty_dataset")
        venue = name.split("_", 1)[0].upper()
        for row in rows:
            if not isinstance(row, Observation):
                issues.add("noncanonical_record")
                continue
            row_valid = True
            try:
                if not isinstance(row.observed_at, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", row.observed_at):
                    raise ValueError("ISO date required")
                date.fromisoformat(row.observed_at)
                dates.add(row.observed_at)
            except ValueError:
                issues.add("invalid_or_missing_date")
                row_valid = False
            if not isinstance(row.source, str) or not row.source.strip():
                issues.add("missing_source")
                row_valid = False
            else:
                origins.add(row.source)
                if row.source.split(":", 1)[0].upper() != venue:
                    issues.add("source_venue_mismatch")
                    row_valid = False
            if not isinstance(row.metadata, Mapping) or row.metadata.get("venue") != venue:
                issues.add("record_venue_mismatch")
                row_valid = False
            numeric = type(row.value) is int or (type(row.value) is float and math.isfinite(row.value))
            if row_valid and row.availability == Availability.AVAILABLE and numeric:
                usable += 1
        if not usable:
            issues.add("no_usable_observations")
        if len(dates) > 1:
            issues.add("mixed_dates")
        report["sources"][name] = {
            "dates": sorted(dates), "origins": sorted(origins),
            "record_count": len(rows), "usable_count": usable, "issues": sorted(issues),
        }
        all_dates.update(dates)
        if issues:
            report["issues"].append(name + ":not_ready")
    if len(all_dates) != 1:
        report["issues"].append("source_dates_not_aligned")
    if report["issues"]:
        raise OfficialSourceReadinessError(report)
    report["status"] = "ALIGNED"
    report["common_date"] = next(iter(all_dates))
    return report


_TWSE_ALIGNMENT_DATASETS = (
    "twse_quotes",
    "twse_index",
    "twse_institutional",
    "twse_margin",
)
_TPEX_ALIGNMENT_DATASETS = (
    "tpex_quotes",
    "tpex_index",
    "tpex_institutional",
    "tpex_margin",
)


def _venue_report_date(report: dict, names: tuple[str, ...]) -> str | None:
    dates = set()
    for name in names:
        item = report.get("sources", {}).get(name, {})
        if item.get("issues") or len(item.get("dates", ())) != 1:
            return None
        dates.add(item["dates"][0])
    return next(iter(dates)) if len(dates) == 1 else None


def align_sources_for_integration(
    sources: Mapping,
    *,
    transport,
) -> tuple[dict, dict, dict]:
    """Preserve the strict common-date gate while recovering a lagging TWSE.

    Latest snapshot feeds can publish at different times. If all four TWSE
    sources agree on one older session and all four TPEx sources agree on one
    newer session, query official TWSE exact-session endpoints for the newer
    date. The strict readiness guard is then run again on the actual recovered
    observations.

    No Observation timestamp is rewritten. Failure to prove the exact session
    returns the original NOT_READY result.
    """
    source_map = {name: tuple(rows) for name, rows in sources.items()}
    try:
        readiness = require_aligned_sources(source_map)
        return source_map, readiness, {
            "mode": "latest_snapshots",
            "attempted": False,
            "execution_allowed": False,
        }
    except OfficialSourceReadinessError as original:
        report = original.report
        if set(report.get("issues", ())) != {"source_dates_not_aligned"}:
            raise

        twse_date = _venue_report_date(report, _TWSE_ALIGNMENT_DATASETS)
        tpex_date = _venue_report_date(report, _TPEX_ALIGNMENT_DATASETS)
        if twse_date is None or tpex_date is None or twse_date >= tpex_date:
            raise

        target_date = tpex_date
        try:
            exact = TWSEExactSessionProvider(transport)
            recovered = dict(source_map)
            recovered["twse_quotes"] = tuple(exact.fetch_quotes(target_date))
            recovered["twse_index"] = tuple(exact.fetch_market(target_date))
            recovered["twse_institutional"] = tuple(
                TWSEInstitutionalSummaryProvider(transport).fetch(target_date)
            )
            recovered["twse_margin"] = tuple(
                TWSEMarginProvider(transport).fetch(target_date)
            )
            readiness = require_aligned_sources(recovered)
        except Exception as recovery_error:
            raise original from recovery_error

        return recovered, readiness, {
            "mode": "twse_exact_session_recovery",
            "attempted": True,
            "from_date": twse_date,
            "target_date": target_date,
            "execution_allowed": False,
        }


def main() -> int:
    policies = (
        DatasetPolicy("twse_stock_day_all", TWSEProvider.QUOTES_URL, latest_row_date("Date")),
        DatasetPolicy("twse_company_profiles", TWSEProvider.COMPANY_URL, latest_row_date("出表日期", "Date")),
        DatasetPolicy("twse_fmtqik", TWSEProvider.INDEX_URL, latest_row_date("Date")),
        DatasetPolicy(
            "twse_holiday_schedule",
            TWSEHolidayCalendarProvider.CALENDAR_URL,
            latest_row_date("Date"),
        ),
        DatasetPolicy("tpex_daily_close", TPExProvider.QUOTES_URL, latest_row_date("Date")),
        DatasetPolicy("tpex_company_profiles", TPExProvider.COMPANY_URL, latest_row_date("Date")),
        DatasetPolicy(
            "tpex_daily_trading_index",
            TPExProvider.INDEX_URL,
            latest_row_date("Date", "TradeDate", "資料日期", "交易日期"),
        ),
    )

    with tempfile.TemporaryDirectory(prefix="foxyya-tw-smoke-") as temp:
        http_transport = UrllibJsonTransport(
            timeout_seconds=90,
            attempts=2,
            retry_backoff_seconds=2,
        )
        transport = SnapshottingJsonTransport(
            transport=http_transport,
            store=RawSnapshotStore(Path(temp)),
            policies=policies,
        )
        twse = TWSEProvider(transport)
        tpex = TPExProvider(transport)
        calendar = TWSEHolidayCalendarProvider(transport)

        twse_registry = {item.symbol: item for item in twse.list_instruments()}
        tpex_registry = {item.symbol: item for item in tpex.list_instruments()}

        required_twse = {"2330", "2317", "2454", "2308", "2881"}
        missing = sorted(required_twse - twse_registry.keys())
        if missing:
            raise RuntimeError(f"TWSE acceptance instruments missing: {missing}")

        twse_daily = tuple(twse.fetch_all_instrument_observations())
        twse_quote = {
            item.field: item
            for item in twse_daily
            if item.instrument_id == "twse:2330"
        }
        if not twse_quote.get("close") or twse_quote["close"].value is None:
            raise RuntimeError("TWSE 2330 close unavailable")

        if not tpex_registry:
            raise RuntimeError("TPEx registry empty")

        tpex_daily = tuple(tpex.fetch_all_instrument_observations())
        tpex_closes = [
            item
            for item in tpex_daily
            if item.field == "close" and item.value is not None
        ]
        if not tpex_closes:
            raise RuntimeError("TPEx daily close dataset normalized no usable closes")

        registry_ids = {item.instrument_id for item in tpex_registry.values()}
        matched_closes = [
            item for item in tpex_closes if item.instrument_id in registry_ids
        ]
        if not matched_closes:
            raise RuntimeError("TPEx registry and daily quote universe do not intersect")

        sample_tpex_close = matched_closes[0]

        twse_market = {item.field: item for item in twse.fetch_market_observations()}
        if not twse_market.get("index_close") or twse_market["index_close"].value is None:
            raise RuntimeError("TAIEX index unavailable")

        tpex_market = {item.field: item for item in tpex.fetch_market_observations()}
        if not tpex_market.get("index_close") or tpex_market["index_close"].value is None:
            raw_index = transport.get_json(TPExProvider.INDEX_URL)
            sample_keys = (
                sorted(raw_index[-1].keys())
                if isinstance(raw_index, list) and raw_index and isinstance(raw_index[-1], dict)
                else []
            )
            raise RuntimeError(
                "TPEx index unavailable; official row keys="
                + ",".join(sample_keys)
            )

        calendar_entries = calendar.entries()
        if not calendar_entries:
            raise RuntimeError("TWSE holiday calendar empty")

        target_date = twse_market["index_close"].observed_at
        if target_date is None:
            raise RuntimeError("TWSE index date unavailable for institutional smoke")

        twse_inst_raw = tuple(
            TWSEInstitutionalSummaryProvider(http_transport).fetch(target_date)
        )
        tpex_inst_raw = tuple(
            TPExInstitutionalSummaryProvider(http_transport).fetch()
        )
        twse_margin_raw = tuple(
            TWSEMarginProvider(http_transport).fetch(target_date)
        )
        tpex_margin_raw = tuple(TPExMarginProvider(http_transport).fetch())

        if not twse_margin_raw:
            raise RuntimeError("TWSE margin dataset normalized no observations")
        if not tpex_margin_raw:
            raise RuntimeError("TPEx margin dataset normalized no observations")

        try:
            aligned_sources, source_readiness, source_alignment = (
                align_sources_for_integration(
                    {
                        "twse_quotes": twse_daily,
                        "twse_index": tuple(twse_market.values()),
                        "twse_institutional": twse_inst_raw,
                        "twse_margin": twse_margin_raw,
                        "tpex_quotes": tpex_daily,
                        "tpex_index": tuple(tpex_market.values()),
                        "tpex_institutional": tpex_inst_raw,
                        "tpex_margin": tpex_margin_raw,
                    },
                    transport=http_transport,
                )
            )
        except OfficialSourceReadinessError as exc:
            diagnostic = {
                **exc.report,
                "checked_at": datetime.now(timezone.utc).isoformat(),
            }
            print(
                "OFFICIAL_SOURCE_READINESS "
                + json.dumps(diagnostic, ensure_ascii=False),
                file=sys.stderr,
                flush=True,
            )
            raise

        target_date = source_readiness["common_date"]
        twse_daily = tuple(aligned_sources["twse_quotes"])
        tpex_daily = tuple(aligned_sources["tpex_quotes"])
        twse_market = {
            item.field: item
            for item in aligned_sources["twse_index"]
        }
        tpex_market = {
            item.field: item
            for item in aligned_sources["tpex_index"]
        }
        twse_inst_raw = tuple(aligned_sources["twse_institutional"])
        tpex_inst_raw = tuple(aligned_sources["tpex_institutional"])
        twse_margin_raw = tuple(aligned_sources["twse_margin"])
        tpex_margin_raw = tuple(aligned_sources["tpex_margin"])

        twse_quote = {
            item.field: item
            for item in twse_daily
            if item.instrument_id == "twse:2330"
        }
        if not twse_quote.get("close") or twse_quote["close"].value is None:
            raise RuntimeError(
                "TWSE 2330 close unavailable after source alignment"
            )

        tpex_closes = [
            item
            for item in tpex_daily
            if item.field == "close" and item.value is not None
        ]
        matched_closes = [
            item for item in tpex_closes if item.instrument_id in registry_ids
        ]
        if not matched_closes:
            raise RuntimeError(
                "TPEx aligned quote universe does not intersect registry"
            )
        sample_tpex_close = matched_closes[0]

        twse_inst = build_institutional_flow(twse_inst_raw, venue="TWSE")
        tpex_inst = build_institutional_flow(tpex_inst_raw, venue="TPEX")
        for snapshot in (twse_inst, tpex_inst):
            for group in ("foreign", "investment_trust", "dealer"):
                flow = snapshot.by_group(group)
                if flow is None or flow.net_amount is None:
                    raise RuntimeError(
                        f"{snapshot.venue} institutional group unavailable: {group}"
                    )
            if snapshot.coverage_ratio < 0.75:
                raise RuntimeError(
                    f"{snapshot.venue} institutional coverage too low: "
                    f"{snapshot.coverage_ratio:.2f}"
                )

        twse_margin = build_margin_short_context(
            twse_margin_raw,
            venue="TWSE",
        )
        tpex_margin = build_margin_short_context(
            tpex_margin_raw,
            venue="TPEX",
        )

        for snapshot in (twse_margin, tpex_margin):
            if snapshot.margin_balance is None:
                raise RuntimeError(
                    f"{snapshot.venue} margin balance unavailable"
                )
            if snapshot.short_balance is None:
                raise RuntimeError(
                    f"{snapshot.venue} short balance unavailable"
                )
            if snapshot.coverage_ratio < 0.70:
                raise RuntimeError(
                    f"{snapshot.venue} margin coverage too low: "
                    f"{snapshot.coverage_ratio:.2f}"
                )

        twse_rotation = build_sector_rotation(
            twse_daily,
            twse_registry.values(),
            venue="TWSE",
            observed_at=target_date,
            top_n=3,
        )
        tpex_rotation = build_sector_rotation(
            tpex_daily,
            tpex_registry.values(),
            venue="TPEX",
            observed_at=target_date,
            top_n=3,
        )

        for snapshot in (twse_rotation, tpex_rotation):
            if snapshot.observed_at != target_date:
                raise RuntimeError(
                    f"{snapshot.venue} sector rotation date mismatch: "
                    f"{snapshot.observed_at} != {target_date}"
                )
            if not snapshot.sectors:
                raise RuntimeError(
                    f"{snapshot.venue} sector rotation has no sectors"
                )
            if not snapshot.leaders or not snapshot.laggards:
                raise RuntimeError(
                    f"{snapshot.venue} sector rotation ranking unavailable"
                )
            if snapshot.coverage_ratio < 0.60:
                raise RuntimeError(
                    f"{snapshot.venue} sector rotation coverage too low: "
                    f"{snapshot.coverage_ratio:.2f}"
                )

        twse_structure = build_market_structure(
            twse_daily + tuple(twse_market.values()),
            venue="TWSE",
            observed_at=target_date,
        )
        tpex_structure = build_market_structure(
            tpex_daily + tuple(tpex_market.values()),
            venue="TPEX",
            observed_at=target_date,
        )

        twse_regime = build_market_regime(
            structure=twse_structure,
            institutional=twse_inst,
            leverage=twse_margin,
            sectors=twse_rotation,
        )
        tpex_regime = build_market_regime(
            structure=tpex_structure,
            institutional=tpex_inst,
            leverage=tpex_margin,
            sectors=tpex_rotation,
        )

        for snapshot in (twse_regime, tpex_regime):
            if snapshot.state == MarketRegimeState.INSUFFICIENT_DATA:
                raise RuntimeError(
                    f"{snapshot.venue} market regime insufficient data"
                )
            if snapshot.directional_score is None:
                raise RuntimeError(
                    f"{snapshot.venue} market regime score unavailable"
                )
            if snapshot.confidence < 0.60:
                raise RuntimeError(
                    f"{snapshot.venue} market regime confidence too low: "
                    f"{snapshot.confidence:.2f}"
                )
            if snapshot.execution_allowed:
                raise RuntimeError(
                    f"{snapshot.venue} market regime execution boundary violated"
                )

        market_read_model = market_intelligence_read_model(
            twse=VenueIntelligenceBundle(
                structure=twse_structure,
                institutional=twse_inst,
                leverage=twse_margin,
                sectors=twse_rotation,
                regime=twse_regime,
            ),
            tpex=VenueIntelligenceBundle(
                structure=tpex_structure,
                institutional=tpex_inst,
                leverage=tpex_margin,
                sectors=tpex_rotation,
                regime=tpex_regime,
            ),
        )
        encoded_read_model = json.dumps(
            market_read_model,
            ensure_ascii=False,
            sort_keys=True,
        )

        if (
            market_read_model.get("schema_version")
            != MARKET_INTELLIGENCE_SCHEMA_VERSION
        ):
            raise RuntimeError("market-intelligence read-model schema mismatch")
        if market_read_model.get("observed_at") != target_date:
            raise RuntimeError("market-intelligence read-model date mismatch")
        if market_read_model.get("execution_allowed") is not False:
            raise RuntimeError("market-intelligence read-model execution boundary violated")
        if market_read_model["quality"]["status"] == "UNAVAILABLE":
            raise RuntimeError("market-intelligence read-model unavailable")
        for venue in ("TWSE", "TPEX"):
            venue_model = market_read_model["venues"][venue]
            if venue_model["quality"]["status"] == "UNAVAILABLE":
                raise RuntimeError(f"{venue} read-model unavailable")
            if venue_model["market_regime"]["state"] == "insufficient_data":
                raise RuntimeError(f"{venue} read-model regime unavailable")
        for raw_key in (
            "OpeningPrice",
            "SecuritiesCompanyCode",
            "PurchaseAmount",
        ):
            if raw_key in encoded_read_model:
                raise RuntimeError(
                    f"provider-native key leaked into read model: {raw_key}"
                )

        acceptance_workspaces = tuple(
            build_stock_workspace(
                instrument=twse_registry[symbol],
                observations=twse_daily,
                market_regime=twse_regime,
            )
            for symbol in sorted(required_twse)
        )
        for workspace in acceptance_workspaces:
            if workspace.observed_at != target_date:
                raise RuntimeError(
                    f"{workspace.instrument.symbol} workspace date mismatch"
                )
            if workspace.quote.close is None:
                raise RuntimeError(
                    f"{workspace.instrument.symbol} workspace close unavailable"
                )
            if workspace.quote.coverage_ratio < 0.80:
                raise RuntimeError(
                    f"{workspace.instrument.symbol} workspace quote coverage too low"
                )
            if workspace.market_regime_state is None:
                raise RuntimeError(
                    f"{workspace.instrument.symbol} workspace regime unavailable"
                )
            if workspace.execution_allowed:
                raise RuntimeError(
                    f"{workspace.instrument.symbol} workspace execution boundary violated"
                )

        sample_tpex_symbol = sample_tpex_close.instrument_id.split(":", 1)[1]
        sample_tpex_instrument = tpex_registry.get(sample_tpex_symbol)
        if sample_tpex_instrument is None:
            raise RuntimeError(
                f"TPEx workspace registry missing sample {sample_tpex_symbol}"
            )
        sample_tpex_workspace = build_stock_workspace(
            instrument=sample_tpex_instrument,
            observations=tpex_daily,
            market_regime=tpex_regime,
        )
        if (
            sample_tpex_workspace.observed_at != target_date
            or sample_tpex_workspace.quote.close is None
            or sample_tpex_workspace.quote.coverage_ratio < 0.80
            or sample_tpex_workspace.market_regime_state is None
            or sample_tpex_workspace.execution_allowed
        ):
            raise RuntimeError(
                f"TPEx sample workspace failed: {sample_tpex_symbol}"
            )

        history_start = (
            date.fromisoformat(target_date) - timedelta(days=70)
        ).isoformat()
        twse_history = tuple(
            TWSEHistoricalProvider(http_transport).fetch_range(
                "2330",
                history_start,
                target_date,
            )
        )
        tpex_history = tuple(
            TPExHistoricalProvider(http_transport).fetch_range(
                sample_tpex_symbol,
                history_start,
                target_date,
            )
        )
        twse_history_window = build_historical_window(
            twse_history,
            instrument_id="twse:2330",
            venue="TWSE",
            end_date=target_date,
            sessions=20,
        )
        tpex_history_window = build_historical_window(
            tpex_history,
            instrument_id=f"tpex:{sample_tpex_symbol}",
            venue="TPEX",
            end_date=target_date,
            sessions=20,
        )

        for window in (twse_history_window, tpex_history_window):
            if not window.sufficient_history:
                raise RuntimeError(
                    f"{window.instrument_id} historical window insufficient: "
                    f"{len(window.bars)}/{window.requested_sessions}"
                )
            if window.last_session is None or window.last_session > target_date:
                raise RuntimeError(
                    f"{window.instrument_id} historical look-ahead violation"
                )
            if window.price_mode != "raw_unadjusted":
                raise RuntimeError(
                    f"{window.instrument_id} historical price mode unexpected"
                )
            if window.corporate_action_adjusted:
                raise RuntimeError(
                    f"{window.instrument_id} raw history mislabeled adjusted"
                )
            if not window.lookahead_blocked:
                raise RuntimeError(
                    f"{window.instrument_id} historical look-ahead gate disabled"
                )
            if not window.sources:
                raise RuntimeError(
                    f"{window.instrument_id} historical provenance unavailable"
                )

        print(
            json.dumps(
                {
                    "ok": True,
                    "source_readiness": source_readiness,
                    "source_alignment": source_alignment,
                    "twse_instruments": len(twse_registry),
                    "tpex_instruments": len(tpex_registry),
                    "tpex_daily_closes": len(tpex_closes),
                    "twse_quote_date": twse_quote["close"].observed_at,
                    "tpex_quote_date": sample_tpex_close.observed_at,
                    "twse_index_date": twse_market["index_close"].observed_at,
                    "tpex_index_date": tpex_market["index_close"].observed_at,
                    "holiday_entries": len(calendar_entries),
                    "twse_institutional_date": twse_inst.observed_at,
                    "tpex_institutional_date": tpex_inst.observed_at,
                    "twse_foreign_net": twse_inst.by_group("foreign").net_amount,
                    "tpex_foreign_net": tpex_inst.by_group("foreign").net_amount,
                    "twse_margin_date": twse_margin.observed_at,
                    "tpex_margin_date": tpex_margin.observed_at,
                    "twse_margin_balance": twse_margin.margin_balance,
                    "tpex_margin_balance": tpex_margin.margin_balance,
                    "twse_short_balance": twse_margin.short_balance,
                    "tpex_short_balance": tpex_margin.short_balance,
                    "twse_sector_count": len(twse_rotation.sectors),
                    "tpex_sector_count": len(tpex_rotation.sectors),
                    "twse_sector_coverage": twse_rotation.coverage_ratio,
                    "tpex_sector_coverage": tpex_rotation.coverage_ratio,
                    "twse_sector_leaders": twse_rotation.leaders,
                    "tpex_sector_leaders": tpex_rotation.leaders,
                    "twse_regime_state": twse_regime.state.value,
                    "tpex_regime_state": tpex_regime.state.value,
                    "twse_regime_score": twse_regime.directional_score,
                    "tpex_regime_score": tpex_regime.directional_score,
                    "twse_regime_confidence": twse_regime.confidence,
                    "tpex_regime_confidence": tpex_regime.confidence,
                    "read_model_schema": market_read_model["schema_version"],
                    "read_model_quality": market_read_model["quality"]["status"],
                    "read_model_bytes": len(encoded_read_model.encode("utf-8")),
                    "stock_workspace_acceptance_count": len(acceptance_workspaces),
                    "stock_workspace_min_coverage": min(
                        item.quote.coverage_ratio
                        for item in acceptance_workspaces
                    ),
                    "tpex_workspace_sample": sample_tpex_symbol,
                    "tpex_workspace_coverage":
                        sample_tpex_workspace.quote.coverage_ratio,
                    "twse_history_sessions":
                        len(twse_history_window.bars),
                    "tpex_history_sessions":
                        len(tpex_history_window.bars),
                    "twse_history_first":
                        twse_history_window.first_session,
                    "tpex_history_first":
                        tpex_history_window.first_session,
                    "twse_history_last":
                        twse_history_window.last_session,
                    "tpex_history_last":
                        tpex_history_window.last_session,
                    "raw_snapshot_root": temp,
                    "execution_allowed": False,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
