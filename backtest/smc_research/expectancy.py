"""Frozen, exploratory net-expectancy ablations; never production execution."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
from backtest.binance_history import validate_study_input_completeness
from backtest.historical_clock import HistoricalClock, HOUR_MS
from backtest.historical_market import HistoricalDataset, HistoricalMarketAdapter
from backtest.replay_engine import HistoricalReplayEngine
from backtest.research_ledger import ResearchLedgerFactory
from foxyya import REAL_ORDER_LOCK
from .rules import analyze
from .study import Arm, ComparisonRunner, summarize

VERSION = 'EXPECTANCY-RESEARCH-1'
VARIANTS = ('control', 'cost_cap', 'choch_veto')


class CostArm(Arm):
    def enter(self, signal, price, time_ms):
        stop = float(signal['stop'])
        distance = abs(price - stop)
        # Fixed base-cost screen in BOTH scenarios. No future funding is read.
        estimate = (price + stop) * (.0005 + .0003) + price * .0001
        if distance > 0 and estimate / distance > .15:
            self.rejections['COST_OVER_015R'] += 1
            return
        super().enter(signal, price, time_ms)


def choch_veto(breaks, side, last_index):
    visible = [b for b in breaks if b['index'] <= last_index]
    return any(b['kind'] == 'CHOCH' and b['side'] != side
               and last_index - 2 <= b['index']
               and not any(x['index'] > b['index'] and x['side'] == side for x in visible)
               for b in visible)


class ExpectancyRunner(ComparisonRunner):
    def __init__(self, ledger):
        self.ledger = ledger
        self.last_close = None
        self.arms = {f'{family}:{variant}:{cost}':
                     (CostArm if variant == 'cost_cap' else Arm)(family, fee=.0005*k, slip=.0003*k)
                     for family in ('B', 'C', 'ABCD') for variant in VARIANTS
                     for cost, k in [('base', 1), ('stress', 2)]}

    def filter_choch(self, snapshot, *, created=None):
        active = [(key, arm) for key, arm in self.arms.items()
                  if ':choch_veto:' in key and arm.intent
                  and (created is None or arm.intent['created'] == created)]
        if not active:
            return
        bars = snapshot['klines']['ETHUSDT']['1h']
        breaks = analyze(bars)['breaks']
        for key, arm in active:
            if choch_veto(breaks, arm.intent['signal']['side'], len(bars)-1):
                arm.intent = None
                arm.rejections['CHOCH_BEFORE_FILL' if created is None else 'FILTER_CHOCH'] += 1

    def scan_if_new_close(self, snapshot, *, now_ms):
        super().scan_if_new_close(snapshot, now_ms=now_ms)
        self.filter_choch(snapshot, created=now_ms)

    def execute_open(self, snapshot, *, open_ms, observed_ms):
        self.filter_choch(snapshot)
        super().execute_open(snapshot, open_ms=open_ms, observed_ms=observed_ms)


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
            runner=ExpectancyRunner(ledger)
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
            print(label,json.dumps(result['arms']['B:cost_cap:base']),flush=True)
        finally: ledger.close()
    report['evidence_status']='EXPLORATORY_REUSED_DATA'
    report['decision']='NO_PROMOTION_FROM_REUSED_DATA'
    report['protocol_sha256']=hashlib.sha256(Path('docs/research/EXPECTANCY_PROTOCOL.md').read_bytes()).hexdigest()
    report['screening']={}
    for segment in report['segments'].values():
        days=(segment['end_ms']-segment['start_ms'])/(24*HOUR_MS)
        for key, metrics in segment['arms'].items():
            family, variant, cost=key.split(':')
            control=segment['arms'][f'{family}:control:{cost}']
            metrics['total_net_r']=(metrics['average_r'] or 0)*metrics['trades']
            metrics['net_r_per_30_days']=metrics['total_net_r']*30/days
            metrics['trade_retention']=metrics['trades']/control['trades'] if control['trades'] else None
            metrics['delta_expectancy_vs_control']=(metrics['expectancy_r']-control['expectancy_r']
                if metrics['expectancy_r'] is not None and control['expectancy_r'] is not None else None)
    for family in ('B','C','ABCD'):
        for variant in VARIANTS[1:]:
            passes=all((s['arms'][f'{family}:{variant}:{cost}']['expectancy_r'] or -1)>0
                       and (s['arms'][f'{family}:{variant}:{cost}']['profit_factor'] or 0)>1
                       for s in report['segments'].values() for cost in ('base','stress'))
            passes=passes and all(report['segments']['test']['arms'][f'{family}:{variant}:{cost}']['trades']>=20
                                  for cost in ('base','stress'))
            report['screening'][f'{family}:{variant}']='PROMISING_FOR_FRESH_VALIDATION' if passes else 'NOT_PASSED'

    (output/'manifest.json').write_text(json.dumps(manifest,indent=2))
    (output/'comparison.json').write_text(json.dumps(report,indent=2,allow_nan=False))
    return report


def main():
    p=argparse.ArgumentParser(); p.add_argument('--input',required=True,type=Path); p.add_argument('--output',required=True,type=Path)
    args=p.parse_args(); payload=json.loads(args.input.read_text())
    sha=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
    run_study(payload,args.output,sha)

if __name__=='__main__': main()
