from __future__ import annotations

import json
from pathlib import Path

from research.tw.pipeline import TaiwanDailySnapshotPipeline
from research.tw.providers.tpex import TPExProvider
from research.tw.providers.twse import TWSEProvider
from research.tw.storage import ObservationStore


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests" / "fixtures" / "tw"


class FixtureTransport:
    def __init__(self, mapping: dict[str, str]) -> None:
        self.mapping = mapping
        self.calls: dict[str, int] = {}

    def get_json(self, url: str):
        self.calls[url] = self.calls.get(url, 0) + 1
        return json.loads(
            (FIXTURES / self.mapping[url]).read_text(encoding="utf-8")
        )


def test_daily_pipeline_fetches_each_market_dataset_once_per_cycle(tmp_path):
    mapping = {
        TWSEProvider.QUOTES_URL: "twse_stock_day_all.json",
        TWSEProvider.INDEX_URL: "twse_fmtqik.json",
        TPExProvider.QUOTES_URL: "tpex_mainboard_daily_close_quotes.json",
        TPExProvider.INDEX_URL: "tpex_daily_trading_index.json",
    }
    transport = FixtureTransport(mapping)
    pipeline = TaiwanDailySnapshotPipeline(
        twse=TWSEProvider(transport),
        tpex=TPExProvider(transport),
        store=ObservationStore(tmp_path / "observations.sqlite"),
    )

    first = pipeline.run()

    assert first.twse_quote_count == 16
    assert first.tpex_quote_count == 8
    assert first.market_count == 10
    assert first.normalized_count == 34
    assert first.inserted_count == 34
    assert first.observed_dates == ("2026-09-18",)
    assert transport.calls[TWSEProvider.QUOTES_URL] == 1
    assert transport.calls[TWSEProvider.INDEX_URL] == 1
    assert transport.calls[TPExProvider.QUOTES_URL] == 1
    assert transport.calls[TPExProvider.INDEX_URL] == 1

    second = pipeline.run()
    assert second.inserted_count == 0
