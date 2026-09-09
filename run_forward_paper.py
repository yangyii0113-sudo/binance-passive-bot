#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, time
from pathlib import Path
from foxyya.ledger import EventLedger
from foxyya.market import PublicBinanceClient
from foxyya.live import PublicSnapshotBuilder
from foxyya.runner import ForwardRunner
from foxyya.acceptance import run_acceptance
from foxyya.security import audit_source_tree
from foxyya.portfolio import replay_books
from foxyya.execution import HOUR
from foxyya.config import load_runtime_config

def cycle(ledger,runner,builder,now_ms):
    state=replay_books(ledger,runner.initial_nav)['books']['5x']
    funding_symbols=sorted({p['symbol'] for p in state['positions'].values()})
    snap=builder.build(now_ms=now_ms,funding_symbols=funding_symbols)
    open_ms=(now_ms//HOUR)*HOUR
    fills=runner.execute_open(snap,open_ms=open_ms,observed_ms=now_ms) if now_ms-open_ms<=5*60_000 else []
    funding=runner.apply_funding(snap,now_ms=now_ms)
    managed=runner.manage_positions(snap,now_ms=now_ms)
    revalidated=runner.revalidate(snap,now_ms=now_ms)
    scanned=runner.scan_if_new_close(snap,now_ms=now_ms)
    return {'time_ms':now_ms,'universe':snap.get('eligible_universe_count'),'fills':[x.get('kind') for x in fills],
            'funding':[x.get('kind') for x in funding],'managed':[x.get('kind') for x in managed],'revalidated':len(revalidated),
            'scan':scanned['funnel'] if scanned else None,'diagnostics':runner.diagnostics(now_ms)}

def main():
    ap=argparse.ArgumentParser(description='FOXYYA Execution V2 - public-data forward paper only')
    ap.add_argument('command',choices=['cycle','loop','status','acceptance','security'])
    ap.add_argument('--db',default='foxyya_v2_paper.sqlite'); ap.add_argument('--config',default='FOXYYA_V2_CONFIG.json')
    ap.add_argument('--initial-nav',type=float,default=None)
    ap.add_argument('--interval',type=int,default=30,help='loop seconds; public-data paper runner only')
    args=ap.parse_args()
    if args.command=='acceptance': print(json.dumps(run_acceptance(Path('reports/acceptance_run')),indent=2)); return
    if args.command=='security': print(json.dumps(audit_source_tree(Path('src/foxyya')),indent=2)); return
    cfg=load_runtime_config(Path(args.config)); nav=float(args.initial_nav if args.initial_nav is not None else cfg['initial_nav_usdt'])
    ledger=EventLedger(Path(args.db)); runner=ForwardRunner(ledger,initial_nav=nav)
    if args.command=='status':
        print(json.dumps({'state':replay_books(ledger,nav),'diagnostics':runner.diagnostics(int(time.time()*1000)),'config':cfg},indent=2)); ledger.close(); return
    builder=PublicSnapshotBuilder(PublicBinanceClient())
    if args.command=='cycle': print(json.dumps(cycle(ledger,runner,builder,int(time.time()*1000)),indent=2)); ledger.close(); return
    try:
        while True:
            now=int(time.time()*1000)
            try: print(json.dumps(cycle(ledger,runner,builder,now),ensure_ascii=False),flush=True)
            except Exception as e: print(json.dumps({'time_ms':now,'error':type(e).__name__,'message':str(e),'fills_frozen':True}),flush=True)
            time.sleep(max(5,args.interval))
    finally: ledger.close()
if __name__=='__main__': main()
