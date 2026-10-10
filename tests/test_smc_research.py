import pytest
from backtest.smc_research.rules import analyze, evaluate

def bars(values):
    return [dict(open=o, high=h, low=l, close=c, volume=100, close_ms=(i+1)*3600000-1, closed=True) for i,(o,h,l,c) in enumerate(values)]

def fixture():
    return bars([(10,11,9,10),(10,12,9,11),(11,15,10,12),(12,13,10,11),(11,12,9,10),
                 (10,11,7,9),(9,12,8,11),(11,13,9,12),(12,13,6,11),(11,12,8,9),
                 (9,18,9,17),(17,19,14,18),(14,16,11,15)])

def test_confirmed_pivots_only_and_no_repainting():
    b=fixture()
    assert not any(p['index']==2 for p in analyze(b[:4])['pivots'])
    assert any(p['index']==2 and p['confirmed']==4 for p in analyze(b[:5])['pivots'])
    whole=analyze(b)
    for n in range(5,len(b)):
        for key in ('breaks','sweeps','gaps'):
            assert analyze(b[:n])[key]==[e for e in whole[key] if e['index']<n]

def test_sweep_break_fvg_ob_and_retest_signal():
    b=fixture(); a=analyze(b)
    assert any(e['side']=='LONG' and e['index']==8 for e in a['sweeps'])
    assert any(e['side']=='LONG' and e['index']==10 for e in a['breaks'])
    d=evaluate(b,'LONG')
    assert d['qualified'] and d['stop']<6 and d['trigger']==15
    assert not evaluate(b[:-1],'LONG')['qualified']

def test_mirrored_short_signal():
    b=fixture(); mirror=[dict(x,open=30-x['open'],high=30-x['low'],low=30-x['high'],close=30-x['close']) for x in b]
    d=evaluate(mirror,'SHORT')
    assert d['qualified'] and d['stop']>24

def test_invalid_and_unclosed_data_fail_closed():
    b=fixture(); b[-1]['closed']=False
    with pytest.raises(ValueError): analyze(b)
    b=fixture(); b[-1]['close_ms']=b[-2]['close_ms']
    with pytest.raises(ValueError): analyze(b)

def test_choch_requires_prior_opposite_break():
    b=fixture()+bars([])
    b += [dict(b[-1],open=15,high=16,low=4,close=5,close_ms=14*3600000-1)]
    assert analyze(b)['breaks'][-1]['kind']=='CHOCH'

def test_fvg_is_strict_and_order_block_is_last_opposite():
    a=analyze(fixture())
    assert a['gaps'][-1]['low']==12 and a['gaps'][-1]['high']==14
    assert a['blocks'][-1]['origin']==9
    b=fixture(); b[11]['low']=12
    assert not any(x['index']==11 for x in analyze(b)['gaps'])

def test_retest_cannot_be_reused_and_stale_setup_expires():
    b=fixture()
    b.append(dict(b[-1],close_ms=14*3600000-1))
    assert not evaluate(b,'LONG')['qualified']
    for i in range(14,21):
        b.append(dict(b[-1],close_ms=(i+1)*3600000-1))
    assert not evaluate(b,'LONG')['qualified']
