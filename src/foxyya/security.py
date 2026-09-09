from __future__ import annotations
from pathlib import Path
from . import REAL_ORDER_LOCK

# Constructed in fragments so the forbidden production literals do not themselves
# become a false-positive in this source file. The audit evaluates the joined text.
def prohibited_tokens():
    return [
        '/fapi/v1/'+'order', '/fapi/v1/'+'leverage', '/fapi/v2/'+'account', '/fapi/v3/'+'account',
        'X-MBX-'+'APIKEY', 'hmac'+'.new', 'signature'+'=', 'withdraw'+'al', '/sa'+'pi/'
    ]

def audit_source_tree(root):
    root=Path(root); hits=[]
    for p in root.rglob('*.py'):
        text=p.read_text(encoding='utf-8')
        for token in prohibited_tokens():
            if token in text:
                hits.append({'file':str(p),'token':token})
    return {'safe':bool(REAL_ORDER_LOCK) and not hits,'real_order_lock':bool(REAL_ORDER_LOCK),'hits':hits}
