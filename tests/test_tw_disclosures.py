from __future__ import annotations

from dataclasses import replace
from decimal import Decimal
from hashlib import sha256
import json
from pathlib import Path

import pytest

from research.tw.contracts import Availability
from research.tw.fundamental_contracts import DisclosureIntegrityError
from research.tw.providers.disclosures import normalize_disclosures, DisclosureProvider
from research.tw.disclosure_archive import DisclosureArchive
from research.tw.services.fundamentals import build_fundamentals

FIXTURES = Path(__file__).parent / 'fixtures/tw/disclosures'
CAPTURE = '2026-09-20T03:00:00+00:00'


def payload(dataset):
    return json.loads((FIXTURES / (dataset + '.json')).read_text())


def batch(dataset='twse_revenue', rows=None, at=CAPTURE):
    data = payload(dataset) if rows is None else rows
    raw = json.dumps(data, ensure_ascii=False).encode()
    return normalize_disclosures(dataset, data, captured_at=at, raw_sha256=sha256(raw).hexdigest())


def snapshot(*batches, symbol='2330', venue='TWSE', at=CAPTURE):
    return build_fundamentals(batches, instrument_id=f'{venue.lower()}:{symbol}', venue=venue, as_of=at)


@pytest.mark.parametrize('venue,symbol,current', [('twse','2330',514805337), ('tpex','6488',4764363)])
def test_revenue_units_values_and_exact_ratios(venue, symbol, current):
    result = snapshot(batch(venue+'_revenue'), symbol=symbol, venue=venue.upper())
    assert result.revenue.record.current == current
    assert result.revenue.record.period == '2026-08'
    assert result.revenue.record.unit == 'TWD_THOUSAND'
    assert result.revenue.availability == Availability.AVAILABLE
    assert result.revenue.mom_percent == Decimal('10.099819' if venue=='twse' else '-4.286970')
    assert result.revenue.yoy_percent == Decimal('53.320054' if venue=='twse' else '7.605508')
    assert not result.execution_allowed and not result.corporate_action_adjusted


def test_revisions_are_received_time_gated_and_do_not_backdate():
    first = batch()
    rows = payload('twse_revenue')
    target = next(r for r in rows if r['公司代號']=='2330')
    target['營業收入-當月營收'] = '123'
    second = batch(rows=rows, at='2026-09-21T03:00:00Z')
    assert snapshot(second).revenue.record is None
    assert snapshot(first, second).revenue.record.current == 514805337
    assert snapshot(first, second, at='2026-09-21T04:00:00Z').revenue.record.current == 123
    assert snapshot(first, at='2026-09-19T23:59:59Z').revenue.record is None


def test_missing_and_zero_are_different_and_zero_denominator_unavailable():
    rows = payload('twse_revenue')[:1]
    rows[0].update({'公司代號':'2330', '營業收入-當月營收':'0', '營業收入-上月營收':'0',
                    '營業收入-去年當月營收':'--', '累計營業收入-當月累計營收':''})
    result = snapshot(batch(rows=rows)).revenue
    assert result.record.current == 0 and result.record.previous_year is None
    assert result.mom_percent is None and result.yoy_percent is None and result.ytd_yoy_percent is None


@pytest.mark.parametrize('bad', ['NaN', 'Infinity', '1e10000', '12.3', True, 'bogus'])
def test_invalid_amounts_fail_closed(bad):
    rows = payload('twse_revenue')[:1]
    rows[0]['營業收入-當月營收'] = bad
    with pytest.raises(DisclosureIntegrityError): batch(rows=rows)


@pytest.mark.parametrize('bad', ['1150230', '1151301', '', None])
def test_invalid_required_observation_date_fails(bad):
    rows=payload('twse_revenue')[:1]; rows[0]['出表日期']=bad
    with pytest.raises(DisclosureIntegrityError): batch(rows=rows)


def test_future_source_snapshot_and_future_reporting_period_rejected():
    rows=payload('twse_revenue')[:1]; rows[0]['出表日期']='1150921'
    with pytest.raises(DisclosureIntegrityError): batch(rows=rows)
    rows[0]['出表日期']='1150917'; rows[0]['資料年月']='11510'
    with pytest.raises(DisclosureIntegrityError): batch(rows=rows)


def test_missing_schema_and_wrong_top_level_are_not_empty_success():
    for rows in ({'data': []}, [None], [{'公司代號':'2330'}]):
        with pytest.raises(DisclosureIntegrityError): batch(rows=rows)


