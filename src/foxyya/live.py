from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor, as_completed
from .market import filter_closed_klines
from .universe import build_universe

HOUR=3_600_000

def _bar(r,closed=True):
    return {'open_time_ms':int(r[0]),'open':float(r[1]),'high':float(r[2]),'low':float(r[3]),'close':float(r[4]),
            'volume':float(r[5]),'close_ms':int(r[6]),'closed':closed}

def _step(symbol_info):
    for f in symbol_info.get('filters',[]):
        if f.get('filterType') in ('LOT_SIZE','MARKET_LOT_SIZE'):
            try:
                x=float(f.get('stepSize',0))
                if x>0:return x
            except:pass
    return .001

class PublicSnapshotBuilder:
    """Builds scanner snapshots from public market methods only, with in-process caching."""
    def __init__(self,client,max_workers=8):
        self.client=client; self.max_workers=max_workers; self._info=None; self._info_at=-10**18
        self._raw_cache={}; self._refresh_at={}
    def _need(self,key,now_ms,interval):
        if key not in self._raw_cache:return True
        age=now_ms-self._refresh_at.get(key,0)
        threshold={'1d':60*60_000,'4h':15*60_000,'1h':60_000}[interval]
        if interval=='1h':
            raw=self._raw_cache[key]
            last_open=int(raw[-1][0]) if raw else -1
            if last_open!=(now_ms//HOUR)*HOUR:return True
        return age>=threshold
    def build(self,*,now_ms,funding_symbols=None):
        if self._info is None or now_ms-self._info_at>=15*60_000:
            self._info=self.client.exchange_info(); self._info_at=now_ms
        tick_list=self.client.ticker_24h(); tickers={x['symbol']:x for x in tick_list}
        uni=build_universe(self._info,tickers,now_ms=now_ms,min_history_days=60,min_quote_volume=5_000_000)
        sym_info={x['symbol']:x for x in self._info.get('symbols',[])}
        jobs=[]
        with ThreadPoolExecutor(max_workers=self.max_workers) as ex:
            for sym in uni['eligible']:
                for interval,limit in (('1d',80),('4h',100),('1h',140)):
                    key=(sym,interval)
                    if self._need(key,now_ms,interval): jobs.append((key,ex.submit(self.client.klines,sym,interval,limit)))
            for key,fut in jobs:
                try:self._raw_cache[key]=fut.result(); self._refresh_at[key]=now_ms
                except Exception:
                    # Keep a prior verified cache; scanner will mark missing symbols if none exists.
                    pass
        premium=self.client.premium_index()
        if isinstance(premium,dict): premium=[premium]
        premium_map={x.get('symbol'):x for x in premium if x.get('symbol')}
        klines={}; steps={}; marks={}; funding={}; opens={}; realized_funding={}
        current_open=(now_ms//HOUR)*HOUR
        for sym in uni['eligible']:
            klines[sym]={}
            for interval in ('1d','4h','1h'):
                raw=self._raw_cache.get((sym,interval),[])
                closed=filter_closed_klines(raw,now_ms)
                klines[sym][interval]=[_bar(r,True) for r in closed]
                if interval=='1h':
                    for r in reversed(raw):
                        if int(r[0])==current_open:
                            opens[sym]=float(r[1]); break
            steps[sym]=_step(sym_info.get(sym,{}))
            p=premium_map.get(sym)
            if p:
                try:marks[sym]=float(p['markPrice'])
                except:pass
                try:funding[sym]=float(p.get('lastFundingRate',0))
                except:funding[sym]=0.0
            if sym not in marks:
                try:marks[sym]=float(tickers[sym].get('lastPrice'))
                except:pass
        for sym in sorted(set(funding_symbols or [])):
            try:
                realized_funding[sym]=self.client.funding_rate(sym,start_time=max(0,now_ms-24*60*60_000),end_time=now_ms,limit=10)
            except Exception:
                realized_funding[sym]=[]
        def ret(sym):
            try:return float(tickers.get(sym,{}).get('priceChangePercent',0))/100
            except:return 0.0
        elig=uni['eligible']; breadth=(sum(ret(s)>0 for s in elig)/len(elig)) if elig else .5
        return {'exchange_info':self._info,'tickers':tickers,'klines':klines,'steps':steps,'marks':marks,'funding_rates':funding,
                'hour_open_prices':opens,'realized_funding':realized_funding,'major_returns':{'BTC':ret('BTCUSDT'),'ETH':ret('ETHUSDT'),'SOL':ret('SOLUSDT')},
                'breadth':breadth,'volatility':'NORMAL','benchmark_return_24h':ret('BTCUSDT'),
                'eligible_universe_count':len(elig),'built_at_ms':int(now_ms)}
