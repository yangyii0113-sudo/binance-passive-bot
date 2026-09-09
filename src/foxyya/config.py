from __future__ import annotations
import json
from pathlib import Path
from . import REAL_ORDER_LOCK

def load_runtime_config(path):
    path=Path(path)
    data={}
    if path.exists(): data=json.loads(path.read_text(encoding='utf-8'))
    nav=float(data.get('initial_nav_usdt',1000.0))
    if nav<=0: raise ValueError('initial_nav_usdt must be positive')
    if data.get('real_order_lock',True) is not True or REAL_ORDER_LOCK is not True:
        raise ValueError('paper-only lock cannot be disabled')
    return {**data,'initial_nav_usdt':nav,'real_order_lock':True}
