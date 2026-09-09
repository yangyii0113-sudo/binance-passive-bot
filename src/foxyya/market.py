from __future__ import annotations
import json, time, urllib.parse, urllib.request

BASE='https://fapi.binance.com'
PUBLIC_PATHS={
    'exchange_info':'/fapi/v1/exchangeInfo',
    'ticker_24h':'/fapi/v1/ticker/24hr',
    'klines':'/fapi/v1/klines',
    'premium_index':'/fapi/v1/premiumIndex',
    'funding_rate':'/fapi/v1/fundingRate',
}

def filter_closed_klines(rows,now_ms):
    return [r for r in rows if len(r)>6 and int(r[6]) < int(now_ms)]

def stale(source_ms,now_ms,max_age_ms):
    return int(now_ms)-int(source_ms) > int(max_age_ms)

class PublicBinanceClient:
    """Public Binance USD-M reader only. No credentials or signed methods exist."""
    def __init__(self,base=BASE,timeout=8): self.base=base.rstrip('/'); self.timeout=timeout
    def _get(self,path,params=None):
        if path not in PUBLIC_PATHS.values(): raise ValueError('public path not allowed')
        q=('?'+urllib.parse.urlencode(params)) if params else ''
        req=urllib.request.Request(self.base+path+q,headers={'User-Agent':'FOXYYA-Execution-V2-Paper/1'})
        with urllib.request.urlopen(req,timeout=self.timeout) as r:
            return json.loads(r.read().decode())
    def exchange_info(self): return self._get(PUBLIC_PATHS['exchange_info'])
    def ticker_24h(self): return self._get(PUBLIC_PATHS['ticker_24h'])
    def klines(self,symbol,interval,limit=200,start_time=None,end_time=None):
        p={'symbol':symbol,'interval':interval,'limit':limit}
        if start_time is not None:p['startTime']=int(start_time)
        if end_time is not None:p['endTime']=int(end_time)
        return self._get(PUBLIC_PATHS['klines'],p)
    def premium_index(self,symbol=None):
        return self._get(PUBLIC_PATHS['premium_index'],{'symbol':symbol} if symbol else None)
    def funding_rate(self,symbol,start_time=None,end_time=None,limit=100):
        p={'symbol':symbol,'limit':limit}
        if start_time is not None:p['startTime']=int(start_time)
        if end_time is not None:p['endTime']=int(end_time)
        return self._get(PUBLIC_PATHS['funding_rate'],p)
