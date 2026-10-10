import importlib.util
import pytest


def arm(**kw):
    assert importlib.util.find_spec('backtest.smc_research.exit_study'), 'exit study missing'
    from backtest.smc_research.exit_study import CloseArm
    a=CloseArm('B', fee=0, slip=0, **kw)
    a.enter(dict(side='LONG',stop=90,trigger=100),100,0)
    return a


def bar(a,close,t,atr=2,funding=()):
    a.observe(dict(open=close,high=close+30,low=close-30,close=close,close_ms=t),funding,atr)


def test_partial_aggregates_one_trade_and_retains_original_risk():
    a=arm(policy='close_partial');q=a.position['qty']
    bar(a,115,3599999)
    assert a.position['qty']==q/2
    assert a.position['stop']==112
    assert a.trades==[]
    bar(a,111,7199999)
    t=a.trades[0]
    assert t['net_r']==pytest.approx(1.3)
    assert a.cash==pytest.approx(10000+q*13)
    assert len(t['legs'])==2
    assert t['mfe_r']==pytest.approx(1.5)
    assert t['giveback_net_r']==pytest.approx(.2)


def test_stop_precedes_timeout_and_high_low_do_not_trigger_close_policy():
    a=arm(policy='close_partial')
    bar(a,101,3599999)
    assert a.position is not None
    bar(a,89,120*3600000)
    assert a.trades[0]['reason']=='STRUCTURE_STOP'
    assert len(a.trades[0]['legs'])==1


def test_timeout_precedes_partial():
    a=arm(policy='close_partial');bar(a,120,120*3600000)
    assert a.trades[0]['reason']=='MAX_HOLD_5D'
    assert len(a.trades[0]['legs'])==1


def test_funding_after_partial_uses_remaining_qty_and_is_not_repeated():
    a=arm(policy='close_partial');q=a.position['qty']
    bar(a,115,3599999)
    rec=[dict(fundingTime=3600000,fundingRate=.01,markPrice=114)]
    bar(a,114,7199999,funding=rec)
    bar(a,111,10799999,funding=rec)
    assert a.trades[0]['funding']==pytest.approx(q/2*114*.01)
    assert a.cash==pytest.approx(10000+a.trades[0]['net_pnl'])


def test_short_trail_tightens_only_and_tp_not_repeated():
    a=arm(policy='close_partial');a.position=None;a.cash=10000
    a.enter(dict(side='SHORT',stop=110,trigger=100),100,0)
    q=a.position['qty'];bar(a,85,3599999)
    assert a.position['stop']==88
    bar(a,86,7199999,atr=5)
    assert a.position['stop']==88 and a.position['qty']==q/2
    bar(a,89,10799999)
    assert a.trades[0]['net_r']==pytest.approx(1.3)


def test_close_2r_fills_observed_price_and_cost_screen_blocks_tight_stop():
    a=arm(policy='close_2r');bar(a,125,3599999)
    assert a.trades[0]['net_r']==pytest.approx(2.5)
    b=arm(policy='close_partial',cost_cap=True)
    b.position=None
    b.enter(dict(side='LONG',stop=99.5,trigger=100),100,0)
    assert b.position is None
