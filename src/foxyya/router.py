from __future__ import annotations

def classify_regime(major_returns,*,breadth,volatility='NORMAL'):
    vals=list(major_returns.values())
    avg=sum(vals)/len(vals) if vals else 0
    if avg>=.02 and breadth>=.60 and volatility!='EXTREME': return 'RISK_ON'
    if avg<=-.02 and breadth<=.40: return 'RISK_OFF'
    return 'NEUTRAL_ROTATION'

def rank_candidates(features,regime):
    # same universe on both sides: symmetric evaluation, side-specific score only.
    long=sorted(features,key=lambda x:(x.long_score,x.quote_volume_24h),reverse=True)
    short=sorted(features,key=lambda x:(x.short_score,x.quote_volume_24h),reverse=True)
    return {'regime':regime,'long':long,'short':short}
