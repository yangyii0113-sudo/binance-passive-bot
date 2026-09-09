from __future__ import annotations
import hashlib, json
from enum import Enum

class SignalState(str, Enum):
    WATCH='WATCH'; ARMED='ARMED'; EXECUTABLE='EXECUTABLE'; PENDING_INTENT='PENDING_INTENT'
    OPEN='OPEN'; PARTIAL='PARTIAL'; CLOSED='CLOSED'
    CANCELLED_STRUCTURE_INVALID='CANCELLED_STRUCTURE_INVALID'
    CANCELLED_GAP_RISK='CANCELLED_GAP_RISK'
    CANCELLED_VOLATILITY_EXPANSION='CANCELLED_VOLATILITY_EXPANSION'
    CANCELLED_PORTFOLIO_RISK='CANCELLED_PORTFOLIO_RISK'
    CANCELLED_CORRELATION_LIMIT='CANCELLED_CORRELATION_LIMIT'
    CANCELLED_DATA_STALE='CANCELLED_DATA_STALE'
    CANCELLED_EXECUTION_WINDOW='CANCELLED_EXECUTION_WINDOW'

CANCELLED={s for s in SignalState if s.value.startswith('CANCELLED_')}
ALLOWED={
    SignalState.WATCH:{SignalState.ARMED}|CANCELLED,
    SignalState.ARMED:{SignalState.EXECUTABLE}|CANCELLED,
    SignalState.EXECUTABLE:{SignalState.PENDING_INTENT}|CANCELLED,
    SignalState.PENDING_INTENT:{SignalState.OPEN}|CANCELLED,
    SignalState.OPEN:{SignalState.PARTIAL,SignalState.CLOSED},
    SignalState.PARTIAL:{SignalState.PARTIAL,SignalState.CLOSED},
    SignalState.CLOSED:set(),
}
for state in CANCELLED: ALLOWED[state]=set()

def validate_transition(old:SignalState,new:SignalState)->bool:
    return new in ALLOWED.get(old,set())

def deterministic_id(*parts)->str:
    raw=json.dumps(parts,ensure_ascii=False,separators=(',',':'),sort_keys=False)
    return hashlib.sha256(raw.encode()).hexdigest()
