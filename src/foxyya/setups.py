from __future__ import annotations
from dataclasses import dataclass
from .model import deterministic_id

VERSION='FOXYYA-EXEC-V2-RC1-D-OFF-20260911'

@dataclass(frozen=True)
class SignalDecision:
    symbol:str; side:str; family:str; qualified:bool; reason:str; rank:int; regime:str
    signal_id:str|None=None; decision_close_ms:int|None=None; stop:float|None=None
    trigger:float|None=None; action:str='ENTRY'; quality:str='NORMAL'

def _align(f,side):
    want='UP' if side=='LONG' else 'DOWN'
    return f.daily_trend==want and f.h4_trend==want

def _closed(bars):
    return bool(bars) and all(b.get('closed',True) for b in bars)

def _q(f,side,family,rank,regime,reason,stop,trigger,action='ENTRY',quality='NORMAL'):
    b=f.bars_1h[-1]
    sid=deterministic_id('signal',VERSION,f.symbol,side,family,action,b['close_ms'])
    return SignalDecision(f.symbol,side,family,True,reason,rank,regime,sid,int(b['close_ms']),float(stop),float(trigger),action,quality)

def _r(f,side,family,rank,regime,reason,action='ENTRY'):
    return SignalDecision(f.symbol,side,family,False,reason,rank,regime,action=action)

def evaluate_A(f,side,regime,rank):
    bars=list(f.bars_1h)
    if len(bars)<8 or not _closed(bars):return _r(f,side,'A',rank,regime,'CLOSED_BAR_OR_HISTORY_REQUIRED')
    if not _align(f,side):return _r(f,side,'A',rank,regime,'HTF_MISALIGNMENT')
    s=1 if side=='LONG' else -1
    impulse=bars[-4]; p1,p2,last=bars[-3],bars[-2],bars[-1]
    prior=bars[:-4]
    if side=='LONG':
        prior_level=max(float(x['high']) for x in prior)
        breakout=float(impulse['close'])>prior_level
        retest=min(float(p1['low']),float(p2['low'])) < float(impulse['high']) and min(float(p1['close']),float(p2['close']))>prior_level
        confirm=float(last['close'])>max(float(impulse['high']),float(p1['high']),float(p2['high']))
        stop=min(float(p1['low']),float(p2['low']))
        trigger=max(float(impulse['high']),float(p1['high']),float(p2['high']))
    else:
        prior_level=min(float(x['low']) for x in prior)
        breakout=float(impulse['close'])<prior_level
        retest=max(float(p1['high']),float(p2['high'])) > float(impulse['low']) and max(float(p1['close']),float(p2['close']))<prior_level
        confirm=float(last['close'])<min(float(impulse['low']),float(p1['low']),float(p2['low']))
        stop=max(float(p1['high']),float(p2['high']))
        trigger=min(float(impulse['low']),float(p1['low']),float(p2['low']))
    if breakout and retest and confirm:return _q(f,side,'A',rank,regime,'STRUCTURE_PULLBACK_CONFIRMED',stop,trigger)
    return _r(f,side,'A',rank,regime,'PULLBACK_SEQUENCE_INCOMPLETE')

def evaluate_B(f,side,regime,rank):
    bars=list(f.bars_1h)
    if len(bars)<8 or not _closed(bars):return _r(f,side,'B',rank,regime,'CLOSED_BAR_OR_HISTORY_REQUIRED')
    if not _align(f,side):return _r(f,side,'B',rank,regime,'HTF_MISALIGNMENT')
    if rank>5:return _r(f,side,'B',rank,regime,'NOT_TOP_TIER')
    if not (0.35<=f.atr_extension<=1.60):return _r(f,side,'B',rank,regime,'ATR_EXTENSION_NOT_CONTROLLED')
    prev=bars[-4:-1]; last=bars[-1]
    avgvol=sum(float(x['volume']) for x in prev)/3
    if float(last['volume'])<avgvol*1.05:return _r(f,side,'B',rank,regime,'VOLUME_CONFIRMATION_WEAK')
    if side=='LONG':
        trigger=max(float(x['high']) for x in prev)
        higher_low=float(prev[-1]['low'])>=min(float(x['low']) for x in prev[:-1])
        br=float(last['close'])>trigger
        stop=min(float(x['low']) for x in prev)
    else:
        trigger=min(float(x['low']) for x in prev)
        higher_low=float(prev[-1]['high'])<=max(float(x['high']) for x in prev[:-1])
        br=float(last['close'])<trigger
        stop=max(float(x['high']) for x in prev)
    if br and higher_low:return _q(f,side,'B',rank,regime,'MOMENTUM_CONTINUATION_CONFIRMED',stop,trigger)
    return _r(f,side,'B',rank,regime,'NO_FRESH_CONTINUATION_BREAK')

