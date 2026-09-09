from __future__ import annotations
from pathlib import Path
from .ledger import EventLedger
from .runner import ForwardRunner
from .portfolio import PortfolioService,replay_books
from .security import audit_source_tree
from .execution import HOUR

def _bars(closes,base_ms,vols=None):
    vols=vols or [100]*len(closes); out=[]; prev=closes[0]
    for i,c in enumerate(closes):
        o=prev; out.append({'open':o,'high':max(o,c)+.2,'low':min(o,c)-.2,'close':c,'volume':vols[i],
                            'close_ms':base_ms+i*HOUR+HOUR-1,'closed':True}); prev=c
    return out

def _trend(close_end,step=.4,n=80):
    arr=_bars([100+i*step for i in range(n)],close_end-n*HOUR+1)
    shift=close_end-arr[-1]['close_ms']
    for b in arr:b['close_ms']+=shift
    return arr

def _snapshot(close_end,symbol='AAAUSDT'):
    h1=_bars([100,101,102,103,104,104.2,104.4,105.4],close_end-8*HOUR+1,[100,100,100,100,100,90,95,160])
    shift=close_end-h1[-1]['close_ms']
    for b in h1:b['close_ms']+=shift
    return {'exchange_info':{'symbols':[{'symbol':symbol,'status':'TRADING','contractType':'PERPETUAL','quoteAsset':'USDT','baseAsset':'AAA','onboardDate':0}]},
            'tickers':{symbol:{'symbol':symbol,'quoteVolume':'100000000','priceChangePercent':'12','closeTime':close_end}},
            'klines':{symbol:{'1d':_trend(close_end,.4),'4h':_trend(close_end,.25),'1h':h1}},'steps':{symbol:.01},
            'marks':{symbol:105.4},'hour_open_prices':{symbol:105.45},'major_returns':{'BTC':.03,'ETH':.04,'SOL':.03},
            'breadth':.7,'volatility':'NORMAL','benchmark_return_24h':.03}

def run_acceptance(directory):
    directory=Path(directory); directory.mkdir(parents=True,exist_ok=True); db=directory/'acceptance.sqlite'
    # Acceptance is a deterministic disposable fixture, not a live paper ledger.
    # Remove prior fixture files so a release verification rerun cannot inherit
    # intents/fills from an earlier acceptance execution.
    for suffix in ('', '-wal', '-shm'):
        artifact=Path(str(db)+suffix)
        if artifact.exists():
            artifact.unlink()
    ledger=EventLedger(db); runner=ForwardRunner(ledger,initial_nav=1000)
    qualified=fills=exits=0
    for c in range(24):
        close=(c+1)*HOUR-1; snap=_snapshot(close)
        result=runner.scan(snap,now_ms=(c+1)*HOUR+5000); qualified+=result['funnel']['qualified']
        scheduled=(c+2)*HOUR
        runner.revalidate(snap,now_ms=scheduled-2000)
        got=runner.execute_open(snap,open_ms=scheduled,observed_ms=scheduled+1000)
        entries=[x for x in got if x.get('kind')=='PAPER_ENTRY']; fills+=len(entries)
        for entry in entries:
            svc=PortfolioService(ledger,runner.risk_book,initial_nav=1000)
            svc.exit(f'acc-exit-{c}',entry['position_id'],scheduled+3000,105.55,'ACCEPTANCE_CYCLE_CLOSE'); exits+=1
    events=ledger.events(); ledger_hash_ok=ledger.verify()
    intents={e['intent_id']:e for e in events if e.get('kind')=='INTENT_CREATED'}
    entries=[e for e in events if e.get('kind')=='PAPER_ENTRY']
    backfill=sum(e['fill_ms']<=intents[e['intent_id']]['decision_persist_ms'] for e in entries)
    duplicate=len(entries)-len({e['intent_id'] for e in entries})
    qualified_ids={e['signal_id'] for e in events if e.get('kind')=='SIGNAL_QUALIFIED'}
    terminal_signals={e.get('signal_id') for e in events if e.get('kind') in ('PAPER_ENTRY','INTENT_CANCELLED')}
    state=replay_books(ledger,1000); navs=[round(state['books'][k]['equity'],10) for k in ('5x','8x','10x')]
    source_root=Path(__file__).resolve().parent
    safe=audit_source_tree(source_root)['safe']
    result={'cycles':24,'qualified':qualified,'fills':fills,'exits':exits,'backfill_violations':backfill,'duplicate_fills':duplicate,
            'ledger_hash_ok':ledger_hash_ok,'all_qualified_terminal':qualified_ids<=terminal_signals,'book_navs_equal':len(set(navs))==1,
            'book_navs':navs,'event_count':len(events),'real_order_lock_safe':safe,'db_path':str(db)}
    ledger.close(); return result
