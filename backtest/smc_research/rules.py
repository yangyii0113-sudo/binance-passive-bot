"""Causal SMC v1 definitions; hypotheses, not claims about institutional orders."""
from math import isfinite
from foxyya.features import atr

VERSION = 'SMC-RESEARCH-1'


def analyze(bars, width=2):
    if width < 1:
        raise ValueError('pivot width must be positive')
    previous = None
    for b in bars:
        values = [float(b[k]) for k in ('open','high','low','close')]
        o,h,l,c = values
        if (b.get('closed') is not True or not all(isfinite(v) and v>0 for v in values)
                or not l<=min(o,c)<=max(o,c)<=h
                or (previous is not None and int(b['close_ms'])-previous != 3600000)):
            raise ValueError('require contiguous, finite, fully closed hourly OHLC')
        previous = int(b['close_ms'])
    out = dict(pivots=[], breaks=[], sweeps=[], gaps=[], blocks=[])
    levels = {}; consumed = set(); trend = None
    for i,b in enumerate(bars):
        # Levels must have been confirmed before this candle opened.
        for side,key,op in [('LONG','high',1),('SHORT','low',-1)]:
            p = levels.get(key)
            if p is None: continue
            level=p['price']; identity=(key,p['index'])
            if identity in consumed: continue
            if op*(float(b['close'])-level)>0:
                kind='CHOCH' if trend and trend!=side else 'BOS' if trend==side else 'INITIAL_BREAK'
                out['breaks'].append(dict(index=i,side=side,kind=kind,level=level,pivot=p['index']))
                consumed.add(identity); trend=side
                # Last opposite candle before displacement, at most 6 bars back.
                for j in range(i-1,max(-1,i-7),-1):
                    if op*(float(bars[j]['close'])-float(bars[j]['open']))<0:
                        out['blocks'].append(dict(index=i,origin=j,side=side,low=float(bars[j]['low']),high=float(bars[j]['high'])))
                        break
            elif op*(float(b[key])-level)>0 and op*(float(b['close'])-level)<0:
                out['sweeps'].append(dict(index=i,side='SHORT' if side=='LONG' else 'LONG',level=level,extreme=float(b[key])))
        if i>=2:
            a=bars[i-2]; middle=bars[i-1]
            for side,lo,hi,sign in [('LONG',float(a['high']),float(b['low']),1),('SHORT',float(b['high']),float(a['low']),-1)]:
                if hi>lo and sign*(float(middle['close'])-float(middle['open']))>0:
                    out['gaps'].append(dict(index=i,side=side,low=lo,high=hi))
        pidx=i-width
        if pidx>=width:
            for key,sign in [('high',1),('low',-1)]:
                price=float(bars[pidx][key])
                if all(sign*(price-float(bars[j][key]))>0 for j in range(pidx-width,i+1) if j!=pidx):
                    p=dict(index=pidx,confirmed=i,kind=key,price=price)
                    out['pivots'].append(p); levels[key]=p
    return out


def evaluate(bars, side):
    if side not in ('LONG','SHORT'): raise ValueError('invalid side')
    a=analyze(bars); n=len(bars)-1
    reject=lambda reason: dict(qualified=False,reason=reason,side=side)
    if len(bars)<12: return reject('WARMUP')
    sign=1 if side=='LONG' else -1
    breaks=[x for x in a['breaks'] if x['side']==side and 1<=n-x['index']<=6]
    for br in reversed(breaks):
        # Opposite structure break after setup invalidates it.
        if any(x['index']>br['index'] and x['side']!=side for x in a['breaks']): continue
        sweeps=[x for x in a['sweeps'] if x['side']==side and 0<br['index']-x['index']<=12]
        blocks=[x for x in a['blocks'] if x['side']==side and x['index']==br['index']]
        gaps=[x for x in a['gaps'] if x['side']==side and br['index']<=x['index']<=br['index']+2 and x['index']<n]
        if not (sweeps and blocks and gaps): continue
        sweep=sweeps[-1]; block=blocks[-1]; gap=gaps[0]
        lo=gap['low']; hi=gap['high']
        if lo>=hi: continue
        # First post-formation touch only. Close through OB invalidates setup.
        prior=bars[gap['index']+1:n]
        if any(float(x['low'])<=hi and float(x['high'])>=lo for x in prior): continue
        edge=block['low'] if side=='LONG' else block['high']
        if any(sign*(float(x['close'])-edge)<0 for x in bars[br['index']+1:n+1]): continue
        last=bars[-1]; c=float(last['close'])
        confirm=c>hi if side=='LONG' else c<lo
        if float(last['low'])<=hi and float(last['high'])>=lo and confirm:
            stop=(min(block['low'],sweep['extreme'])-.1*atr(bars,14) if side=='LONG'
                  else max(block['high'],sweep['extreme'])+.1*atr(bars,14))
            if sign*(c-stop)<=0: continue
            return dict(qualified=True,reason='SWEEP_STRUCTURE_FVG_OB_RETEST',side=side,
                        stop=stop,trigger=c,structure=br,zone=[lo,hi],invalidation_close=edge,
                        setup_id=f"{side}:{bars[br['index']]['close_ms']}")
    return reject('SEQUENCE_INCOMPLETE_OR_INVALIDATED')
