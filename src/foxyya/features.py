from __future__ import annotations
from dataclasses import dataclass
from math import log10

def ema(values,n):
    if not values:return []
    k=2/(n+1); out=[]; e=None
    for x in values:
        e=x if e is None else x*k+e*(1-k); out.append(e)
    return out

def atr(bars,n=14):
    if len(bars)<2:return 0.0
    trs=[]
    for i in range(1,len(bars)):
        h=float(bars[i]['high']); l=float(bars[i]['low']); pc=float(bars[i-1]['close'])
        trs.append(max(h-l,abs(h-pc),abs(l-pc)))
    use=trs[-n:]
    return sum(use)/len(use) if use else 0.0

def trend_state(bars):
    if len(bars)<50:return 'FLAT'
    c=[float(b['close']) for b in bars]
    e20=ema(c,20)[-1]; e50=ema(c,50)[-1]; last=c[-1]
    if last>e20>e50:return 'UP'
    if last<e20<e50:return 'DOWN'
    return 'FLAT'

@dataclass(frozen=True)
class FeatureSet:
    symbol:str
    daily_trend:str
    h4_trend:str
    momentum_1h:float
    momentum_4h:float
    return_24h:float
    relative_strength:float
    quote_volume_24h:float
    volume_quality:float
    atr_1h:float
    atr_4h:float
    atr_extension:float
    compression:float
    structure_quality:float
    long_score:float
    short_score:float
    bars_1d:tuple
    bars_4h:tuple
    bars_1h:tuple

def _ret(bars,lookback):
    if len(bars)<=lookback:return 0.0
    a=float(bars[-1-lookback]['close']); b=float(bars[-1]['close'])
    return b/a-1 if a else 0.0

def _volume_quality(bars):
    if len(bars)<5:return 1.0
    prev=[float(x['volume']) for x in bars[-4:-1]]
    avg=sum(prev)/len(prev) if prev else 0
    return float(bars[-1]['volume'])/avg if avg else 1.0

def _compression(bars):
    if len(bars)<8:return 1.0
    ranges=[float(b['high'])-float(b['low']) for b in bars[-8:]]
    recent=sum(ranges[-3:])/3
    prior=sum(ranges[:5])/5
    return recent/prior if prior else 1.0

def _structure_quality(bars):
    if len(bars)<6:return 0.5
    closes=[float(x['close']) for x in bars[-6:]]
    diffs=[closes[i]-closes[i-1] for i in range(1,len(closes))]
    pos=sum(d>0 for d in diffs); neg=sum(d<0 for d in diffs)
    return (pos-neg)/max(1,len(diffs))

def compute_features(symbol,bars_1d,bars_4h,bars_1h,*,quote_volume_24h,return_24h,benchmark_return_24h):
    d=trend_state(bars_1d); h=trend_state(bars_4h)
    mom1=_ret(bars_1h,6); mom4=_ret(bars_4h,3); rs=return_24h-benchmark_return_24h
    aq=atr(bars_1h,14); a4=atr(bars_4h,14)
    last_range=(float(bars_1h[-1]['high'])-float(bars_1h[-1]['low'])) if bars_1h else 0
    ext=last_range/aq if aq else 0.0
    volq=_volume_quality(bars_1h); comp=_compression(bars_1h); struct=_structure_quality(bars_1h)
    liq=min(1.0,max(0.0,(log10(max(1,quote_volume_24h))-6)/3))
    trend_long=(1 if d=='UP' else -1 if d=='DOWN' else 0)+(1 if h=='UP' else -1 if h=='DOWN' else 0)
    trend_short=-trend_long
    mom_component=max(-1,min(1,(mom1+mom4)*5))
    rs_component=max(-1,min(1,rs*5))
    vol_component=max(-1,min(1,(volq-1)))
    comp_bonus=max(-1,min(1,1-comp))
    long_score=50+12*trend_long+10*mom_component+10*rs_component+5*liq+4*vol_component+4*struct+2*comp_bonus
    short_score=50+12*trend_short-10*mom_component-10*rs_component+5*liq-4*vol_component-4*struct+2*comp_bonus
    return FeatureSet(symbol,d,h,mom1,mom4,return_24h,rs,quote_volume_24h,volq,aq,a4,ext,comp,struct,
                      max(0,min(100,long_score)),max(0,min(100,short_score)),tuple(bars_1d),tuple(bars_4h),tuple(bars_1h))
