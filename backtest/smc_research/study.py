"""Matched-execution setup comparison driven by HistoricalReplayEngine.

Not an exact reproduction of ForwardRunner exits, sizing, or portfolio routing.
All arms trade ETH only; BTC/SOL supply context. No production imports are mutated.
"""
from __future__ import annotations
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import subprocess
from math import floor, isfinite
from backtest.binance_history import validate_study_input_completeness
from backtest.historical_clock import HistoricalClock, HOUR_MS
from backtest.historical_market import HistoricalDataset, HistoricalMarketAdapter
from backtest.replay_engine import HistoricalReplayEngine
from backtest.research_ledger import ResearchLedgerFactory
from foxyya.features import compute_features
from foxyya.router import classify_regime, rank_candidates
from foxyya.universe import build_universe
from foxyya import setups, REAL_ORDER_LOCK
from .rules import analyze, evaluate, VERSION

FAMILIES=('A','B','C','D','ABCD','SMC')


class Arm:
    def __init__(self, family, *, fee=.0005, slip=.0003):
        self.family=family; self.fee=fee; self.slip=slip
        self.cash=10000.; self.position=None; self.trades=[]; self.intent=None
        self.peak=self.cash; self.drawdown=0.; self.candidates=0; self.qualified=0
        self.rejections=Counter(); self.used=set(); self.fills=0

    def mark(self, price):
        p=self.position
        equity=self.cash if p is None else self.cash+p['sign']*(price-p['entry_fill'])*p['qty']
        self.peak=max(self.peak,equity)
        self.drawdown=max(self.drawdown,(self.peak-equity)/self.peak)

    def enter(self, signal, price, time_ms):
        sign=1 if signal['side']=='LONG' else -1
        stop=float(signal['stop']); ref=float(signal['trigger'])
        distance=sign*(price-stop); reference_risk=sign*(ref-stop)
        if (not all(isfinite(v) and v>0 for v in (price,stop,ref)) or distance<=0
                or reference_risk<=0 or abs(price-ref)>.5*reference_risk):
            self.rejections['GAP_OR_STOP_INVALID']+=1; return
        entry=price*(1+sign*self.slip); unit_r=sign*(entry-stop)
        if unit_r<=0 or self.cash<=0: return
        budget=self.cash*.005
        qty=floor(min(budget/unit_r,5*self.cash/entry)*1000)/1000
        if qty<=0 or qty*entry<5:
            self.rejections['MIN_SIZE']+=1; return
        entry_fee=qty*entry*self.fee
        self.cash-=entry_fee
        self.position=dict(side=signal['side'],sign=sign,entry_fill=entry,stop=stop,
                           target=entry+sign*2*unit_r,qty=qty,risk=qty*unit_r,
                           entry_ms=time_ms,entry_fee=entry_fee,funding=0.,funding_seen=set(),
                           last_bar=-1)
        self.fills+=1; self.mark(price)

    def close(self, price, time_ms, reason):
        p=self.position
        fill=price*(1-p['sign']*self.slip); exit_fee=fill*p['qty']*self.fee
        gross=p['sign']*(fill-p['entry_fill'])*p['qty']
        net=gross-p['entry_fee']-exit_fee-p['funding']
        self.cash+=gross-exit_fee
        self.trades.append(dict(side=p['side'],entry_ms=p['entry_ms'],exit_ms=time_ms,
                                entry_fill=p['entry_fill'],exit_fill=fill,reason=reason,
                                net_pnl=net,net_r=net/p['risk'],funding=p['funding']))
        self.position=None; self.mark(price)

    def bar(self, b, funding):
        p=self.position
        if p is None or int(b['close_ms'])<p['entry_ms'] or int(b['close_ms'])<=p['last_bar']: return
        p['last_bar']=int(b['close_ms'])
        o,h,l,c=(float(b[k]) for k in ('open','high','low','close'))
        s=p['sign']; stop=p['stop']; target=p['target']
        # Opening gaps are known first; otherwise pessimistic stop priority.
        if s*(o-stop)<=0: price,reason=o,'STOP_GAP'
        elif s*(o-target)>=0: price,reason=target,'TARGET_GAP_CAPPED'
        elif (l<=stop if s==1 else h>=stop): price,reason=stop,'STOP'
        elif (h>=target if s==1 else l<=target): price,reason=target,'TARGET_2R'
        elif int(b['close_ms'])-p['entry_ms']>=120*HOUR_MS-1: price,reason=c,'TIME_120H'
        else: price,reason=c,None
        exit_ms=(int(b['close_ms'])-HOUR_MS+1 if reason in ('STOP_GAP','TARGET_GAP_CAPPED') else int(b['close_ms']))
        for rec in funding:
            t=int(rec['fundingTime'])
            if p['entry_ms']<=t<=exit_ms and t not in p['funding_seen']:
                mark=float(rec.get('markPrice') or b['open'])
                cost=p['sign']*float(rec['fundingRate'])*mark*p['qty']
                p['funding']+=cost; self.cash-=cost; p['funding_seen'].add(t)
        if reason is None: self.mark(c); return
        self.close(price,exit_ms,reason)


