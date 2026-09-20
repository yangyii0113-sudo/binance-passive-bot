#!/usr/bin/env python3
from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research.tw.acquisition import DatasetPolicy, SnapshottingJsonTransport, latest_row_date
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
from research.tw.providers.tpex import TPExProvider
from research.tw.providers.twse import TWSEProvider
from research.tw.providers.twse_calendar import TWSEHolidayCalendarProvider
from research.tw.services.historical_window import build_historical_window
from research.tw.services.stock_workspace import build_stock_workspace
from research.tw.storage import RawSnapshotStore


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

        twse_inst = build_institutional_flow(
            TWSEInstitutionalSummaryProvider(http_transport).fetch(target_date),
            venue="TWSE",
        )
        tpex_inst = build_institutional_flow(
            TPExInstitutionalSummaryProvider(http_transport).fetch(),
            venue="TPEX",
        )

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

        twse_margin_raw = tuple(TWSEMarginProvider(http_transport).fetch(target_date))
        tpex_margin_raw = tuple(TPExMarginProvider(http_transport).fetch())

        if not twse_margin_raw:
            raise RuntimeError("TWSE margin dataset normalized no observations")
        if not tpex_margin_raw:
            raise RuntimeError("TPEx margin dataset normalized no observations")

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
