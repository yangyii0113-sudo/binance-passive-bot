from __future__ import annotations
import math
from decimal import Decimal, ROUND_FLOOR

FEE=.0005
SLIPPAGE=.0003
FUNDING_RESERVE=.0001
RISK_FRACTIONS={'A':.005,'B':.0035,'C':.002,'D':.0035}
PORTFOLIO_CAP=.015
SYMBOL_CAP=.005
BUCKET_CAP=.01

def _finite(*xs):
    if not all(isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x) for x in xs):
        raise ValueError('non-finite input')

def _floor_step(q,step):
    return float((Decimal(str(q))/Decimal(str(step))).to_integral_value(rounding=ROUND_FLOOR)*Decimal(str(step)))

def size_position(nav,family,side,raw_open,stop,step,*,quality='NORMAL',risk_fraction_override=None,budget_cap_usdt=None,max_qty=None):
    _finite(nav,raw_open,stop,step)
    if nav<=0 or raw_open<=0 or stop<=0 or step<=0 or family not in RISK_FRACTIONS or side not in ('LONG','SHORT'):
        raise ValueError('invalid sizing input')
    direction=1 if side=='LONG' else -1
    if direction*(raw_open-stop)<=0: raise ValueError('structure stop on wrong side')
    fraction=RISK_FRACTIONS[family]
    if family=='D' and quality=='HIGH': fraction=.005
    if family=='C' and quality=='HIGH': fraction=.0025
    if risk_fraction_override is not None:
        _finite(risk_fraction_override)
        if risk_fraction_override<=0 or risk_fraction_override>.005: raise ValueError('invalid override')
        fraction=float(risk_fraction_override)
    budget=nav*fraction
    if budget_cap_usdt is not None:
        _finite(budget_cap_usdt); budget=min(budget,float(budget_cap_usdt))
    entry_fill=raw_open*(1+direction*SLIPPAGE)
    stop_fill=stop*(1-direction*SLIPPAGE)
    unit_price_loss=direction*(entry_fill-stop_fill)
    if unit_price_loss<=0: raise ValueError('invalid modeled stop loss')
    unit_entry_fee=entry_fill*FEE
    unit_exit_fee=stop_fill*FEE
    unit_funding=entry_fill*FUNDING_RESERVE
    unit_total=unit_price_loss+unit_entry_fee+unit_exit_fee+unit_funding
    qty=_floor_step(budget/unit_total,step)
    if max_qty is not None: qty=min(qty,float(max_qty))
    if qty<=0: raise ValueError('risk budget smaller than minimum lot')
    planned=qty*unit_total
    return {
        'nav_usdt':nav,'family':family,'side':side,'qty':qty,'step':step,
        'raw_open':raw_open,'entry_fill':entry_fill,'stop':stop,'stop_fill':stop_fill,
        'risk_fraction':fraction,'risk_budget_usdt':budget,'planned_loss_usdt':planned,
        'price_stop_loss_usdt':qty*unit_price_loss,'entry_fee_usdt':qty*unit_entry_fee,
        'exit_fee_at_stop_usdt':qty*unit_exit_fee,'funding_reserve_usdt':qty*unit_funding,
        'notional_usdt':qty*entry_fill,'cost_model':{'fee_each_side':FEE,'adverse_slippage_each_side':SLIPPAGE,'funding_reserve':FUNDING_RESERVE},
    }

def leverage_books(size,*,maintenance_proxy=.01,safety_buffer=.02,mark_basis_buffer=.005):
    stop_distance=abs(size['entry_fill']-size['stop_fill'])/size['entry_fill']
    required=stop_distance+maintenance_proxy+safety_buffer+mark_basis_buffer+2*FEE+FUNDING_RESERVE
    out={}
    for lev,role in ((5,'primary'),(8,'aggressive_comparison'),(10,'stress_comparison')):
        buffer=1/lev-required
        ok=buffer>0
        out[f'{lev}x']={'role':role,'requested_leverage':lev,'effective_leverage':lev if ok else None,
                        'status':'MODEL_PASS' if ok else 'REJECT_BUFFER','qty':size['qty'] if ok else 0,
                        'margin_usdt':size['notional_usdt']/lev if ok else 0.0,
                        'planned_loss_usdt':size['planned_loss_usdt'] if ok else 0.0,
                        'modeled_buffer_fraction':buffer,
                        'maintenance_status':'STRESS_PROXY_NOT_EXCHANGE_VERIFIED'}
    return out

class RiskBook:
    def __init__(self,nav,portfolio_cap=PORTFOLIO_CAP,bucket_cap=BUCKET_CAP,symbol_cap=SYMBOL_CAP):
        _finite(nav,portfolio_cap,bucket_cap,symbol_cap)
        self.nav=float(nav); self.portfolio_cap=float(portfolio_cap); self.bucket_cap=float(bucket_cap); self.symbol_cap=float(symbol_cap)
        self.reservations={}
    @property
    def total_fraction(self): return sum(x['fraction'] for x in self.reservations.values())
    def bucket_fraction(self,bucket): return sum(x['fraction'] for x in self.reservations.values() if x['bucket']==bucket)
    def symbol_fraction(self,symbol): return sum(x['fraction'] for x in self.reservations.values() if x['symbol']==symbol)
    def reserve(self,intent_id,symbol_pos,bucket,fraction,*,symbol=None):
        sym = symbol if symbol is not None else symbol_pos
        if intent_id in self.reservations:
            old=self.reservations[intent_id]
            return old=={'symbol':sym,'bucket':bucket,'fraction':fraction}
        _finite(fraction)
        if fraction<=0:return False
        if self.total_fraction+fraction>self.portfolio_cap+1e-12:return False
        if self.bucket_fraction(bucket)+fraction>self.bucket_cap+1e-12:return False
        if self.symbol_fraction(sym)+fraction>self.symbol_cap+1e-12:return False
        self.reservations[intent_id]={'symbol':sym,'bucket':bucket,'fraction':float(fraction)}
        return True
    def release(self,intent_id): return self.reservations.pop(intent_id,None)
