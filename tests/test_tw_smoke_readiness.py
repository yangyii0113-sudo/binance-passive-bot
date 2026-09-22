from __future__ import annotations

from dataclasses import replace
import json
from pathlib import Path

import pytest

from research.tw.contracts import Availability, Observation
from tools import tw_public_data_smoke as smoke

NAMES = ('twse_quotes','twse_index','twse_institutional','twse_margin',
         'tpex_quotes','tpex_index','tpex_institutional','tpex_margin')


def sources():
    return {name:(Observation(instrument_id=name.split('_')[0]+':MARKET',
                             field='close',value=1,source=name.split('_')[0].upper()+':fixture',
                             observed_at='2026-09-21',availability=Availability.AVAILABLE,
                             metadata={'venue':name.split('_')[0].upper()}),) for name in NAMES}


def checked(data):
    assert callable(getattr(smoke,'require_aligned_sources',None)), 'canonical source-readiness guard missing'
    return smoke.require_aligned_sources(data)


def rejection(data):
    with pytest.raises(RuntimeError) as exc:
        checked(data)
    assert isinstance(getattr(exc.value,'report',None),dict), 'must reject with structured source evidence'
    return exc.value.report


def test_aligned_inputs_continue_without_rewriting_observations():
    rows=sources();before=dict(rows)
    report=checked(rows)
    assert report['status']=='ALIGNED' and report['common_date']=='2026-09-21'
    assert rows==before and not report['execution_allowed']


def test_actual_date_split_reports_all_sources_and_no_common_date():
    rows=sources()
    for name in ('twse_quotes','twse_index','twse_institutional','twse_margin','tpex_margin'):
        rows[name]=(replace(rows[name][0],observed_at='2026-09-18'),)
    report=rejection(rows)
    assert report['status']=='NOT_READY' and report['common_date'] is None
    assert report['sources']['tpex_margin']['dates']==['2026-09-18']
    assert report['sources']['tpex_quotes']['dates']==['2026-09-21']
    assert 'source_dates_not_aligned' in report['issues']
    assert len(report['sources'])==8


def test_a_missing_dataset_cannot_pass_with_seven_matching_dates():
    rows=sources();del rows['tpex_margin']
    report=rejection(rows)
    assert 'missing_dataset' in report['sources']['tpex_margin']['issues']


def test_one_feed_with_mixed_dates_is_not_replaced_by_latest_or_majority():
    rows=sources();original=rows['tpex_quotes'][0]
    rows['tpex_quotes']=(original,original,replace(original,observed_at='2026-09-18'))
    report=rejection(rows)
    assert report['sources']['tpex_quotes']['dates']==['2026-09-18','2026-09-21']
    assert 'mixed_dates' in report['sources']['tpex_quotes']['issues']


@pytest.mark.parametrize('bad_date',[None,'','2026-02-30','20260921','2026-09-21T00:00:00Z'])
def test_invalid_source_dates_are_diagnostic_failures(bad_date):
    rows=sources();rows['twse_index']=(replace(rows['twse_index'][0],observed_at=bad_date),)
    report=rejection(rows)
    assert 'invalid_or_missing_date' in report['sources']['twse_index']['issues']


@pytest.mark.parametrize('change',[
    {'source':None}, {'source':''}, {'source':'TPEX:wrong'},
    {'metadata':{'venue':'TPEX'}}, {'availability':Availability.UNAVAILABLE}, {'value':None},
])
def test_missing_evidence_wrong_venue_and_unusable_feed_fail_closed(change):
    rows=sources();rows['twse_index']=(replace(rows['twse_index'][0],**change),)
    assert rejection(rows)['sources']['twse_index']['issues']


def test_empty_dataset_and_malformed_rows_do_not_disappear():
    rows=sources();rows['twse_index']=()
    assert 'empty_dataset' in rejection(rows)['sources']['twse_index']['issues']
    rows['twse_index']=(None,)
    assert 'noncanonical_record' in rejection(rows)['sources']['twse_index']['issues']


def test_partial_universe_does_not_imply_missing_source_readiness():
    rows=sources();row=rows['twse_quotes'][0]
    rows['twse_quotes']=(row,replace(row,value=None,availability=Availability.UNAVAILABLE))
    assert checked(rows)['status']=='ALIGNED'