def test_conflicting_duplicate_same_version_fails_and_exact_duplicate_collapses():
    rows=payload('twse_revenue')[:1]
    assert len(batch(rows=rows + rows).records)==1
    changed=dict(rows[0]); changed['營業收入-當月營收']='55'
    with pytest.raises(DisclosureIntegrityError): batch(rows=rows+[changed])
    one=batch(rows=rows); two=batch(rows=[changed])
    with pytest.raises(DisclosureIntegrityError): snapshot(one,two)


def test_material_time_padding_fact_date_and_financial_topics():
    tw = batch('twse_material').records[0]
    assert tw.evidence.published_at == '2026-09-18T23:00:03+00:00'
    assert tw.event_date == '2026-06-29' and tw.date_role == 'fact_date'
    tp = batch('tpex_material')
    conference = snapshot(tp, venue='TPEX', symbol='2718').events[0].record
    assert conference.event_date == '2026-09-21'
    assert 'investor_conference' in conference.topics
    assert conference.evidence.available_at == CAPTURE
    corrected = snapshot(tp, venue='TPEX', symbol='6111').events[0].record
    assert 'financial_report' in corrected.topics and '更正' in corrected.title
    assert not snapshot(tp, venue='TPEX', symbol='6270').events[0].record.topics


def test_future_publication_excluded_even_if_received():
    rows=payload('tpex_material')[:1]; rows[0]['發言日期']='1150921'
    result=batch('tpex_material',rows)
    assert not snapshot(result, venue='TPEX', symbol='2718').events
    assert snapshot(result, venue='TPEX', symbol='2718', at='2026-09-22T03:00:00Z').events


def test_dividend_components_and_archival_coverage():
    tw=snapshot(batch('twse_dividend'))
    target=next(e.record for e in tw.events if e.record.fiscal_period=='2026:第2季:1')
    assert target.cash_dividend_per_share == Decimal('7')
    assert target.evidence.published_at is None
    assert target.date_role=='board_resolution_date'
    tp=snapshot(batch('tpex_dividend'), venue='TPEX',symbol='6488')
    coverage=next(c for c in tp.coverage if c.dataset=='tpex_dividend')
    assert coverage.availability==Availability.STALE
    assert coverage.observed_at=='2021-08-04'


def test_exright_alphanumeric_symbol_missing_cash_future_schedule():
    b=batch('twse_exright'); record=next(r for r in b.records if r.instrument_id=='twse:00400A')
    result=snapshot(b, symbol=record.instrument_id.split(':')[1])
    assert result.events[0].record.event_date=='2026-10-08'
    assert result.events[0].record.cash_dividend_per_share is None
    assert result.events[0].record.date_role=='ex_date'
    t=next(r for r in batch('tpex_exright').records if r.instrument_id=='tpex:1815')
    assert t.cash_dividend_per_share==Decimal('0.50001709')


def test_empty_failed_absent_and_stale_have_distinct_coverage():
    empty=batch('twse_material',[])
    result=snapshot(empty)
    assert result.coverage[1].availability==Availability.AVAILABLE
    assert result.coverage[1].row_count==0
    assert result.coverage[0].availability==Availability.UNAVAILABLE
    assert snapshot(batch(rows=[])).coverage[0].availability==Availability.UNAVAILABLE
    assert snapshot(batch(), at='2026-10-20T03:00:00Z').revenue.availability==Availability.STALE
    failed=replace(empty, captured_at='2026-09-21T03:00:00Z',observed_at=None,raw_sha256=None,error='network failure')
    assert snapshot(empty,failed,at='2026-09-21T04:00:00Z').coverage[1].availability==Availability.UNAVAILABLE
    assert snapshot(empty,failed).coverage[1].availability==Availability.AVAILABLE


def test_failed_refresh_keeps_prior_revenue_with_degraded_availability():
    good=batch()
    bad=replace(good,records=(),captured_at='2026-09-21T03:00:00Z',error='network failure')
    result=snapshot(good,bad,at='2026-09-21T04:00:00Z')
    assert result.revenue.record.current==514805337
    assert result.revenue.availability==Availability.UNAVAILABLE


class Transport:
    def __init__(self, raw): self.raw=raw
    def get_bytes(self,url):
        if isinstance(self.raw,Exception): raise self.raw
        return self.raw


