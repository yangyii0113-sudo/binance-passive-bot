import pytest
from backtest.smc_research.expectancy import CostArm, choch_veto
from backtest.smc_research.study import Arm


def test_cost_cap_blocks_tight_risk_not_wider_risk():
    a=CostArm('B'); a.enter(dict(side='LONG',stop=99.5,trigger=100),100,3600000)
    assert a.position is None and a.rejections['COST_OVER_015R']==1
    a.enter(dict(side='LONG',stop=95,trigger=100),100,7200000)
    assert a.position is not None


def test_cost_filter_eligibility_constant_under_stress_and_short_symmetric():
    for fee,slip in [(0.0005,0.0003),(0.001,0.0006)]:
        a=CostArm('B',fee=fee,slip=slip)
        a.enter(dict(side='SHORT',stop=101.5,trigger=100),100,3600000)
        assert a.position is not None
        b=CostArm('B',fee=fee,slip=slip)
        b.enter(dict(side='SHORT',stop=100.5,trigger=100),100,3600000)
        assert b.position is None


def test_accepted_cost_arm_is_identical_to_control():
    a=CostArm('B'); b=Arm('B')
    for x in (a,b):
        x.enter(dict(side='LONG',stop=95,trigger=100),100,3600000)
        x.bar(dict(open=100,high=112,low=99,close=111,close_ms=7199999),[])
    assert a.trades==b.trades and a.cash==b.cash


def test_choch_is_fresh_opposite_and_supersedable():
    event=dict(index=8,side='SHORT',kind='CHOCH')
    assert choch_veto([event],'LONG',10)
    assert not choch_veto([event],'LONG',11)
    assert not choch_veto([event],'SHORT',10)
    assert not choch_veto([dict(event,kind='BOS')],'LONG',10)
    assert not choch_veto([event,dict(index=9,side='LONG',kind='BOS')],'LONG',10)
    assert not choch_veto([dict(event,index=11)],'LONG',10)
