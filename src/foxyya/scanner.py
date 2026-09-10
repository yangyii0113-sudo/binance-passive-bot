from __future__ import annotations
from .model import deterministic_id
from .universe import build_universe
from .features import compute_features
from .router import classify_regime, rank_candidates
from .setups import evaluate_candidate

VERSION='FOXYYA-EXEC-V2-RC1-D-OFF-20260911'

def _ticker_map(x):
    return {r['symbol']:r for r in x} if isinstance(x,list) else x

def _pct(t):
    try:return float(t.get('priceChangePercent',0))/100
    except:return 0.0

def scan_snapshot(snapshot,*,now_ms,ledger,execution_engine):
    scan_id=deterministic_id('scan',VERSION,int(now_ms))
    tickers=_ticker_map(snapshot['tickers'])
    uni=build_universe(snapshot['exchange_info'],tickers,now_ms=now_ms,
                       min_history_days=snapshot.get('min_history_days',60),
                       min_quote_volume=snapshot.get('min_quote_volume',5_000_000))
    for sym,rec in uni['records'].items():
        ledger.append({'event_id':deterministic_id('universe',scan_id,sym),'kind':'UNIVERSE_CLASSIFIED','scan_id':scan_id,
                       'time_ms':int(now_ms),'symbol':sym,**rec})
    feats=[]; insufficient=[]
    for sym in uni['eligible']:
        d=snapshot.get('klines',{}).get(sym,{})
        if not all(d.get(tf) for tf in ('1d','4h','1h')):
            insufficient.append(sym); continue
        t=tickers.get(sym,{})
        try:qv=float(t.get('quoteVolume',0))
        except:qv=0.0
        feats.append(compute_features(sym,d['1d'],d['4h'],d['1h'],quote_volume_24h=qv,
                      return_24h=_pct(t),benchmark_return_24h=float(snapshot.get('benchmark_return_24h',0))))
    regime=classify_regime(snapshot.get('major_returns',{}),breadth=float(snapshot.get('breadth',.5)),
                           volatility=snapshot.get('volatility','NORMAL'))
    ranks=rank_candidates(feats,regime)
    for side_key,side in (('long','LONG'),('short','SHORT')):
        for rank,f in enumerate(ranks[side_key],1):
            ledger.append({'event_id':deterministic_id('rank',scan_id,side,f.symbol),'kind':'CANDIDATE_RANKED','scan_id':scan_id,
                           'time_ms':int(now_ms),'symbol':f.symbol,'side':side,'rank':rank,
                           'score':f.long_score if side=='LONG' else f.short_score,'regime':regime})
    qualified=[]; intents=[]; seen=set()
    for side_key,side in (('long','LONG'),('short','SHORT')):
        for rank,f in enumerate(ranks[side_key],1):
            candidate_id=deterministic_id('candidate',VERSION,f.symbol,side,int(f.bars_1h[-1]['close_ms']))
            ledger.append({'event_id':deterministic_id('watch',scan_id,candidate_id),'kind':'SIGNAL_WATCH','scan_id':scan_id,
                           'candidate_id':candidate_id,'symbol':f.symbol,'side':side,'rank':rank,'regime':regime,'time_ms':int(now_ms)})
            want='UP' if side=='LONG' else 'DOWN'
            if f.daily_trend==want and f.h4_trend==want:
                ledger.append({'event_id':deterministic_id('armed',scan_id,candidate_id),'kind':'SIGNAL_ARMED','scan_id':scan_id,
                               'candidate_id':candidate_id,'symbol':f.symbol,'side':side,'rank':rank,'regime':regime,'time_ms':int(now_ms)})
            dec=evaluate_candidate(f,side,regime,rank)
            if not dec.qualified:
                ledger.append({'event_id':deterministic_id('reject_signal',scan_id,candidate_id),'kind':'SIGNAL_REJECTED','scan_id':scan_id,
                               'candidate_id':candidate_id,'symbol':f.symbol,'side':side,'rank':rank,'regime':regime,
                               'family':dec.family,'reason':dec.reason,'decision_close_ms':int(f.bars_1h[-1]['close_ms']),
                               'reference_price':float(f.bars_1h[-1]['close']),'time_ms':int(now_ms)})
                continue
            if dec.signal_id in seen: continue
            seen.add(dec.signal_id); qualified.append(dec)
            step=float(snapshot.get('steps',{}).get(f.symbol,.001))
            ref=float(f.bars_1h[-1]['close'])
            if f.symbol.startswith('BTC'):bucket='BTC_BETA'
            elif f.symbol.startswith('ETH'):bucket='ETH_BETA'
            else:bucket=f'CRYPTO_ALT_DIRECTIONAL_{side}'
            intent=execution_engine.create_intent(dec,decision_persist_ms=int(now_ms),reference_price=ref,step=step,bucket=bucket)
            intents.append(intent)
    funnel={'eligible':len(uni['eligible']),'candidate':len(feats)*2,'qualified':len(qualified),
            'executable':len(qualified),'intents':sum(x.get('kind')=='INTENT_CREATED' for x in intents),'filled':0}
    cutoff=max((int(f.bars_1h[-1]['close_ms']) for f in feats if f.bars_1h),default=None)
    summary=ledger.append({'event_id':deterministic_id('summary',scan_id),'kind':'SCAN_SUMMARY','scan_id':scan_id,'time_ms':int(now_ms),
                 'decision_cutoff_ms':cutoff,'regime':regime,'funnel':funnel,'eligible_universe_count':len(uni['eligible']),
                 'data_insufficient_features':insufficient,'real_orders':False})
    return {'scan_id':scan_id,'regime':regime,'universe':uni,'features':feats,'ranks':ranks,'decisions':qualified,'intents':intents,'funnel':funnel,'summary':summary}
