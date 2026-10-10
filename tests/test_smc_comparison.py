import pytest
from backtest.smc_research.study import Arm, summarize


def test_stop_first_and_adverse_gap_with_costs():
    a=Arm('SMC',fee=.0005,slip=.0003)
    a.enter(dict(side='LONG',stop=90,trigger=100),100,3600000)
    a.bar(dict(open=100,high=130,low=80,close=110,close_ms=7199999),[])
    assert a.trades[0]['reason']=='STOP' and a.trades[0]['net_r'] < -1
    a.enter(dict(side='LONG',stop=90,trigger=100),100,7200000)
    a.bar(dict(open=85,high=89,low=80,close=86,close_ms=10799999),[])
    assert a.trades[-1]['exit_fill']<85


def test_preentry_bar_ignored_and_invalid_gap_rejected():
    a=Arm('SMC'); a.enter(dict(side='SHORT',stop=110,trigger=100),100,7200000)
    a.bar(dict(open=100,high=200,low=50,close=100,close_ms=7199999),[])
    assert len(a.trades)==0 and a.position
    b=Arm('SMC'); b.enter(dict(side='LONG',stop=90,trigger=100),89,7200000)
    assert b.position is None


def test_funding_side_and_dedup_and_metrics():
    a=Arm('SMC'); a.enter(dict(side='LONG',stop=90,trigger=100),100,3600000)
    b=dict(open=100,high=101,low=99,close=100,close_ms=7199999)
    funding=[dict(fundingTime=4000000,fundingRate=.001,markPrice=100)]
    a.bar(b,funding); cost=a.position['funding']; a.bar(b,funding)
    assert cost>0 and a.position['funding']==cost
    a.close(100,7199999,'END')
    m=summarize(a)
    assert m['trades']==1 and m['expectancy_r']<0 and m['win_rate']==0
    assert m['profit_factor']==0 and m['max_drawdown_fraction']>0


def test_zero_sample_metrics_are_unknown():
    m=summarize(Arm('SMC'))
    assert m['expectancy_r'] is None and m['win_rate'] is None

def test_next_open_after_persistence_and_no_retroactive_fill(tmp_path):
    from backtest.smc_research.study import ComparisonRunner
    from backtest.research_ledger import ResearchLedgerFactory
    ledger,_=ResearchLedgerFactory(tmp_path).open('timing')
    try:
        r=ComparisonRunner(ledger); a=r.arms['SMC:base']
        a.intent=dict(signal=dict(side='LONG',stop=90,trigger=100),created=3600001,due=7200000)
        r.execute_open(dict(hour_open_prices={'ETHUSDT':100},klines={'ETHUSDT':{'1h':[dict(low=99,high=101,close=100,close_ms=7199999)]}}),open_ms=7200000,observed_ms=7200001)
        assert a.position['entry_ms']==7200000
        b=r.arms['SMC:stress']
        b.intent=dict(signal=dict(side='LONG',stop=90,trigger=100),created=3600001,due=7200000)
        r.execute_open(dict(hour_open_prices={'ETHUSDT':100},klines={'ETHUSDT':{'1h':[dict(low=99,high=101,close=100,close_ms=7199999)]}}),open_ms=10800000,observed_ms=10800001)
        assert b.position is None and b.rejections['EXPIRED']==1
    finally: ledger.close()


def test_engine_comparison_is_deterministic_and_research_only(tmp_path):
    from backtest.historical_clock import HistoricalClock, HOUR_MS
    from backtest.historical_market import HistoricalDataset, HistoricalMarketAdapter
    from backtest.replay_engine import HistoricalReplayEngine
    from backtest.research_ledger import ResearchLedgerFactory
    from backtest.smc_research.study import ComparisonRunner
    from test_eth_one_year_replay import _payload
    payload=_payload(1000*24*HOUR_MS,1,60)
    ds=HistoricalDataset(exchange_info=payload['exchange_info'],rows_by_symbol=payload['rows_by_symbol'],
                         funding_rows_by_symbol=payload['funding_rows_by_symbol'],retrieved_at_ms=1)
    results=[]
    for run in ('one','two'):
        ledger,_=ResearchLedgerFactory(tmp_path).open(run)
        try:
            clock=HistoricalClock(payload['execution_start_ms'],payload['end_ms'])
            market=HistoricalMarketAdapter(ds,clock,primary_symbol='ETHUSDT')
            runner=ComparisonRunner(ledger)
            engine=HistoricalReplayEngine(clock,market,ledger,initial_nav=10000,runner=runner)
            engine.run(start_ms=payload['execution_start_ms'],end_ms=payload['end_ms'],
                       run_id='same',strategy_version='test',git_sha='fixture')
            results.append(ledger.events())
            assert all(not e['kind'].startswith('PAPER_') for e in ledger.events())
            assert all(summarize(a)['trades']==0 for a in runner.arms.values())
        finally: ledger.close()
    assert results[0]==results[1]

def test_opening_gap_exit_excludes_later_funding():
    a=Arm('SMC'); a.enter(dict(side='LONG',stop=90,trigger=100),100,3600000)
    a.bar(dict(open=85,high=89,low=80,close=86,close_ms=10799999),
          [dict(fundingTime=9000000,fundingRate=.01,markPrice=85)])
    assert a.trades[0]['funding']==0
    assert a.trades[0]['exit_ms']==7200000

def test_stop_breached_before_due_open_cancels_even_if_open_recovers(tmp_path):
    from backtest.smc_research.study import ComparisonRunner
    from backtest.research_ledger import ResearchLedgerFactory
    ledger,_=ResearchLedgerFactory(tmp_path).open('invalid')
    try:
        r=ComparisonRunner(ledger); a=r.arms['SMC:base']
        a.intent=dict(signal=dict(side='LONG',stop=90,trigger=100),created=3600001,due=7200000)
        snapshot=dict(hour_open_prices={'ETHUSDT':100},klines={'ETHUSDT':{'1h':[
            dict(open=100,high=105,low=89,close=99,close_ms=7199999)]}})
        r.execute_open(snapshot,open_ms=7200000,observed_ms=7200001)
        assert a.position is None and a.rejections['STRUCTURE_INVALID_BEFORE_FILL']==1
    finally: ledger.close()
