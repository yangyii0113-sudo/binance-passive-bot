"""Hourly observed-close exit ablation, NOT a live execution reconstruction."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
from collections import Counter
from backtest.binance_history import validate_study_input_completeness
from backtest.historical_clock import HistoricalClock, HOUR_MS
from backtest.historical_market import HistoricalDataset, HistoricalMarketAdapter
from backtest.replay_engine import HistoricalReplayEngine
from backtest.research_ledger import ResearchLedgerFactory
from foxyya import REAL_ORDER_LOCK
from foxyya.features import atr
from .study import Arm, ComparisonRunner, summarize
from .expectancy import CostArm

VERSION = 'EXIT-RESEARCH-1'


class CloseArm(CostArm):
    def __init__(self, family, *, policy, cost_cap=False, **kwargs):
        super().__init__(family, **kwargs)
        if policy not in ('close_2r', 'close_partial'):
            raise ValueError('unknown exit policy')
        self.policy = policy
        self.cost_cap = cost_cap

    def enter(self, signal, price, time_ms):
        if self.cost_cap:
            CostArm.enter(self, signal, price, time_ms)
        else:
            Arm.enter(self, signal, price, time_ms)
        if self.position:
            self.position.update(initial_qty=self.position['qty'], unit_r=abs(self.position['entry_fill']-self.position['stop']),
                                 gross=0., exit_fees=0., legs=[], tp1=False, mfe=0., mae=0., peak_net_r=0.)
            self.position['peak_net_r']=self.liquidation_r(price)

    def liquidation_r(self, price):
        p=self.position
        fill=price*(1-p['sign']*self.slip)
        net=(p['gross']+p['sign']*(fill-p['entry_fill'])*p['qty']-p['entry_fee']
             -p['exit_fees']-fill*p['qty']*self.fee-p['funding'])
        return net/p['risk']

    def leg(self, price, time_ms, fraction, reason):
        p=self.position; qty=p['qty']*fraction
        fill=price*(1-p['sign']*self.slip)
        gross=p['sign']*(fill-p['entry_fill'])*qty; fee=fill*qty*self.fee
        p['gross']+=gross; p['exit_fees']+=fee; p['qty']-=qty
        self.cash+=gross-fee
        p['legs'].append(dict(time_ms=time_ms,qty=qty,fill=fill,gross=gross,fee=fee,reason=reason))

    def close(self, price, time_ms, reason):
        p=self.position
        p['peak_net_r']=max(p['peak_net_r'],self.liquidation_r(price))
        self.leg(price,time_ms,1.,reason)
        net=p['gross']-p['entry_fee']-p['exit_fees']-p['funding']
        self.trades.append(dict(side=p['side'],entry_ms=p['entry_ms'],exit_ms=time_ms,
                                entry_fill=p['entry_fill'],exit_fill=p['legs'][-1]['fill'],reason=reason,
                                initial_qty=p['initial_qty'],initial_risk=p['risk'],net_pnl=net,net_r=net/p['risk'],
                                funding=p['funding'],gross_pnl=p['gross'],fees=p['entry_fee']+p['exit_fees'],
                                legs=p['legs'],mfe_r=p['mfe'],mae_r=p['mae'],peak_liquidation_net_r=p['peak_net_r'],
                                giveback_net_r=p['peak_net_r']-net/p['risk']))
        self.position=None; self.mark(price)

    def observe(self, b, funding, atr_value):
        p=self.position; t=int(b['close_ms'])
        if p is None or t<p['entry_ms'] or t<=p['last_bar']:
            return
        p['last_bar']=t; price=float(b['close'])
        for rec in funding:
            ft=int(rec['fundingTime'])
            if p['entry_ms']<=ft<=t and ft not in p['funding_seen']:
                charge=p['sign']*float(rec['fundingRate'])*float(rec.get('markPrice') or b['open'])*p['qty']
                p['funding']+=charge; self.cash-=charge; p['funding_seen'].add(ft)
        favorable=p['sign']*(price-p['entry_fill'])/p['unit_r']
        p['mfe']=max(p['mfe'],favorable); p['mae']=max(p['mae'],-favorable)
        p['peak_net_r']=max(p['peak_net_r'],self.liquidation_r(price))
        if p['sign']*(price-p['stop'])<=0:
            self.close(price,t,'STRUCTURE_STOP'); return
        if t-p['entry_ms']>=120*HOUR_MS:
            self.close(price,t,'MAX_HOLD_5D'); return
        self.mark(price)
        if self.policy=='close_2r':
            if favorable>=2: self.close(price,t,'TARGET_2R_OBSERVED')
            return
        if not p['tp1'] and favorable>=1.5:
            self.leg(price,t,.5,'TP1'); p['tp1']=True
        if p['tp1'] and atr_value>0:
            proposed=price-p['sign']*1.5*atr_value
            if p['sign']*(proposed-p['stop'])>0: p['stop']=proposed
        self.mark(price)


class ExitRunner(ComparisonRunner):
    def __init__(self, ledger):
        self.ledger=ledger; self.last_close=None; self.arms={}
        for family in ('B','C','ABCD'):
            for screened in (False,True):
                for cost,k in (('base',1),('stress',2)):
                    for policy in ('ohlc_2r','close_2r','close_partial'):
                        kw=dict(fee=.0005*k,slip=.0003*k)
                        a=((CostArm if screened else Arm)(family,**kw) if policy=='ohlc_2r' else
                           CloseArm(family,policy=policy,cost_cap=screened,**kw))
                        self.arms[f'{family}:{"cost_cap" if screened else "control"}:{cost}:{policy}']=a

    def manage_positions(self,snapshot,*,now_ms):
        bars=snapshot['klines']['ETHUSDT']['1h']
        if not bars:return
        value=atr(bars,14); funding=snapshot['realized_funding']['ETHUSDT']
        for a in self.arms.values():
            if isinstance(a,CloseArm): a.observe(bars[-1],funding,value)
            else: a.bar(bars[-1],funding)


def metrics(a):
    m=summarize(a)
    m['total_net_r']=sum(t['net_r'] for t in a.trades)
    m['exit_reasons']=dict(Counter(t['reason'] for t in a.trades))
    for k in ('mfe_r','mae_r','giveback_net_r'):
        values=[t[k] for t in a.trades if k in t]
        m['mean_'+k]=sum(values)/len(values) if values else None
    return m


def run_study(payload,output,git_sha):
    if REAL_ORDER_LOCK is not True:raise RuntimeError('REAL_ORDER_LOCK required')
    validate_study_input_completeness(payload)
    dataset=HistoricalDataset(exchange_info=payload['exchange_info'],rows_by_symbol=payload['rows_by_symbol'],
        funding_rows_by_symbol=payload['funding_rows_by_symbol'],retrieved_at_ms=payload['retrieved_at_ms'],source_family=payload['source_family'])
    start=int(payload['execution_start_ms']); end=int(payload['end_ms']); hours=(end-start)//HOUR_MS
    if hours<720:raise ValueError('at least 30 days required')
    cuts=[start,start+int(hours*.6)*HOUR_MS,start+int(hours*.8)*HOUR_MS,end]
    output.mkdir(parents=True,exist_ok=False)
    report=dict(version=VERSION,git_sha=git_sha,evidence_status='EXPLORATORY_REUSED_DATA',
                mode='HISTORICAL BACKTEST',paper_only=True,real_order_lock=True,no_backfill=True,
                decision='NO_PROMOTION',segments={},
                protocol_sha256=hashlib.sha256(Path('docs/research/EXIT_PROTOCOL.md').read_bytes()).hexdigest(),
                code_sha256=hashlib.sha256(b''.join(p.read_bytes() for p in sorted(Path(__file__).parent.glob('*.py')))).hexdigest())
    for name,lo,hi in zip(('train','validation','test'),cuts,cuts[1:]):
        clock=HistoricalClock(lo,hi); market=HistoricalMarketAdapter(dataset,clock,primary_symbol='ETHUSDT')
        ledger,_=ResearchLedgerFactory(output).open(name)
        try:
            runner=ExitRunner(ledger)
            HistoricalReplayEngine(clock,market,ledger,initial_nav=10000,runner=runner).run(
                start_ms=lo,end_ms=hi,run_id=name,strategy_version=VERSION,git_sha=git_sha)
            clock.advance_to(hi-1); snapshot=market.snapshot();runner.manage_positions(snapshot,now_ms=hi-1)
            for a in runner.arms.values():
                if a.position:a.close(float(snapshot['klines']['ETHUSDT']['1h'][-1]['close']),hi-1,'SEGMENT_END')
                a.intent=None
            trades={k:a.trades for k,a in runner.arms.items()}
            result=dict(start_ms=lo,end_ms=hi,arms={k:metrics(a) for k,a in runner.arms.items()})
            runner.record('RESULT',hi-1,result=result,trade_sha256=hashlib.sha256(json.dumps(trades,sort_keys=True).encode()).hexdigest())
            assert ledger.verify()
            report['segments'][name]=result
            (output/f'{name}-trades.json').write_text(json.dumps(trades,indent=2))
            print(name,'completed',flush=True)
        finally:ledger.close()
    (output/'manifest.json').write_text(json.dumps(dataset.manifest(),indent=2))
    (output/'comparison.json').write_text(json.dumps(report,indent=2,allow_nan=False))
    return report


def main():
    p=argparse.ArgumentParser();p.add_argument('--input',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    args=p.parse_args()
    run_study(json.loads(args.input.read_text()),args.output,subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip())

if __name__=='__main__':main()