def evaluate_C(f,side,regime,rank,*,action='ENTRY',independent_confirmation=False):
    bars=list(f.bars_1h)
    if len(bars)<6 or not _closed(bars):return _r(f,side,'C',rank,regime,'CLOSED_BAR_OR_HISTORY_REQUIRED',action)
    if not _align(f,side):return _r(f,side,'C',rank,regime,'HTF_MISALIGNMENT',action)
    if rank>3:return _r(f,side,'C',rank,regime,'NOT_TOP_RANKED',action)
    if action=='ADD' and not independent_confirmation:return _r(f,side,'C',rank,regime,'ADD_REQUIRES_INDEPENDENT_CONFIRMATION',action)
    prev=bars[-3:-1]; last=bars[-1]
    if side=='LONG':
        trigger=max(float(x['high']) for x in prev); ok=float(last['close'])>trigger; stop=min(float(x['low']) for x in prev)
    else:
        trigger=min(float(x['low']) for x in prev); ok=float(last['close'])<trigger; stop=max(float(x['high']) for x in prev)
    if ok:return _q(f,side,'C',rank,regime,'STARTER_STRUCTURE_CONFIRMED' if action=='ENTRY' else 'ADD_CONFIRMATION_CONFIRMED',stop,trigger,action)
    return _r(f,side,'C',rank,regime,'NO_VALID_STARTER_STRUCTURE',action)

def evaluate_D(f,side,regime,rank):
    bars=list(f.bars_1h)
    if len(bars)<8 or not _closed(bars):return _r(f,side,'D',rank,regime,'CLOSED_BAR_OR_HISTORY_REQUIRED')
    if not _align(f,side):return _r(f,side,'D',rank,regime,'HTF_MISALIGNMENT')
    pre=bars[-7:-1]; last=bars[-1]
    ranges=[float(x['high'])-float(x['low']) for x in pre]
    early=sum(ranges[:3])/3; recent=sum(ranges[-3:])/3
    if not early or recent/early>.78:return _r(f,side,'D',rank,regime,'COMPRESSION_ABSENT')
    av=sum(float(x['volume']) for x in pre[-3:])/3
    if float(last['volume'])<av*1.20:return _r(f,side,'D',rank,regime,'BREAK_VOLUME_WEAK')
    if side=='LONG':
        trigger=max(float(x['high']) for x in pre); ok=float(last['close'])>trigger; stop=min(float(x['low']) for x in pre[-3:])
    else:
        trigger=min(float(x['low']) for x in pre); ok=float(last['close'])<trigger; stop=max(float(x['high']) for x in pre[-3:])
    if ok:return _q(f,side,'D',rank,regime,'COMPRESSION_BREAK_CONFIRMED',stop,trigger,quality='HIGH' if float(last['volume'])>=av*1.5 else 'NORMAL')
    return _r(f,side,'D',rank,regime,'NO_CLOSED_RANGE_BREAK')

def evaluate_candidate(f,side,regime,rank,*,c_action='ENTRY',independent_confirmation=False):
    evaluators=[
        evaluate_A(f,side,regime,rank),
        evaluate_B(f,side,regime,rank),
        evaluate_C(f,side,regime,rank,action=c_action,independent_confirmation=independent_confirmation),
        evaluate_D(f,side,regime,rank),
    ]
    # Research challenger: family D remains computable for diagnostic parity but is not selectable.
    order={'RISK_ON':['B','D','A','C'] if side=='LONG' else ['A','D','B','C'],
           'RISK_OFF':['B','D','A','C'] if side=='SHORT' else ['A','D','B','C'],
           'NEUTRAL_ROTATION':['A','D','B','C']}[regime]
    by={x.family:x for x in evaluators}
    for fam in order:
        if fam=='D':
            continue
        if by[fam].qualified:return by[fam]
    # Deterministic rejection: return the highest-priority non-D family's reason.
    for fam in order:
        if fam!='D':
            return by[fam]
    raise AssertionError('challenger family order must contain a non-D fallback')