def test_archive_preserves_exact_bytes_attempts_and_replays_without_backdating(tmp_path):
    raw=(FIXTURES/'twse_revenue.json').read_bytes()
    archive=DisclosureArchive(tmp_path)
    provider=DisclosureProvider(Transport(raw), archive, clock=lambda:CAPTURE)
    first=provider.fetch('twse_revenue')
    assert first.error is None
    provider.clock=lambda:'2026-09-21T03:00:00Z'
    provider.fetch('twse_revenue')
    provider.transport=Transport(RuntimeError('failed'))
    provider.clock=lambda:'2026-09-22T03:00:00Z'
    assert provider.fetch('twse_revenue').error
    batches=archive.replay()
    assert len(batches)==3
    assert snapshot(*batches).revenue.record.current==514805337
    assert snapshot(*batches, at='2026-09-19T03:00:00Z').revenue.record is None
    assert snapshot(*batches, at='2026-09-22T04:00:00Z').coverage[0].availability==Availability.UNAVAILABLE
    assert raw in [p.read_bytes() for p in (tmp_path/'raw').rglob('*.json')]


def test_parse_failure_is_archived_and_replayed_as_failure(tmp_path):
    archive=DisclosureArchive(tmp_path)
    result=DisclosureProvider(Transport(b'<html>failure</html>'),archive,clock=lambda:CAPTURE).fetch('twse_material')
    assert result.error and not result.records
    assert archive.replay()[0].error
    raw=next((tmp_path/'raw').rglob('*.json'))
    raw.write_bytes(b'tampered')
    with pytest.raises(DisclosureIntegrityError): archive.replay()


def test_contract_rejects_execution_timezone_and_cross_instrument_scope():
    result=snapshot(batch())
    with pytest.raises(DisclosureIntegrityError): replace(result,execution_allowed=True)
    with pytest.raises(DisclosureIntegrityError): replace(result,corporate_action_adjusted=True)
    with pytest.raises(DisclosureIntegrityError): snapshot(batch(),at='2026-09-20')
    with pytest.raises(DisclosureIntegrityError): build_fundamentals((batch(),),instrument_id='tpex:2330',venue='TWSE',as_of=CAPTURE)


def test_official_not_announced_amount_and_zero_optional_date_are_missing():
    rows=payload('tpex_exright')[:1]; rows[0]['CashDividend']='尚未公告'
    assert batch('tpex_exright',rows).records[0].cash_dividend_per_share is None
    rows=payload('twse_dividend')[:1]; rows[0]['董事會（擬議）股利分派日']='0'
    assert batch('twse_dividend',rows).records[0].event_date is None


def test_dividend_separate_board_dates_in_same_source_period_are_distinct_events():
    b=batch('tpex_dividend')
    events=[e for e in b.records if e.fiscal_period=='2020:年度:1' and e.instrument_id=='tpex:6488']
    assert len(events)==2
    assert {e.cash_dividend_per_share for e in events}=={Decimal('8'),Decimal('10')}


def test_archival_dividend_ambiguous_source_periods_retain_row_identity():
    b=batch('tpex_dividend')
    events=[e for e in b.records if e.instrument_id=='tpex:5009' and e.fiscal_period.startswith('2019:')]
    assert len(events)>=2
    assert len({e.record_id for e in events})==len(events)
    assert all(e.identity_basis=='archival_row_fingerprint' for e in events)


def test_month_period_stale_even_with_fresh_source_date():
    rows=payload('twse_revenue')[:1]; rows[0].update({'公司代號':'2330','資料年月':'11408'})
    assert snapshot(batch(rows=rows)).revenue.availability==Availability.STALE


def test_nonnumeric_dividend_component_never_becomes_zero():
    rows=payload('twse_dividend')[:1]
    rows[0]['股東配發-資本公積發放之現金(元/股)']=''
    assert batch('twse_dividend',rows).records[0].cash_dividend_per_share is None


def test_canonical_boundary_does_not_allow_future_observation():
    b=batch(); r=b.records[0]
    with pytest.raises(DisclosureIntegrityError): replace(r.evidence,observed_at='2027-01-01')


def test_canonical_boundary_requires_real_evidence_and_valid_instrument():
    b=batch(); r=b.records[0]
    with pytest.raises(DisclosureIntegrityError): replace(r,evidence=None)
    with pytest.raises(DisclosureIntegrityError): replace(r,instrument_id='twse:')


def test_service_and_intelligence_never_import_provider_or_network():
    import ast
    root=Path(__file__).parents[1]
    for rel in ('research/tw/intelligence/fundamentals.py','research/tw/services/fundamentals.py'):
        tree=ast.parse((root/rel).read_text())
        for node in ast.walk(tree):
            names=[a.name for a in node.names] if isinstance(node,ast.Import) else ([node.module or ''] if isinstance(node,ast.ImportFrom) else [])
            assert all(not any(token in name for token in ('providers','http','urllib','socket','disclosure_archive')) for name in names)


