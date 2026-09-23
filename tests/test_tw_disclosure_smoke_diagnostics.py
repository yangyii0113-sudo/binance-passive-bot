import pytest

from research.tw.disclosure_archive import DisclosureArchive
from research.tw.providers.disclosures import SOURCES
from tools.tw_fundamentals_smoke import fundamentals_smoke_summary


def test_failed_sources_are_reported_before_company_revenue_missing(tmp_path):
    archive = DisclosureArchive(tmp_path)
    batches = tuple(
        archive.record(dataset, b'<html>Service unavailable</html>',
                       captured_at='2026-09-23T01:00:00+00:00')
        for dataset in SOURCES
    )
    with pytest.raises(RuntimeError) as caught:
        fundamentals_smoke_summary(batches, as_of='2026-09-23T01:01:00+00:00')
    message = str(caught.value)
    assert 'parse_failed:JSONDecodeError' in message
    assert 'twse_revenue' in message
    assert 'tpex_revenue' in message
    assert 'no_company_revenue_known_by_cutoff' not in message
    assert len(archive.replay()) == 8