def test_readiness_is_independent_of_source_and_record_order():
    rows=sources();row=rows['tpex_quotes'][0]
    rows['tpex_quotes']=(row,replace(row,observed_at='2026-09-18'))
    before=rejection(rows)
    reversed_rows={k:tuple(reversed(v)) for k,v in reversed(tuple(rows.items()))}
    assert rejection(reversed_rows)==before


def test_live_smoke_rejects_real_misaligned_fixture_before_sector_ranking(monkeypatch,capsys):
    fixture=json.loads((Path(__file__).parent/'fixtures/tw/readiness_misaligned.json').read_text())
    class RecordedHttp:
        def __init__(self,**kwargs):pass
        def get_json(self,url):return fixture['responses'][url]
        def get_bytes(self,url):return json.dumps(self.get_json(url),ensure_ascii=False).encode()
    monkeypatch.setattr(smoke,'UrllibJsonTransport',RecordedHttp)
    with pytest.raises(RuntimeError) as exc:
        smoke.main()
    assert isinstance(getattr(exc.value,'report',None),dict), 'must explain source dates before downstream ranking'
    report=exc.value.report
    assert report['sources']['twse_index']['dates']==['2026-09-18']
    assert report['sources']['tpex_index']['dates']==['2026-09-21']
    assert 'OFFICIAL_SOURCE_READINESS' in capsys.readouterr().err


def _canonical(name: str, day: str, source: str | None = None):
    venue=name.split('_',1)[0].upper()
    return (
        Observation(
            instrument_id=venue.lower()+':MARKET',
            field='close',
            value=1,
            source=source or venue+':fixture',
            observed_at=day,
            availability=Availability.AVAILABLE,
            metadata={'venue':venue},
        ),
    )


def test_exact_session_recovery_aligns_lagging_twse_without_rewriting(monkeypatch):
    rows=sources()
    for name in ('tpex_quotes','tpex_index','tpex_institutional','tpex_margin'):
        rows[name]=_canonical(name,'2026-09-22')
    original_twse={name:rows[name] for name in (
        'twse_quotes','twse_index','twse_institutional','twse_margin'
    )}

    class ExactTWSE:
        def __init__(self,transport):pass
        def fetch_quotes(self,day):
            return _canonical('twse_quotes',day,'TWSE:MI_INDEX_RWD')
        def fetch_market(self,day):
            return _canonical('twse_index',day,'TWSE:FMTQIK_RWD')

    class ExactInstitutional:
        def __init__(self,transport):pass
        def fetch(self,day):
            return _canonical('twse_institutional',day,'TWSE:BFI82U')

    class ExactMargin:
        def __init__(self,transport):pass
        def fetch(self,day):
            return _canonical('twse_margin',day,'TWSE:MI_MARGN_RWD')

    monkeypatch.setattr(smoke,'TWSEExactSessionProvider',ExactTWSE)
    monkeypatch.setattr(smoke,'TWSEInstitutionalSummaryProvider',ExactInstitutional)
    monkeypatch.setattr(smoke,'TWSEMarginProvider',ExactMargin)

    recovered,report,method=smoke.align_sources_for_integration(
        rows,transport=object()
    )

    assert report['status']=='ALIGNED'
    assert report['common_date']=='2026-09-22'
    assert method['mode']=='twse_exact_session_recovery'
    assert method['from_date']=='2026-09-21'
    assert method['target_date']=='2026-09-22'
    assert not method['execution_allowed']
    assert all(
        item.observed_at=='2026-09-22'
        for name in ('twse_quotes','twse_index','twse_institutional','twse_margin')
        for item in recovered[name]
    )
    # Input observations remain untouched; alignment is acquisition, not timestamp rewriting.
    assert all(
        item.observed_at=='2026-09-21'
        for name,items in original_twse.items()
        for item in items
    )


def test_failed_exact_session_recovery_preserves_original_not_ready_report(monkeypatch):
    rows=sources()
    for name in ('tpex_quotes','tpex_index','tpex_institutional','tpex_margin'):
        rows[name]=_canonical(name,'2026-09-22')
    original=rejection(rows)

    class BrokenExact:
        def __init__(self,transport):pass
        def fetch_quotes(self,day):
            raise RuntimeError('official exact-session source unavailable')

    monkeypatch.setattr(smoke,'TWSEExactSessionProvider',BrokenExact)
    with pytest.raises(smoke.OfficialSourceReadinessError) as exc:
        smoke.align_sources_for_integration(rows,transport=object())

    assert exc.value.report==original
    assert 'source_dates_not_aligned' in exc.value.report['issues']
