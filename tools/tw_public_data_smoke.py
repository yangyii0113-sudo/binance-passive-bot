#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research.tw.acquisition import DatasetPolicy, SnapshottingJsonTransport, latest_row_date
from research.tw.intelligence.institutional_flow import build_institutional_flow
from research.tw.intelligence.margin_short import build_margin_short_context
from research.tw.providers.http import UrllibJsonTransport
from research.tw.providers.institutional import (
    TPExInstitutionalSummaryProvider,
    TWSEInstitutionalSummaryProvider,
)
from research.tw.providers.margin import TPExMarginProvider, TWSEMarginProvider
from research.tw.providers.tpex import TPExProvider
from research.tw.providers.twse import TWSEProvider
from research.tw.providers.twse_calendar import TWSEHolidayCalendarProvider
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

        twse_quote = {item.field: item for item in twse.fetch_instrument_observations("twse:2330")}
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

        twse_margin_raw = tuple(TWSEMarginProvider(http_transport).fetch())
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