def test_live_smoke_contract_all_sources_and_explicit_archival_exception():
    from research.tw.providers.disclosures import SOURCES
    from tools.tw_fundamentals_smoke import fundamentals_smoke_summary
    batches=tuple(batch(ds) for ds in SOURCES)
    result=fundamentals_smoke_summary(batches,as_of=CAPTURE)
    assert result['ok'] and len(result['results'])==6
    assert next(d for d in result['datasets'] if d['dataset']=='tpex_dividend')['availability']==Availability.STALE
    with pytest.raises(RuntimeError): fundamentals_smoke_summary(batches[:-1],as_of=CAPTURE)
    broken=replace(batches[-1], records=(), error='fetch_failed')
    with pytest.raises(RuntimeError): fundamentals_smoke_summary((*batches[:-1],broken),as_of=CAPTURE)


def test_latest_revenue_snapshot_missing_company_downgrades_retained_history():
    first=batch()
    rows=[r for r in payload('twse_revenue') if r['公司代號']!='2330']
    latest=batch(rows=rows,at='2026-09-21T03:00:00Z')
    result=snapshot(first,latest,at='2026-09-21T04:00:00Z')
    assert result.revenue.record.current==514805337
    assert result.revenue.availability==Availability.UNAVAILABLE
    assert result.revenue.reason=='company_not_in_latest_snapshot'
    assert snapshot(first,latest).revenue.availability==Availability.AVAILABLE


def test_removed_exright_event_is_historical_unconfirmed_not_current_schedule():
    first=batch('twse_exright')
    empty=batch('twse_exright',[],at='2026-09-21T03:00:00Z')
    result=snapshot(first,empty,symbol='00400A',at='2026-09-21T04:00:00Z')
    event=result.events[0]
    assert event.record.event_date=='2026-10-08'
    assert event.availability==Availability.UNAVAILABLE
    assert event.source_presence=='absent_from_latest_snapshot'
    assert event.reason=='schedule_no_longer_confirmed_by_latest_source'


def test_rolling_material_history_is_retained_with_historical_presence():
    first=batch('tpex_material')
    empty=batch('tpex_material',[],at='2026-09-21T03:00:00Z')
    event=snapshot(first,empty,venue='TPEX',symbol='6111',at='2026-09-21T04:00:00Z').events[0]
    assert event.source_presence=='absent_from_latest_snapshot'
    assert event.availability==Availability.STALE
    assert event.reason=='historical_record_outside_latest_snapshot'


def test_canonical_semantic_revenue_conflict_cannot_depend_on_record_order():
    b=batch(); r=next(r for r in b.records if r.instrument_id=='twse:2330')
    changed=replace(r,record_id='another-id',current=5)
    for records in ((r,changed),(changed,r)):
        with pytest.raises(DisclosureIntegrityError):
            snapshot(replace(b,records=records))


def test_older_conflicting_receipts_are_rejected_for_every_input_permutation():
    from itertools import permutations
    a=batch()
    rows=payload('twse_revenue'); rows[0]['營業收入-當月營收']='123'
    b=batch(rows=rows)
    rows[0]['營業收入-當月營收']='234'
    c=batch(rows=rows,at='2026-09-21T03:00:00Z')
    for order in permutations((a,b,c)):
        with pytest.raises(DisclosureIntegrityError): snapshot(*order,at='2026-09-21T04:00:00Z')


def test_batch_cannot_relabel_archival_rows_as_fresh_or_backdate_empty_feed():
    b=batch('tpex_dividend')
    with pytest.raises(DisclosureIntegrityError): replace(b,observed_at='2026-09-20')
    empty=batch('twse_material',[])
    with pytest.raises(DisclosureIntegrityError): replace(empty,observed_at='2026-09-19')


def test_removed_revenue_stays_unavailable_after_source_snapshot_becomes_old():
    first=batch()
    latest=batch(rows=[r for r in payload('twse_revenue') if r['公司代號']!='2330'],at='2026-09-21T03:00:00Z')
    result=snapshot(first,latest,at='2026-10-05T04:00:00Z')
    assert result.revenue.availability==Availability.UNAVAILABLE
    assert result.revenue.reason=='company_not_in_latest_snapshot'


def test_canonical_exright_requires_date_and_consistent_date_role():
    event=batch('twse_exright').records[0]
    with pytest.raises(DisclosureIntegrityError): replace(event,event_date=None)
    with pytest.raises(DisclosureIntegrityError): replace(event,date_role='fact_date')
