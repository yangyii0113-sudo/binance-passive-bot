from __future__ import annotations

DAY=86_400_000
STABLE_BASES={'USDC','USDT','FDUSD','BUSD','TUSD','USDP','DAI','USDE','USDS','PYUSD','FRAX','USD1','USDJ','USTC'}
NON_CRYPTO_BASES={'XAU','XAG','DXY','VIX','SPX','NDX','DJI','WTI','BRENT'}

def build_universe(exchange_info,tickers,*,now_ms,min_history_days=60,min_quote_volume=5_000_000):
    if isinstance(tickers,list): tickers={x.get('symbol'):x for x in tickers if x.get('symbol')}
    records={}; eligible=[]
    for s in exchange_info.get('symbols',[]):
        sym=s.get('symbol',''); base=s.get('baseAsset',''); quote=s.get('quoteAsset','')
        rec={'symbol':sym,'classification':'EXCLUDED','reason':None}
        if s.get('status')!='TRADING': rec['reason']='NOT_TRADING'
        elif s.get('contractType')!='PERPETUAL': rec['reason']='NOT_PERPETUAL'
        elif quote!='USDT': rec['reason']='NON_USDT_QUOTE'
        elif base in STABLE_BASES: rec['reason']='STABLECOIN_BASE'
        elif base in NON_CRYPTO_BASES: rec['reason']='NON_CRYPTO_BASE'
        else:
            t=tickers.get(sym)
            if not t:
                rec.update(classification='DATA_INSUFFICIENT',reason='MISSING_24H_TICKER')
            else:
                onboard=int(s.get('onboardDate') or 0)
                age_days=(int(now_ms)-onboard)/DAY if onboard else 10_000
                if age_days<min_history_days:
                    rec.update(classification='DATA_INSUFFICIENT',reason='INSUFFICIENT_HISTORY')
                else:
                    try:qv=float(t.get('quoteVolume',0))
                    except:qv=0
                    if qv<min_quote_volume: rec['reason']='ILLIQUID'
                    else:
                        rec.update(classification='ELIGIBLE',reason='PASS',quote_volume_24h=qv)
                        eligible.append(sym)
        records[sym]=rec
    counts={'total_seen':len(records),'eligible':sum(r['classification']=='ELIGIBLE' for r in records.values()),
            'excluded':sum(r['classification']=='EXCLUDED' for r in records.values()),
            'data_insufficient':sum(r['classification']=='DATA_INSUFFICIENT' for r in records.values())}
    return {'eligible':sorted(eligible),'records':records,'counts':counts}