def summarize(a):
    rs=[x['net_r'] for x in a.trades]; pnls=[x['net_pnl'] for x in a.trades]
    n=len(rs); loss=-sum(v for v in pnls if v<0)
    return dict(trades=n,filled=a.fills,candidates=a.candidates,qualified=a.qualified,
                signal_pass_rate=a.qualified/a.candidates if a.candidates else None,
                win_rate=sum(v>0 for v in rs)/n if n else None,
                average_r=sum(rs)/n if n else None,expectancy_r=sum(rs)/n if n else None,
                profit_factor=sum(v for v in pnls if v>0)/loss if loss else None,
                max_drawdown_fraction=a.drawdown,net_pnl=sum(pnls),ending_nav=a.cash,
                rejections=dict(a.rejections),sample_status='INSUFFICIENT' if n<100 else 'REQUIRES_ROBUSTNESS_REVIEW')


class ComparisonRunner:
    def __init__(self, ledger):
        self.ledger=ledger; self.arms={f'{f}:{c}':Arm(f,fee=.0005*k,slip=.0003*k)
                                      for f in FAMILIES for c,k in [('base',1),('stress',2)]}
        self.last_close=None

    def record(self,kind,now_ms,**payload):
        self.ledger.append(dict(event_id=f'{kind}:{now_ms}',kind='SMC_RESEARCH_'+kind,
                                time_ms=now_ms,paper_only=True,real_orders=False,**payload))

    def pending(self): return [a.intent for a in self.arms.values() if a.intent]
    def revalidate(self,snapshot,*,now_ms): pass  # next-open hard checks in Arm.enter
    def apply_funding(self,snapshot,*,now_ms): pass  # evaluated on held closed bars only

    def execute_open(self,snapshot,*,open_ms,observed_ms):
        for a in self.arms.values():
            intent=a.intent
            if intent is None: continue
            a.intent=None
            if open_ms!=intent['due'] or observed_ms<=intent['created']:
                a.rejections['EXPIRED']+=1; continue
            signal=intent['signal']; side=signal['side']; sign=1 if side=='LONG' else -1
            bars=snapshot.get('klines',{}).get('ETHUSDT',{}).get('1h',[])
            if not bars or int(bars[-1]['close_ms'])!=open_ms-1:
                a.rejections['DATA_STALE_BEFORE_FILL']+=1; continue
            last=bars[-1]
            invalid=(float(last['low'])<=signal['stop'] if side=='LONG' else float(last['high'])>=signal['stop'])
            if a.family=='SMC' and 'invalidation_close' in signal:
                invalid=invalid or sign*(float(last['close'])-signal['invalidation_close'])<0
                invalid=invalid or any(x['index']==len(bars)-1 and x['side']!=side for x in analyze(bars)['breaks'])
            if invalid:
                a.rejections['STRUCTURE_INVALID_BEFORE_FILL']+=1; continue
            if not a.position and 'ETHUSDT' in snapshot['hour_open_prices']:
                a.enter(signal,float(snapshot['hour_open_prices']['ETHUSDT']),open_ms)

    def manage_positions(self,snapshot,*,now_ms):
        bars=snapshot['klines']['ETHUSDT']['1h']
        if not bars: return
        for a in self.arms.values(): a.bar(bars[-1],snapshot['realized_funding']['ETHUSDT'])

    def scan_if_new_close(self,snapshot,*,now_ms):
        d=snapshot['klines']['ETHUSDT']; b=d['1h']
        if not b or b[-1]['close_ms']==self.last_close: return
        self.last_close=b[-1]['close_ms']
        uni=build_universe(snapshot['exchange_info'],snapshot['tickers'],now_ms=now_ms,
                           min_history_days=60,min_quote_volume=5000000)
        if 'ETHUSDT' not in uni['eligible'] or not all(len(d[x])>=50 for x in ('1d','4h','1h')): return
        t=snapshot['tickers']['ETHUSDT']
        f=compute_features('ETHUSDT',d['1d'],d['4h'],b,quote_volume_24h=float(t['quoteVolume']),
                           return_24h=float(t['priceChangePercent'])/100,
                           benchmark_return_24h=snapshot['benchmark_return_24h'])
        regime=classify_regime(snapshot['major_returns'],breadth=snapshot['breadth'],volatility='NORMAL')
        ranks=rank_candidates([f],regime)
        audit={}
        for side,key in [('LONG','long'),('SHORT','short')]:
            if not ranks[key]: continue
            decisions={}
            for fam in FAMILIES:
                if fam=='SMC': dec=evaluate(b,side)
                else:
                    fn=setups.evaluate_candidate if fam=='ABCD' else getattr(setups,'evaluate_'+fam)
                    obj=fn(f,side,regime,1)
                    dec=dict(qualified=obj.qualified,reason=obj.reason,side=side,stop=obj.stop,
                             trigger=float(b[-1]['close']),setup_id=obj.signal_id)
                decisions[fam]=dec
            audit[side]=decisions
            for a in self.arms.values():
                dec=decisions[a.family]; a.candidates+=1
                if not dec['qualified']:
                    a.rejections[dec['reason']]+=1; continue
                a.qualified+=1
                identity=dec['setup_id']
                if identity in a.used: a.rejections['DUPLICATE']+=1; continue
                if a.position or a.intent: a.rejections['OCCUPIED']+=1; continue
                a.used.add(identity)
                a.intent=dict(signal=dec,created=now_ms,due=(now_ms//HOUR_MS+1)*HOUR_MS)
        self.record('SCAN',now_ms,decisions=audit)


def run_study(payload,output:Path,git_sha):
    if REAL_ORDER_LOCK is not True: raise RuntimeError('REAL_ORDER_LOCK required')
    validate_study_input_completeness(payload)
    dataset=HistoricalDataset(exchange_info=payload['exchange_info'],rows_by_symbol=payload['rows_by_symbol'],
                              funding_rows_by_symbol=payload['funding_rows_by_symbol'],
                              retrieved_at_ms=payload['retrieved_at_ms'],source_family=payload['source_family'])
    manifest=dataset.manifest(); digest=hashlib.sha256(json.dumps(manifest,sort_keys=True).encode()).hexdigest()
    start=int(payload['execution_start_ms']); end=int(payload['end_ms']); hours=(end-start)//HOUR_MS
    if hours<30*24: raise ValueError('at least 30 days required for chronological split')
    cuts=[start,start+int(hours*.6)*HOUR_MS,start+int(hours*.8)*HOUR_MS,end]
    output.mkdir(parents=True,exist_ok=False)
    code_sha256=hashlib.sha256(b''.join(p.read_bytes() for p in sorted(Path(__file__).parent.glob('*.py')))).hexdigest()
    report=dict(code_sha256=code_sha256,mode='HISTORICAL BACKTEST',label='歷史模擬・非 Forward Performance',paper_only=True,
                real_order_lock=True,no_backfill=True,git_sha=git_sha,version=VERSION,
                manifest_sha256=digest,source=payload.get('retrieval_mode'),segments={},
                comparison='SETUP_ONLY_MATCHED_EXECUTION_NOT_PRODUCTION_PORTFOLIO',
                costs=dict(base_fee_per_side=.0005,base_slippage_per_side=.0003,stress_multiplier=2,
                           funding='observed funding; missing markPrice uses held candle open proxy'),
                execution=dict(symbol='ETHUSDT',risk_fraction=.005,max_notional_nav=5,target_r=2,
                               max_hold_hours=120,signal_to_fill='next hour after persisted decision',
                               stop_target_tie='stop first except known opening gap',
                               funding_exit_order='all settlements in exit candle included',
                               drawdown='closed hourly mark-to-market; not intrabar maximum'))
    for label,lo,hi in zip(('train','validation','test'),cuts,cuts[1:]):
        clock=HistoricalClock(lo,hi); market=HistoricalMarketAdapter(dataset,clock,primary_symbol='ETHUSDT')
        ledger,path=ResearchLedgerFactory(output).open(label)
        try:
            runner=ComparisonRunner(ledger)
            engine=HistoricalReplayEngine(clock,market,ledger,initial_nav=10000,runner=runner)
            engine.run(start_ms=lo,end_ms=hi,run_id=label,strategy_version=VERSION,git_sha=git_sha)
            clock.advance_to(hi-1); snapshot=market.snapshot()
            runner.manage_positions(snapshot,now_ms=hi-1)
            last=float(snapshot['klines']['ETHUSDT']['1h'][-1]['close'])
            for a in runner.arms.values():
                if a.position: a.close(last,hi-1,'SEGMENT_END')
                a.intent=None
            result=dict(start_ms=lo,end_ms=hi,arms={k:summarize(a) for k,a in runner.arms.items()})
            runner.record('RESULT',hi-1,result=result,trade_sha256=hashlib.sha256(json.dumps({k:a.trades for k,a in runner.arms.items()},sort_keys=True).encode()).hexdigest())
            report['segments'][label]=result
            (output/f'{label}-trades.json').write_text(json.dumps({k:a.trades for k,a in runner.arms.items()},indent=2))
            assert ledger.verify()
            print(label,json.dumps(result['arms']['SMC:base']),flush=True)
        finally: ledger.close()
    report['decision']='HOLD_FOR_RESEARCH_REVIEW'
    (output/'manifest.json').write_text(json.dumps(manifest,indent=2))
    (output/'comparison.json').write_text(json.dumps(report,indent=2,allow_nan=False))
    return report


def main():
    p=argparse.ArgumentParser(); p.add_argument('--input',required=True,type=Path); p.add_argument('--output',required=True,type=Path)
    args=p.parse_args(); payload=json.loads(args.input.read_text())
    sha=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
    run_study(payload,args.output,sha)

if __name__=='__main__': main()
